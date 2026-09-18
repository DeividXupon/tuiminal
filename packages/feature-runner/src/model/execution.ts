import type { RunnerCommand } from "./types"
import type { RunnerLogEntry } from "./log"
export type ExecutionStatus = "running" | "stopping" | "success" | "failed" | "stopped"

export type ExecutionLog = RunnerLogEntry

export type RunnerExecution = {
  id: string
  commandId: string
  commandKey: string
  label: string
  displayCommand: string
  projectRoot: string
  projectName: string
  status: ExecutionStatus
  pid: number | null
  startedAt: number
  endedAt: number | null
  exitCode: number | null
  logs: ExecutionLog[]
  command: RunnerCommand
  restartAttempt: number
  health: "none" | "checking" | "healthy" | "unhealthy"
}

export function executionPlanOutcome(
  stopped: boolean,
  code: number | null,
  hasHealth: boolean,
  healthResolved: boolean,
) {
  if (stopped) return "stopped"
  return code === 0 && (!hasHealth || healthResolved) ? "success" : "failed"
}
export function runnerShouldRestart(
  command: RunnerCommand,
  stopped: boolean,
  code: number | null,
  attempt: number,
) {
  return (
    !stopped &&
    attempt < (command.maxRestarts ?? 5) &&
    (command.restartPolicy === "always" || (command.restartPolicy === "on-failure" && code !== 0))
  )
}
export function runnerLogHealthMatches(pattern: string, line: string) {
  try {
    return new RegExp(pattern, "i").test(line)
  } catch {
    return line.toLocaleLowerCase().includes(pattern.toLocaleLowerCase())
  }
}
