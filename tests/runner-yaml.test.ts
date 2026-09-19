import { afterEach, expect, test } from "bun:test"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  parseRunnerYaml,
  runnerYamlSource,
  validateRunnerYaml,
} from "../packages/feature-runner/src/model/configuration-yaml"
import {
  runnerYamlContext,
  runnerYamlSuggestionDescription,
  runnerYamlSuggestions,
} from "../packages/feature-runner/src/model/yaml-editor"
import { runnerYamlBlock, runnerYamlNewline } from "../packages/feature-runner/src/model/yaml-block"
import { createShellRunnerCommand } from "../packages/feature-runner/src/services/shell-command"
import {
  readRunnerYaml,
  runnerYamlPath,
  saveRunnerYaml,
} from "../packages/feature-runner/src/storage/runner-yaml"
import {
  listSavedRunnerCommands,
  listRunnerFlows,
  saveRunnerCommand,
  saveRunnerFlow,
  saveRunnerSession,
  loadRunnerSession,
} from "../packages/feature-runner/src/storage/runner-settings"
import { RUNNER_YAML_MESSAGES } from "../packages/core/src/i18n/runner-yaml-catalog"
import { RUNNER_YAML_COMPLETION_MESSAGES } from "../packages/core/src/i18n/runner-yaml-completion-catalog"
import { translateUi } from "../packages/core/src/i18n/index"
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const base = mkdtempSync(join(tmpdir(), "runner-yaml-test-"))
  roots.push(base)
  const root = join(base, "project")
  mkdirSync(root)
  return { base, root, settings: join(base, "config", "runner.json") }
}
const build = createShellRunnerCommand("echo build", { id: "build", label: "Build" })
const source = `# Preserve my comments\ncommands:\n  build:\n    command: echo build\n  api:\n    command: |\n      echo server\n      echo ready\n    env:\n      PORT: 3000\n    dependsOn:\n      - commandId: build\n        condition: completed\n    health:\n      type: log\n      pattern: ready\nflows:\n  dev:\n    label: Development\n    stages:\n      - commandIds: [build]\n      - commandIds: [api]\n        waitFor: started\n`
test("YAML validates structured dependencies, flows and multiline literal commands", () => {
  const parsed = validateRunnerYaml(source, [], [])
  expect(parsed.commands[1]).toMatchObject({
    env: { PORT: "3000" },
    command: "echo server\necho ready\n",
    dependsOn: [{ commandId: "build", condition: "completed" }],
    healthCheck: { type: "log", pattern: "ready" },
  })
  expect(parsed.flows[0]?.stages[1]?.waitFor).toBe("started")
  expect(parseRunnerYaml(runnerYamlSource(parsed.commands, parsed.flows))).toEqual(parsed)
  for (const invalid of [
    source.replace("commandId: build", "commandId: missing"),
    source.replace("commandId: build", "commandId: api"),
    source.replace("condition: completed", "condition: finished"),
    source.replace("pattern: ready", "pattern: '['"),
    source.replace("env:", "environemnt:"),
    "commands: [",
    "commands: {}\ncommands: {}",
    source.replace("commandIds: [build]", "commandIds: [api]"),
  ])
    expect(() => validateRunnerYaml(invalid, [], [])).toThrow()
})
test("global YAML preserves comments and legacy sessions, canonical paths and concurrent edits", () => {
  const { base, root, settings } = fixture()
  const alias = join(base, "alias")
  symlinkSync(root, alias, "dir")
  saveRunnerCommand(root, { id: "legacy", label: "Legacy", command: "echo legacy" }, settings)
  saveRunnerSession(
    root,
    { openedProjects: [root], activeProject: root, viewMode: "multi", environmentProfiles: {} },
    settings,
  )
  const legacy = readFileSync(settings, "utf8")
  const snapshot = readRunnerYaml(alias, settings)
  expect(snapshot.path).toBe(runnerYamlPath(root, settings))
  saveRunnerYaml(snapshot.path, source, snapshot.hash)
  expect(listSavedRunnerCommands(root, settings)).toHaveLength(2)
  expect(listRunnerFlows(root, settings)).toHaveLength(1)
  expect(loadRunnerSession(root, settings).viewMode).toBe("multi")
  expect(readFileSync(settings, "utf8")).toBe(legacy)
  saveRunnerCommand(root, { id: "manual", label: "Manual", command: "echo manual" }, settings)
  expect(listSavedRunnerCommands(alias, settings)).toHaveLength(3)
  saveRunnerFlow(
    root,
    {
      id: "another",
      label: "Another",
      autostart: false,
      stages: [{ commandIds: ["manual"], waitFor: "completed" }],
    },
    settings,
  )
  expect(listRunnerFlows(root, settings)).toHaveLength(2)
  expect(readFileSync(snapshot.path, "utf8")).toStartWith("# Preserve my comments")
  expect(() => saveRunnerYaml(snapshot.path, source, snapshot.hash)).toThrow("mudou")
  writeFileSync(snapshot.path, "commands: [")
  expect(listSavedRunnerCommands(root, settings)).toEqual([])
  expect(() =>
    saveRunnerCommand(root, { label: "Do not overwrite", command: "echo no" }, settings),
  ).toThrow()
  expect(readFileSync(snapshot.path, "utf8")).toBe("commands: [")
  expect(readdirSync(root)).toEqual([])
})
test("YAML recommendations cover scalar and flow-list values without editing source", () => {
  const command = runnerYamlContext("commands:\n  local:\n    command: echo", 2)
  expect(runnerYamlSuggestions(command, [build], [])).toEqual(["echo build"])
  const stage = runnerYamlContext("flows:\n  dev:\n    stages:\n      - commandIds: [api, bu", 3)
  expect(runnerYamlSuggestions(stage, [build], [])).toEqual(["build"])
  expect(
    runnerYamlSuggestions(
      runnerYamlContext("commands:\n  local:\n    dependsOn:\n      - commandId: Build", 3),
      [{ ...build, id: "opaque-id" }],
      [],
    ),
  ).toEqual(["opaque-id"])
  expect(
    runnerYamlSuggestions(runnerYamlContext("commands:\n  local:\n    restar", 2), [], []),
  ).toContain("restart")
  expect(
    runnerYamlSuggestions(
      runnerYamlContext("commands:\n  local:\n    restart: on-failur", 2),
      [],
      [],
    ),
  ).toEqual(["on-failure"])
  expect(
    runnerYamlSuggestions(runnerYamlContext("commands:\n  local:\n    restart: alwys", 2), [], []),
  ).toEqual(["always"])
  expect(
    runnerYamlSuggestions(
      runnerYamlContext("commands:\n  local:\n    command: ldskafjdlfja", 2),
      [build],
      [],
    ),
  ).toEqual([])
  expect(
    runnerYamlSuggestions(runnerYamlContext("commands:\n  local:\n    ldskafjdlfja", 2), [], []),
  ).toEqual([])
  expect(
    runnerYamlSuggestions(
      runnerYamlContext("commands:\n  local:\n    restart: ldskafjdlfja", 2),
      [],
      [],
    ),
  ).toEqual([])
  expect(
    runnerYamlSuggestions(
      runnerYamlContext("commands:\n  local:\n    command: |\n      echo", 3),
      [build],
      [],
    ),
  ).toEqual([])
  expect(runnerYamlSuggestions(runnerYamlContext("commands:\n  local", 1), [build], [])).toEqual([
    "local:",
  ])
  for (const row of RUNNER_YAML_MESSAGES)
    for (const [index, language] of (["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const).entries())
      expect(translateUi(row[0], language)).toBe(row[index]!)
  for (const row of RUNNER_YAML_COMPLETION_MESSAGES)
    for (const [index, language] of (["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const).entries())
      expect(translateUi(row[0], language)).toBe(row[index]!)
})

test("YAML completion follows the current mapping and health type", () => {
  const keys = (source: string) => {
    const row = source.split("\n").length - 1
    const context = runnerYamlContext(source, row)
    return runnerYamlSuggestions(context, [build], [])
  }
  expect(keys("flo")).toEqual(["flows"])
  expect(keys("commands:\n  local:\n    resatrt")).toContain("restart")
  expect(keys("flows:\n  dev:\n    resatrt")).not.toContain("restart")
  expect(keys("flows:\n  dev:\n    sta")).toContain("stages")
  expect(keys("profiles:\n  dev:\n    envF")).toEqual(["envFile"])
  expect(keys("commands:\n  local:\n    health:\n      type: log\n      pat")).toEqual(["pattern"])
  expect(keys("commands:\n  local:\n    health:\n      type: port\n      por")).toEqual(["port"])
  expect(keys("commands:\n  local:\n    health:\n      type: http\n      ur")).toEqual(["url"])
  expect(keys("commands:\n  local:\n    healthCheck:\n      type: http\n      ur")).toEqual(["url"])
  expect(keys("commands:\n  local:\n    dependsOn:\n      - com")).toEqual(["commandId"])
  expect(keys("flows:\n  dev:\n    stages:\n      - commandIds: [build]\n        wai")).toEqual([
    "waitFor",
  ])
  expect(keys("commands:\n  local:\n    env:\n      PO")).toEqual(["PO:"])
  expect(keys("commands:\n  local:\n    command: |\n      echo")).toEqual([])
  expect(keys("commands:\n  local:\n    ")).toEqual([
    "label",
    "description",
    "command",
    "cwd",
    "env",
    "envFile",
  ])
  expect(keys("flows:\n  dev:\n    ")).not.toContain("restart")
  const context = runnerYamlContext("flows:\n  dev:\n    stages:\n      - wai", 3)
  expect(runnerYamlSuggestionDescription(context, "waitFor", [build], [])).toEqual({
    text: "Condição para avançar à próxima etapa.",
    translate: true,
  })
})

test("YAML map entries recommend an ID after Enter and continue while typing", () => {
  const suggestions = (source: string) => {
    const row = source.split("\n").length - 1
    const context = runnerYamlContext(source, row)
    return { context, values: runnerYamlSuggestions(context, [], []) }
  }
  expect(suggestions("flows:\n  ").values).toEqual(["dev:"])
  const typed = suggestions("flows:\n  meu-fluxo")
  expect(typed.values).toEqual(["meu-fluxo:"])
  expect(runnerYamlSuggestionDescription(typed.context, typed.values[0]!, [], [])).toEqual({
    text: "ID único do fluxo. Abaixo dele, defina label, autostart e stages.",
    translate: true,
  })
  expect(suggestions("flows:\n  meu-fluxo:").values).toEqual([])
  expect(suggestions("flows:\n  meu-fluxo:\n    sta").values).toContain("stages")
  expect(suggestions("commands:\n  ").values).toEqual(["build:"])
  expect(suggestions("profiles:\n  ").values).toEqual(["development:"])
  expect(suggestions("commands:\n  build:\n    env:\n      ").values).toEqual(["PORT:"])
})

test("YAML newline indents mappings, list entries and literal blocks", () => {
  const newline = (source: string) =>
    runnerYamlNewline(source, source.split("\n").length - 1, source.split("\n").at(-1)!.length)
  expect(newline("commands:")).toBe("\n  ")
  expect(newline("commands:\n  local:")).toBe("\n    ")
  expect(newline("commands:\n  local:\n    health:")).toBe("\n      ")
  expect(newline("commands:\n  local:\n    dependsOn:")).toBe("\n      - ")
  expect(newline("commands:\n  local:\n    dependsOn:\n      - commandId: build")).toBe(
    "\n        ",
  )
  expect(newline("flows:\n  dev:\n    stages:")).toBe("\n      - ")
  expect(newline("flows:\n  dev:\n    stages:\n      - commandIds:")).toBe("\n          - ")
  expect(newline("flows:\n  dev:\n    stages:\n      - commandIds:\n          - build")).toBe(
    "\n          - ",
  )
  expect(newline("commands:\n  local:\n    command: |")).toBe("\n      ")
  expect(newline("commands:\n  local:\n    command: |\n      echo hi")).toBe("\n      ")
  expect(runnerYamlBlock("commands:\n  local:\n    health:\n      type: log\n      ", 4)).toEqual({
    block: "health",
    healthType: "log",
  })
})
