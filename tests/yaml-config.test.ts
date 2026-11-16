import { afterEach, describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "yaml"
import { loadYamlConfiguration } from "../packages/core/src/config/index"
import { resolveConfigurationPath } from "../packages/core/src/config/paths"
import { loadYamlFile } from "../packages/core/src/config/yaml-file"
import { getDefaultShortcuts } from "../packages/core/src/keyboard/bindings"
import { validateConfiguredTheme } from "../packages/core/src/settings/configured-theme"

const roots: string[] = []
function temporaryDirectory() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-yaml-"))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function identity(value: unknown) {
  return value as Record<string, unknown>
}

describe("YAML configuration locations", () => {
  test.each(["database.yml", "git.yml", "runner.yml", "http.yml", "terminal.yml"])(
    "rejects reserved main filename %s before creating any files",
    (filename) => {
      const root = temporaryDirectory()
      for (const name of [filename, filename.toUpperCase()]) {
        const configPath = join(root, "custom", name)
        expect(() => loadYamlConfiguration({ configPath })).toThrow("reserved for a tool")
        expect(() =>
          loadYamlConfiguration({ environment: { TUIMINAL_CONFIG: configPath } }),
        ).toThrow("reserved for a tool")
        expect(existsSync(configPath)).toBe(false)
        expect(readdirSync(root)).toEqual([])
      }
    },
  )

  test("reserved main filenames preserve an existing file without adding siblings", () => {
    const root = temporaryDirectory()
    const configPath = join(root, "Http.YmL")
    const original = "# Existing HTTP configuration\nshortcuts: {}\n"
    writeFileSync(configPath, original)
    expect(() => loadYamlConfiguration({ configPath })).toThrow("reserved for a tool")
    expect(readFileSync(configPath, "utf8")).toBe(original)
    expect(readdirSync(root)).toEqual(["Http.YmL"])
  })

  test("explicit selection beats environment; tools follow the selected main file", () => {
    const root = temporaryDirectory()
    const options = {
      homeDirectory: root,
      cwd: root,
      environment: { XDG_CONFIG_HOME: join(root, "xdg"), TUIMINAL_CONFIG: "env.yml" },
    }
    expect(resolveConfigurationPath(options)).toBe(join(root, "env.yml"))
    expect(resolveConfigurationPath({ ...options, configPath: "~/custom/main.yml" })).toBe(
      join(root, "custom", "main.yml"),
    )
    const loaded = loadYamlConfiguration({ ...options, configPath: "custom/main.yml" })
    expect(loaded.warnings).toEqual([])
    expect(loaded.directory).toBe(join(root, "custom"))
    for (const file of ["main", "database", "git", "runner", "http", "terminal"]) {
      expect(existsSync(join(root, "custom", `${file}.yml`))).toBe(true)
    }
    expect(existsSync(join(root, "env.yml"))).toBe(false)
    expect(existsSync(join(root, "xdg"))).toBe(false)
  })

  test("uses absolute XDG_CONFIG_HOME or falls back to the home config directory", () => {
    const root = temporaryDirectory()
    expect(resolveConfigurationPath({ homeDirectory: root, environment: {} })).toBe(
      join(root, ".config", "tuiminal", "config.yml"),
    )
    expect(
      resolveConfigurationPath({
        homeDirectory: root,
        environment: { XDG_CONFIG_HOME: "relative" },
      }),
    ).toBe(join(root, ".config", "tuiminal", "config.yml"))
    expect(resolveConfigurationPath({ environment: { XDG_CONFIG_HOME: root } })).toBe(
      join(root, "tuiminal", "config.yml"),
    )
  })
})

describe("YAML default upgrades", () => {
  test("preserves comments, user values, empty lists and null while appending missing options", () => {
    const file = join(temporaryDirectory(), "config.yml")
    writeFileSync(
      file,
      '# Personal shortcuts\nshortcuts:\n  quit: "x" # keep this\n  escape: null\n  interrupt: []\n',
    )
    const loaded = loadYamlFile(
      file,
      {
        shortcuts: { quit: ["q"], escape: ["Esc"], interrupt: ["Ctrl+c"], settings: [","] },
        theme: { palette: null },
      },
      identity,
    )
    expect(loaded.warnings).toEqual([])
    expect(loaded.value).toEqual({
      shortcuts: { quit: "x", escape: null, interrupt: [], settings: [","] },
      theme: { palette: null },
    })
    const source = readFileSync(file, "utf8")
    expect(source).toContain("# Personal shortcuts")
    expect(source).toContain('quit: "x" # keep this')
    expect(source).toContain("escape: null")
    expect(source).toContain("interrupt: []")
  })

  test("does not rewrite a complete document on launch", () => {
    const file = join(temporaryDirectory(), "config.yml")
    const original = '# exact formatting\nvalue:   "custom" # trailing comment\n'
    writeFileSync(file, original)
    const modified = statSync(file).mtimeMs
    expect(loadYamlFile(file, { value: "default" }, identity).warnings).toEqual([])
    expect(readFileSync(file, "utf8")).toBe(original)
    expect(statSync(file).mtimeMs).toBe(modified)
  })

  test.each(["value: [unterminated\n", "value: one\nvalue: two\n", "- a sequence\n", "scalar\n"])(
    "invalid YAML stays byte-for-byte unchanged: %s",
    (original) => {
      const file = join(temporaryDirectory(), "config.yml")
      writeFileSync(file, original)
      const loaded = loadYamlFile(file, { value: "default", added: true }, identity)
      expect(loaded.value).toEqual({ value: "default", added: true })
      expect(loaded.warnings).toHaveLength(1)
      expect(loaded.warnings[0]?.file).toBe(file)
      expect(readFileSync(file, "utf8")).toBe(original)
    },
  )

  test("new default conflicts are detected before the document is updated", () => {
    const file = join(temporaryDirectory(), "config.yml")
    const original = "# User changed action A to the newly introduced action B key\na: b\n"
    writeFileSync(file, original)
    const validate = (value: unknown) => {
      const data = identity(value)
      if (data.a === data.b) throw new Error("a and b conflict")
      return data
    }
    const loaded = loadYamlFile(file, { a: "a", b: "b" }, validate)
    expect(loaded.value).toEqual({ a: "a", b: "b" })
    expect(loaded.warnings[0]?.message).toBe("a and b conflict")
    expect(readFileSync(file, "utf8")).toBe(original)
    writeFileSync(file, "a: x # fixed\n")
    expect(loadYamlFile(file, { a: "a", b: "b" }, validate).warnings).toEqual([])
    expect(readFileSync(file, "utf8")).toContain("b: b")
  })

  test("an unreadable location warns and falls back without aborting startup", () => {
    const directory = temporaryDirectory()
    const loaded = loadYamlFile(directory, { value: "default" }, identity)
    expect(loaded.value).toEqual({ value: "default" })
    expect(loaded.warnings).toHaveLength(1)
  })
})

describe("YAML runtime configuration", () => {
  test("fills all six files and retains disabled global shortcuts", () => {
    const configPath = join(temporaryDirectory(), "config.yml")
    writeFileSync(configPath, "shortcuts:\n  workspace:\n    quit: null\n    escape: []\n")
    const loaded = loadYamlConfiguration({ configPath })
    expect(loaded.warnings).toEqual([])
    expect(loaded.main.shortcuts.workspace?.quit).toEqual([])
    expect(loaded.main.shortcuts.workspace?.escape).toEqual([])
    expect(loaded.main.shortcuts.workspace?.database).toEqual(["Alt+1"])
    expect(loaded.main.theme).toEqual({ palette: null, mode: null, colors: {} })
    for (const [tool, shortcuts] of Object.entries(loaded.tools)) {
      expect(Object.keys(shortcuts).length).toBeGreaterThan(0)
      expect(existsSync(join(loaded.directory, `${tool}.yml`))).toBe(true)
    }
  })

  test("invalid main configuration uses defaults while valid tool files remain available", () => {
    const configPath = join(temporaryDirectory(), "config.yml")
    const original = "theme:\n  palette: missing-palette\n"
    writeFileSync(configPath, original)
    const loaded = loadYamlConfiguration({ configPath })
    expect(loaded.warnings).toHaveLength(1)
    expect(loaded.warnings[0]?.file).toBe(configPath)
    expect(loaded.main.shortcuts).toEqual(getDefaultShortcuts("global"))
    expect(loaded.main.theme).toEqual({ palette: null, mode: null, colors: {} })
    expect(readFileSync(configPath, "utf8")).toBe(original)
    expect(existsSync(join(loaded.directory, "http.yml"))).toBe(true)
  })

  test("upgrades preserve equivalent key spellings without adding duplicate identities", () => {
    const root = temporaryDirectory()
    const runnerPath = join(root, "runner.yml")
    writeFileSync(runnerPath, "shortcuts:\n  workspace:\n    Ctrl+S: F24 # custom save\n")
    const loaded = loadYamlConfiguration({ configPath: join(root, "config.yml") })
    expect(loaded.warnings).toEqual([])
    expect(loaded.tools.runner.workspace?.["Ctrl+s"]).toEqual(["F24"])
    expect(readFileSync(runnerPath, "utf8")).toContain("Ctrl+S: F24 # custom save")
    expect(Object.keys(parse(readFileSync(runnerPath, "utf8")).shortcuts.workspace)).not.toContain(
      "Ctrl+s",
    )
  })

  test("rejects genuine same-context duplicate bindings without changing their file", () => {
    const configPath = join(temporaryDirectory(), "config.yml")
    const original = "shortcuts:\n  workspace:\n    quit: [x]\n    settings: [x]\n"
    writeFileSync(configPath, original)
    const loaded = loadYamlConfiguration({ configPath })
    expect(loaded.warnings).toHaveLength(1)
    expect(loaded.main.shortcuts).toEqual(getDefaultShortcuts("global"))
    expect(readFileSync(configPath, "utf8")).toBe(original)
  })

  test("applies YAML theme and Master Key without overwriting JSON preferences", () => {
    const root = temporaryDirectory()
    const directory = join(root, "tuiminal")
    mkdirSync(directory)
    const configPath = join(directory, "config.yml")
    const settingsPath = join(directory, "settings.json")
    const original = JSON.stringify({
      palette: "midnight",
      colorMode: "dark",
      terminalMasterKey: "Ctrl+B",
    })
    writeFileSync(settingsPath, original)
    writeFileSync(
      configPath,
      'theme:\n  palette: nord\n  mode: light\n  colors:\n    canvas: "#123456"\n',
    )
    writeFileSync(join(directory, "terminal.yml"), "masterKey: Ctrl+A\n")
    const configurationUrl = new URL("../packages/core/src/config/index.ts", import.meta.url).href
    const themeUrl = new URL("../packages/core/src/settings/theme.ts", import.meta.url).href
    const script = `
      const config = await import(${JSON.stringify(configurationUrl)});
      const theme = await import(${JSON.stringify(themeUrl)});
      config.initializeYamlConfiguration();
      theme.initializeUiSettings();
      console.log(JSON.stringify({settings:theme.getUiSettings(),colors:theme.COLORS,warnings:config.getYamlConfigurationWarnings()}));
    `
    const child = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      env: { ...process.env, XDG_CONFIG_HOME: root, TUIMINAL_CONFIG: configPath },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(child.exitCode).toBe(0)
    const output = JSON.parse(child.stdout.toString().trim())
    expect(output.warnings).toEqual([])
    expect(output.settings.palette).toBe("nord")
    expect(output.settings.colorMode).toBe("light")
    expect(output.settings.terminalMasterKey).toBe("Ctrl+A")
    expect(output.colors.canvas).toBe("#123456")
    expect(output.colors.text).toBe("#2e3440")
    expect(readFileSync(settingsPath, "utf8")).toBe(original)
  })

  test("invalid Terminal Master Key preserves its file and falls back to JSON inheritance", () => {
    const root = temporaryDirectory()
    const terminalPath = join(root, "terminal.yml")
    const original = "masterKey: Ctrl+C # stays with the terminal process\n"
    writeFileSync(terminalPath, original)
    const loaded = loadYamlConfiguration({ configPath: join(root, "config.yml") })
    expect(loaded.warnings).toHaveLength(1)
    expect(loaded.warnings[0]?.file).toBe(terminalPath)
    expect(loaded.terminalMasterKey).toBe(null)
    expect(readFileSync(terminalPath, "utf8")).toBe(original)
  })

  test("validates partial custom palettes without losing their base", () => {
    expect(
      validateConfiguredTheme({ palette: "nord", mode: "light", colors: { canvas: "#123456" } }),
    ).toEqual({
      palette: "nord",
      mode: "light",
      colors: { canvas: "#123456" },
    })
    for (const value of [
      { palette: "constructor" },
      { mode: "sepia" },
      { colors: { text: "red" } },
      { colors: { unknown: "#123456" } },
      { unexpected: true },
    ])
      expect(() => validateConfiguredTheme(value)).toThrow()
  })
})
