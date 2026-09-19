import { afterEach, expect, test } from "bun:test"
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  statSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  runnerCommandDraft,
  runnerFlowDraft,
  validateRunnerCommandDraft,
  validateRunnerFlowDraft,
} from "../packages/feature-runner/src/model/editor"
import {
  createShellRunnerCommand,
  configuredRunnerCommand,
} from "../packages/feature-runner/src/services/shell-command"
import {
  saveRunnerCommand,
  saveRunnerFlow,
  listRunnerFlows,
  listSavedRunnerCommands,
  saveRunnerSession,
} from "../packages/feature-runner/src/storage/runner-settings"
import { discoverRunnerCommands } from "../packages/feature-runner/src/services/runner"
import { createRunnerAutostartReview } from "../packages/feature-runner/src/storage/autostart-trust"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function temporary() {
  const root = mkdtempSync(join(tmpdir(), "runner-config-test-"))
  roots.push(root)
  return root
}
const build = createShellRunnerCommand("echo build", { id: "build", label: "build" })
const api = createShellRunnerCommand("echo api", { id: "api", label: "api" })
test("validates all command policies and resolves references before saving", () => {
  const source = {
    ...runnerCommandDraft(api),
    env: '{"PORT":"3000"}',
    cwd: "services/api",
    interactive: "true",
    restartPolicy: "on-failure",
    profile: "dev",
    healthCheck: '{"type":"port","port":3000}',
    dependsOn: "build@completed",
    autostart: "true",
  }
  const profiles = [{ id: "dev", label: "Development", env: { MODE: "local" } }]
  expect(validateRunnerCommandDraft(source, api.id, [build, api], profiles)).toMatchObject({
    env: { PORT: "3000" },
    interactive: true,
    profile: "dev",
    healthCheck: { type: "port", timeoutMs: 30000 },
    dependsOn: [{ commandId: "build", condition: "completed" }],
    autostart: true,
  })
  for (const change of [
    { maxRestarts: "101" },
    { interactive: "yes" },
    { healthCheck: '{"type":"http","url":"file:///tmp/x"}' },
    { dependsOn: "missing" },
    { dependsOn: "api" },
    { restartPolicy: "sometimes" },
    { env: '{"PORT":1}' },
    { profile: "unknown" },
  ]) {
    expect(() =>
      validateRunnerCommandDraft({ ...source, ...change }, api.id, [build, api], profiles),
    ).toThrow()
  }
})
test("persists full commands and flow edits by canonical project path without project writes", () => {
  const fixture = temporary(),
    root = join(fixture, "project"),
    alias = join(fixture, "alias"),
    path = join(fixture, "config", "runner.json")
  mkdirSync(root)
  symlinkSync(root, alias, "dir")
  const input = validateRunnerCommandDraft(runnerCommandDraft(api), api.id, [api], [])
  saveRunnerCommand(alias, input, path)
  expect(listSavedRunnerCommands(root, path)).toEqual([input])
  const flow = validateRunnerFlowDraft(
    { ...runnerFlowDraft(), label: "Dev", stages: "build > api@started" },
    "flow:dev",
    [build, api],
  )
  saveRunnerFlow(alias, flow, path)
  saveRunnerFlow(root, { ...flow, label: "Renamed" }, path)
  saveRunnerSession(
    root,
    { openedProjects: [root], activeProject: root, viewMode: "single", environmentProfiles: {} },
    path,
  )
  expect(listRunnerFlows(alias, path)).toHaveLength(1)
  expect(listRunnerFlows(alias, path)[0]?.label).toBe("Renamed")
  expect(listRunnerFlows(fixture, path)).toEqual([])
  expect(statSync(path).mode & 0o777).toBe(0o600)
  expect(readdirSync(root)).toEqual([])
})
test("detected and imported overrides retain IDs and preserve original project files", async () => {
  const root = temporary()
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { dev: "echo dev", test: "echo test" } }),
  )
  mkdirSync(join(root, ".tuiminal"))
  const yaml = "commands:\n  server:\n    command: echo original\n"
  writeFileSync(join(root, ".tuiminal", "runner.yaml"), yaml)
  const commands = await discoverRunnerCommands(root)
  const detected = commands.find((command) => command.category === "package")!
  saveRunnerCommand(root, {
    id: detected.id,
    label: "Overridden",
    command: "echo local",
    interactive: true,
  })
  saveRunnerCommand(root, { id: "tuiminal:server", label: "Local server", command: "echo local" })
  const updated = await discoverRunnerCommands(root)
  expect(updated.filter((command) => command.id === detected.id)).toHaveLength(1)
  expect(updated.find((command) => command.id === detected.id)).toMatchObject({
    displayCommand: "echo local",
    interactive: true,
  })
  expect(updated.filter((command) => command.id === "tuiminal:server")).toHaveLength(1)
  expect(readFileSync(join(root, ".tuiminal", "runner.yaml"), "utf8")).toBe(yaml)
})
test("autostart trust includes transitive dependencies, flow order and command profiles", () => {
  const flow = validateRunnerFlowDraft(
    { label: "dev", stages: "build > api@started", autostart: "true" },
    "flow:dev",
    [build, api],
  )
  const root = temporary()
  const commands = [build, { ...api, profile: "dev" }]
  const profiles = [{ id: "dev", label: "dev", env: { PRIVATE: "one" } }]
  const review = createRunnerAutostartReview(root, commands, undefined, [flow], profiles)!
  expect(review.commands.map((command) => command.id)).toEqual(["api", "build"])
  expect(JSON.stringify(review)).not.toContain('"one"')
  for (const next of [
    createRunnerAutostartReview(
      root,
      [{ ...build, displayCommand: "echo changed" }, api],
      undefined,
      [flow],
      profiles,
    ),
    createRunnerAutostartReview(
      root,
      commands,
      undefined,
      [{ ...flow, stages: [...flow.stages].reverse() }],
      profiles,
    ),
    createRunnerAutostartReview(
      root,
      commands,
      undefined,
      [flow],
      [{ ...profiles[0]!, env: { PRIVATE: "two" } }],
    ),
  ])
    expect(next?.fingerprint).not.toBe(review.fingerprint)
  const dependent = configuredRunnerCommand(
    validateRunnerCommandDraft(
      { ...runnerCommandDraft(api), dependsOn: "build", autostart: "true" },
      api.id,
      [build, api],
      [],
    ),
  )
  expect(
    createRunnerAutostartReview(root, [build, dependent])!.commands.map((command) => command.id),
  ).toEqual(["api", "build"])
})

test("all editor documentation and validation messages have registered translations", async () => {
  const { RUNNER_HELP_MESSAGES } = await import("../packages/core/src/i18n/runner-help-catalog")
  const { RUNNER_VALIDATION_MESSAGES } = await import(
    "../packages/core/src/i18n/runner-validation-catalog"
  )
  const { translateUi } = await import("../packages/core/src/i18n/index")
  for (const tuple of [...RUNNER_HELP_MESSAGES, ...RUNNER_VALIDATION_MESSAGES]) {
    for (const [index, language] of (["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const).entries())
      expect(translateUi(tuple[0], language)).toBe(tuple[index]!)
  }
})
