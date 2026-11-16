import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import packageMetadata from "../package.json" with { type: "json" }

async function runCli(...args: string[]) {
  return runCliWith({ args })
}

async function runCliWith({
  args,
  forbidUiImports = false,
  language,
}: {
  args: readonly string[]
  forbidUiImports?: boolean
  language?: string
}) {
  const configRoot = mkdtempSync(resolve(tmpdir(), "tuiminal-cli-test-"))
  try {
    if (language) {
      mkdirSync(resolve(configRoot, "tuiminal"))
      writeFileSync(resolve(configRoot, "tuiminal/settings.json"), JSON.stringify({ language }))
    }
    const command = [
      process.execPath,
      ...(forbidUiImports
        ? ["--preload", resolve("tests/fixtures/cli-version-import-guard.ts")]
        : []),
      resolve("apps/cli/bin/tuiminal.ts"),
      ...args,
    ]
    const subprocess = Bun.spawn(command, {
      cwd: resolve("."),
      env: { ...process.env, XDG_CONFIG_HOME: configRoot },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ])
    return { exitCode, stdout, stderr }
  } finally {
    rmSync(configRoot, { recursive: true, force: true })
  }
}

describe("Tuiminal CLI", () => {
  test("prints its version without mounting the TUI", async () => {
    const result = await runCli("--version")

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(packageMetadata.version)
    expect(result.stderr).toBe("")
  })

  test.each(["--version", "-v"])(
    "%s does not load UI configuration or translation modules",
    async (flag) => {
      const result = await runCliWith({ args: [flag], forbidUiImports: true })
      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim()).toBe(packageMetadata.version)
      expect(result.stderr).toBe("")
    },
  )

  test.each([{ args: ["--version", "--help"] }, { args: ["-h", "-v"] }])(
    "help retains precedence over version and uses the configured language: %j",
    async ({ args }) => {
      const result = await runCliWith({ args, language: "en" })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`Tuiminal ${packageMetadata.version}`)
      expect(result.stdout).toContain("tuiminal <tool> [directory]")
      expect(result.stderr).toBe("")
    },
  )

  test("prints help in Russian when it is the saved language", async () => {
    const result = await runCliWith({ args: ["--help"], language: "ru" })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Использование:")
    expect(result.stdout).toContain("tuiminal <инструмент> [каталог]")
    expect(result.stdout).toContain("Показать эту справку")
    expect(result.stderr).toBe("")
  })

  test("documents the available isolated tools", async () => {
    const result = await runCli("--help")

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("banco, git, runner, http, terminal")
    expect(result.stdout).not.toMatch(/pomo/i)
    expect(result.stdout).toContain("tuiminal <tool> [directory]")
  })

  test("prints help in English when no language is saved", async () => {
    const result = await runCli("--help")
    expect(result.stdout).toContain("Usage:")
    expect(result.stdout).toContain("Show this help")
  })

  test("prints help in Brazilian Portuguese when it is the saved language", async () => {
    const result = await runCliWith({ args: ["--help"], language: "pt-BR" })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Uso:")
    expect(result.stdout).toContain("tuiminal <ferramenta> [diretório]")
  })

  test.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "does not treat the inherited object property %s as an isolated tool",
    async (name) => {
      const result = await runCli(name, "missing-cli-fixture-directory")
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("Provide a tool and, optionally, a directory.")
      expect(result.stderr).not.toContain("Could not open")
      expect(result.stdout).toContain("tuiminal <tool> [directory]")
    },
  )

  test.each(["--config", "--config=", "--config --help", "--config one.yml --config two.yml"])(
    "rejects malformed configuration arguments: %s",
    async (argumentsText) => {
      const result = await runCli(...argumentsText.split(" "))
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("--config")
      expect(result.stdout).toBe("")
    },
  )

  test.each(["argument", "equals", "environment"])(
    "loads YAML and sibling defaults through %s selection without touching the default directory",
    async (selection) => {
      const root = mkdtempSync(resolve(tmpdir(), "tuiminal-cli-yaml-"))
      try {
        const xdg = resolve(root, "xdg")
        const selected = resolve(root, "selected", "custom.yml")
        const environmentPath =
          selection === "environment" ? selected : resolve(root, "ignored", "config.yml")
        const args =
          selection === "argument"
            ? ["--config", selected]
            : selection === "equals"
              ? [`--config=${selected}`]
              : []
        const child = Bun.spawn(
          [process.execPath, resolve("apps/cli/bin/tuiminal.ts"), ...args, "--help"],
          {
            env: { ...process.env, XDG_CONFIG_HOME: xdg, TUIMINAL_CONFIG: environmentPath },
            stdout: "pipe",
            stderr: "pipe",
          },
        )
        const [exitCode, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ])
        expect(exitCode).toBe(0)
        expect(stderr).toBe("")
        expect(stdout).toContain("--config <file>")
        expect(readFileSync(selected, "utf8")).toContain("shortcuts:")
        for (const tool of ["http", "git", "database", "runner", "terminal"]) {
          expect(existsSync(resolve(root, "selected", `${tool}.yml`))).toBe(true)
        }
        expect(existsSync(xdg)).toBe(false)
        expect(existsSync(resolve(root, "ignored"))).toBe(false)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )

  test("invalid YAML never prevents help or overwrites the user's file", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "tuiminal-cli-invalid-yaml-"))
    try {
      const path = resolve(root, "config.yml")
      const original = "theme: [invalid\n# keep this\n"
      writeFileSync(path, original)
      const result = await runCli("--config", path, "--help")
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Usage:")
      expect(readFileSync(path, "utf8")).toBe(original)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
