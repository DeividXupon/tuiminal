import type { KeyboardScope } from "@xupon/tuiminal-core/keyboard/scope"
import { shutdownResources } from "@xupon/tuiminal-core/lifecycle/shutdown"
import { closeDatabaseConnection, databaseKeyboardScope } from "@xupon/tuiminal-feature-database"
import { disposeGitResources, gitKeyboardScope } from "@xupon/tuiminal-feature-git"
import { httpKeyboardScope } from "@xupon/tuiminal-feature-http"
import { runnerKeyboardScope, stopAllRunnerProcesses } from "@xupon/tuiminal-feature-runner"
import {
  stopAllFreeTerminalProcesses,
  terminalKeyboardScope,
} from "@xupon/tuiminal-feature-terminal"
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
