import { expect, test } from "bun:test"
import { LANGUAGE_OPTIONS, translateUi } from "../packages/core/src/i18n/index"
import { RUNNER_STATUS_MESSAGES } from "../packages/core/src/i18n/runner-status-catalog"
import type { RunnerExecution } from "../packages/feature-runner/src/model/execution"
import {
  EMPTY_RUNNER_SUMMARY,
  latestRunnerExecutions,
  runnerProjectStatus,
  runnerProjectSummaries,
  runnerVisualStatus,
} from "../packages/feature-runner/src/model/status"

function execution(
  root: string,
  commandId: string,
  status: RunnerExecution["status"],
  startedAt: number,
): RunnerExecution {
  return {
    id: `${root}:${commandId}:${startedAt}`,
    commandId,
    commandKey: `${root}\0${commandId}`,
    label: commandId,
    displayCommand: commandId,
    projectRoot: root,
    projectName: root,
    status,
    pid: null,
    startedAt,
    endedAt: status === "running" ? null : startedAt + 1,
    exitCode: status === "failed" ? 1 : null,
    logs: [],
    restartAttempt: 0,
    health: "none",
    command: {
      id: commandId,
      label: commandId,
      category: "custom",
      description: "",
      program: "fixture",
      args: [],
      displayCommand: "fixture",
    },
  }
}

test("Runner summaries retain the latest outcome per command and keep projects separate", () => {
  const failed = execution("one", "build", "failed", 10)
  const running = execution("one", "api", "running", 20)
  const success = execution("two", "test", "success", 30)
  const executions = [running, success, failed]
  const latest = latestRunnerExecutions(executions)
  const summaries = runnerProjectSummaries(executions, latest)
  expect(summaries.get("one")).toMatchObject({ running: 1, failed: 1, success: 0 })
  expect(summaries.get("two")).toMatchObject({ running: 0, failed: 0, success: 1 })
  expect(runnerProjectStatus(summaries.get("one") ?? EMPTY_RUNNER_SUMMARY)).toBe("failed")
  expect(runnerVisualStatus(latest.get(failed.commandKey))).toBe("failed")

  const retry = execution("one", "build", "success", 40)
  const retried = [...executions, retry]
  const newLatest = latestRunnerExecutions(retried)
  expect(newLatest.get(failed.commandKey)).toBe(retry)
  expect(runnerProjectSummaries(retried, newLatest).get("one")).toMatchObject({
    running: 1,
    failed: 0,
    success: 1,
  })
})

test("active executions win over newer finished instances, and health has its own severity", () => {
  const active = execution("one", "api", "running", 10)
  const finished = execution("one", "api", "success", 20)
  expect(latestRunnerExecutions([finished, active]).get(active.commandKey)).toBe(active)
  expect(runnerVisualStatus({ ...active, health: "checking" })).toBe("checking")
  expect(runnerVisualStatus({ ...active, health: "healthy" })).toBe("running")
  expect(runnerVisualStatus({ ...active, health: "unhealthy" })).toBe("unhealthy")
  expect(runnerVisualStatus({ ...active, health: "unhealthy", status: "stopped" })).toBe("stopped")
  const unhealthy = { ...active, health: "unhealthy" as const }
  expect(
    runnerProjectSummaries([unhealthy], latestRunnerExecutions([unhealthy])).get("one"),
  ).toMatchObject({ running: 1, failed: 1 })
})

test("Runner state labels are translated in every supported language", () => {
  for (const message of RUNNER_STATUS_MESSAGES) {
    for (const [index, language] of LANGUAGE_OPTIONS.entries()) {
      const expected = message[index]
      if (expected === undefined) throw new Error(`Missing Runner translation: ${language.id}`)
      expect(translateUi(message[0], language.id)).toBe(expected)
    }
  }
})
