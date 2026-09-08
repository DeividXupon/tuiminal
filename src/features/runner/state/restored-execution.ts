import { createShellRunnerCommand } from "../services/runner"
import type { RunnerPersistedExecution } from "../model/config"
import type { RunnerExecution } from "../model/execution"
import { commandKey } from "../rendering/presentation"

export function restoredRunnerExecution(execution: RunnerPersistedExecution): RunnerExecution {
  const command = createShellRunnerCommand(execution.displayCommand, {
    label: execution.label,
  })
  return {
    ...execution,
    commandId: execution.commandId,
    commandKey: commandKey(execution.projectRoot, execution.commandId),
    logs: execution.logs.map((log, index) => ({ ...log, id: index })),
    command,
    restartAttempt: 0,
    health: "none",
  }
}
