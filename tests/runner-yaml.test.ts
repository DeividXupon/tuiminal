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
  runnerYamlSuggestions,
  runnerYamlSuggestionLine,
} from "../packages/feature-runner/src/model/yaml-editor"
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
test("YAML completion replaces scalar and flow-list values without changing their keys", () => {
  const command = runnerYamlContext("    command: echo", 0)
  expect(runnerYamlSuggestions(command, [build], [])).toEqual(["echo build"])
  expect(runnerYamlSuggestionLine(command, "echo build")).toBe('    command: "echo build"')
  const stage = runnerYamlContext("      - commandIds: [api, bu", 0)
  expect(runnerYamlSuggestions(stage, [build], [])).toEqual(["build"])
  expect(runnerYamlSuggestionLine(stage, "build")).toBe('      - commandIds: [api, "build"]')
  expect(
    runnerYamlSuggestions(
      runnerYamlContext("commandId: Build", 0),
      [{ ...build, id: "opaque-id" }],
      [],
    ),
  ).toEqual(["opaque-id"])
  expect(runnerYamlSuggestionLine(runnerYamlContext("commandIds:", 0), "build")).toBe(
    'commandIds: ["build"]',
  )
  for (const row of RUNNER_YAML_MESSAGES)
    for (const [index, language] of (["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const).entries())
      expect(translateUi(row[0], language)).toBe(row[index]!)
})
