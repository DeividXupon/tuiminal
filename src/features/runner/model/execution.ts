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
