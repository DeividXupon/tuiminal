import type { KeyboardScope } from "../core/keyboard/scope"
import { shutdownResources } from "../core/lifecycle/shutdown"
import { closeDatabaseConnection, databaseKeyboardScope } from "../features/database"
import { disposeGitResources, gitKeyboardScope } from "../features/git"
import { httpKeyboardScope } from "../features/http"
import { runnerKeyboardScope, stopAllRunnerProcesses } from "../features/runner"
import { stopAllFreeTerminalProcesses, terminalKeyboardScope } from "../features/terminal"
import type { ToolId } from "./tool-catalog"

export const TOOL_KEYBOARD_SCOPES: Record<ToolId, KeyboardScope> = {
  git: gitKeyboardScope,
  database: databaseKeyboardScope,
  runner: runnerKeyboardScope,
  http: httpKeyboardScope,
  terminal: terminalKeyboardScope,
}

const DISPOSERS: Partial<Record<ToolId, () => void | Promise<void>>> = {
  database: closeDatabaseConnection,
  git: disposeGitResources,
  runner: stopAllRunnerProcesses,
  terminal: stopAllFreeTerminalProcesses,
}

export function shutdownTools(mountedTools: Iterable<ToolId>) {
  const disposers = [...mountedTools].flatMap((tool) => {
    const dispose = DISPOSERS[tool]
    return dispose ? [dispose] : []
  })
  return shutdownResources(disposers)
}
