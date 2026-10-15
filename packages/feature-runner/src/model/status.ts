import type { ExecutionStatus, RunnerExecution } from "./execution"

export type RunnerVisualStatus = ExecutionStatus | "idle" | "checking" | "unhealthy"
export type RunnerProjectSummary = {
  running: number
  stopping: number
  failed: number
  success: number
  stopped: number
  checking: number
}

export const EMPTY_RUNNER_SUMMARY: RunnerProjectSummary = {
  running: 0,
  stopping: 0,
  failed: 0,
  success: 0,
  stopped: 0,
  checking: 0,
}

export function runnerVisualStatus(execution?: RunnerExecution): RunnerVisualStatus {
  if (!execution) return "idle"
  if (["failed", "stopped", "stopping"].includes(execution.status)) return execution.status
  if (execution.health === "unhealthy") return "unhealthy"
  if (execution.status === "running" && execution.health === "checking") return "checking"
  return execution.status
}

function active(execution: RunnerExecution) {
  return execution.status === "running" || execution.status === "stopping"
}

/** Prefer an active execution; otherwise retain the most recent result per command. */
export function latestRunnerExecutions(executions: readonly RunnerExecution[]) {
  const latest = new Map<string, RunnerExecution>()
  for (const execution of executions) {
    const previous = latest.get(execution.commandKey)
    if (
      !previous ||
      (active(execution) && !active(previous)) ||
      (active(execution) === active(previous) && execution.startedAt > previous.startedAt)
    ) {
      latest.set(execution.commandKey, execution)
    }
  }
  return latest
}

export function runnerProjectSummaries(
  executions: readonly RunnerExecution[],
  latest: ReadonlyMap<string, RunnerExecution>,
) {
  const projects = new Map<string, RunnerProjectSummary>()
  const summaryFor = (root: string) => {
    let summary = projects.get(root)
    if (!summary) {
      summary = { ...EMPTY_RUNNER_SUMMARY }
      projects.set(root, summary)
    }
    return summary
  }
  for (const execution of executions) {
    const summary = summaryFor(execution.projectRoot)
    if (execution.status === "running") summary.running += 1
    if (execution.status === "stopping") summary.stopping += 1
  }
  for (const execution of latest.values()) {
    const summary = summaryFor(execution.projectRoot)
    const status = runnerVisualStatus(execution)
    if (status === "failed" || status === "unhealthy") summary.failed += 1
    if (status === "success") summary.success += 1
    if (status === "stopped") summary.stopped += 1
    if (status === "checking") summary.checking += 1
  }
  return projects
}

export function runnerProjectStatus(summary: RunnerProjectSummary): RunnerVisualStatus {
  if (summary.failed) return "failed"
  if (summary.stopping) return "stopping"
  if (summary.checking) return "checking"
  if (summary.running) return "running"
  if (summary.success) return "success"
  if (summary.stopped) return "stopped"
  return "idle"
}
