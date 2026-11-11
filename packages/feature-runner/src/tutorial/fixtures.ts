import type { RunnerExecution } from "../model/execution"
import type { RunnerCommand } from "../model/types"
import { commandKey } from "../rendering/presentation"

export const TUTORIAL_NOW = 1_800_000_000_000
export const TUTORIAL_ROOT = "/demo/runner-project"
export const noop = () => {}
export const TUTORIAL_COMMANDS: RunnerCommand[] = [
  ["dev:api", "bun run dev:api"],
  ["dev:web", "bun run dev:web"],
  ["test", "bun test"],
  ["build", "bun run build"],
].map(([label = "", command = ""]) => ({
  id: label,
  label,
  category: "package",
  description: "package.json",
  program: "bun",
  args: command.split(" ").slice(1),
  displayCommand: command,
}))

export function tutorialExecution(index = 0, stopped = false): RunnerExecution {
  const command = TUTORIAL_COMMANDS[index] ?? TUTORIAL_COMMANDS[0]
  if (!command) throw new Error("Missing Runner tutorial command")
  const status = stopped ? "stopped" : index === 2 ? "success" : index === 3 ? "failed" : "running"
  const lines =
    index === 2
      ? ["42 tests passed", "0 tests failed"]
      : index === 3
        ? ["error: missing demo option", "build failed"]
        : [
            `${command.label} ready · http://127.0.0.1:${index ? 3001 : 3000}`,
            "GET /health 200 · 3ms",
            "GET /api/items 200 · 12ms",
            "cache warm · 8 items",
          ]
  return {
    id: `tutorial-${command.id}`,
    commandId: command.id,
    commandKey: commandKey(TUTORIAL_ROOT, command.id),
    label: command.label,
    displayCommand: command.displayCommand,
    projectRoot: TUTORIAL_ROOT,
    projectName: "runner-project",
    status,
    pid: status === "running" ? 4200 + index : null,
    startedAt: TUTORIAL_NOW - 12_000,
    endedAt: status === "running" ? null : TUTORIAL_NOW,
    exitCode: status === "success" ? 0 : status === "failed" ? 2 : null,
    logs: lines.map((text, i) => ({
      id: i,
      at: TUTORIAL_NOW - 4000 + i * 1000,
      stream: index === 3 ? "stderr" : "stdout",
      text,
    })),
    command,
    restartAttempt: 0,
    health: status === "running" ? "healthy" : "none",
  }
}

export const TUTORIAL_YAML = `commands:
  build:
    command: bun run build
  api:
    command: bun run dev:api
    health: { type: log, pattern: ready }
  web:
    command: bun run dev:web
  test:
    command: bun test
flows:
  development:
    stages:
      - commandIds: [build]
        waitFor: completed
      - commandIds: [api, web]
        waitFor: started
      - commandIds: [test]
        waitFor: completed
profiles:
  local:
    env: { NODE_ENV: development }
`
