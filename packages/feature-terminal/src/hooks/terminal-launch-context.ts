import type { EmbeddedTerminalRenderable } from "@opentui/core"
import type { RefObject } from "react"
import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import type { TermAgentsCommand, TerminalSession } from "../model/sessions"
import type { AgentMonitor } from "../services/agent-monitor"
import type { TermAgentsProcessHandle } from "../services/terminal"
import type { TerminalLaunches } from "../services/terminal-launches"
import type { notifyTerminalExit } from "./use-terminal-notifications"

export type TerminalSize = { columns: number; rows: number }
type Notify = Parameters<typeof notifyTerminalExit>[0]

export type LaunchContext = {
  dimensions: RefObject<{ width: number; height: number }>
  terminals: RefObject<Map<string, EmbeddedTerminalRenderable>>
  handles: RefObject<Map<string, TermAgentsProcessHandle>>
  commands: RefObject<Map<string, TermAgentsCommand>>
  sizes: RefObject<Map<string, TerminalSize>>
  launches: RefObject<TerminalLaunches>
  outputs: RefObject<Map<string, AgentMonitor>>
  activeSession: RefObject<string | null>
  updateSession: (id: string, update: Partial<TerminalSession>) => void
  updateAgentMessages: (
    id: string,
    messages: readonly AgentMessageHistoryEntry[],
    replace: boolean,
  ) => void
  clearAgentMessages: (id: string) => void
  closeFinishedShell: (id: string) => void
  focusTerminal: (id: string) => void
  setNotice: (message: string) => void
  notify: Notify
}
