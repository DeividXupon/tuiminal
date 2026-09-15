import type { KeyboardScope } from "@xupon/tuiminal-core/keyboard/scope"
import { shutdownResources } from "@xupon/tuiminal-core/lifecycle/shutdown"
import { loadedFeature } from "./features/registry"
import type { ToolId } from "./tool-catalog"

export const TOOL_KEYBOARD_SCOPES: Record<ToolId, KeyboardScope> = {
  get database() {
    return loadedFeature("database")?.databaseKeyboardScope ?? {}
  },
  get git() {
    return loadedFeature("git")?.gitKeyboardScope ?? {}
  },
  get runner() {
    return loadedFeature("runner")?.runnerKeyboardScope ?? {}
  },
  get http() {
    return loadedFeature("http")?.httpKeyboardScope ?? {}
  },
  get terminal() {
    return loadedFeature("terminal")?.terminalKeyboardScope ?? {}
  },
}
export function shutdownTools(mountedTools: Iterable<ToolId>) {
  const disposers: Partial<Record<ToolId, () => void | Promise<void>>> = {
    database: () => loadedFeature("database")?.closeDatabaseConnection(),
    git: () => loadedFeature("git")?.disposeGitResources(),
    runner: () => loadedFeature("runner")?.stopAllRunnerProcesses(),
    terminal: () => loadedFeature("terminal")?.stopAllFreeTerminalProcesses(),
  }
  return shutdownResources(
    [...mountedTools].flatMap((tool) => (disposers[tool] ? [disposers[tool]!] : [])),
  )
}
