import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import {
  TERMINAL_SIDEBAR_FOCUS_TARGET,
  type TerminalFocusTargetKey,
  terminalFocusTargetKey,
} from "../model/focus-selection"
import { MAX_TERMINALS_PER_SECTION, type TerminalSession } from "../model/sessions"
import { liveDiffCoversSplitPane } from "../ui/TerminalPanes"

export type MessageHistoryTarget = {
  sessionId: string
  startedAt: number
  focusRequest: number
}

export type SplitRequest = {
  sourceSessionId: string
  sectionId: string
  folderId: string
  down: boolean
}

export function messageHistoryForSession(
  session: TerminalSession,
  target: MessageHistoryTarget | undefined,
  messages: ReadonlyMap<string, readonly AgentMessageHistoryEntry[]>,
) {
  if (!target || target.sessionId !== session.id || target.startedAt !== session.startedAt)
    return undefined
  return { messages: messages.get(session.id) ?? [], focusRequest: target.focusRequest }
}

export function liveDiffCoversActiveSplit(
  sessions: readonly TerminalSession[],
  availableWidth: number,
  availableHeight: number,
  sidebarWidth: number,
) {
  if (sessions.length !== MAX_TERMINALS_PER_SECTION) return false
  return liveDiffCoversSplitPane({
    availableWidth,
    availableHeight,
    sidebarWidth,
    splitDown: sessions.some((session) => session.row === 1),
  })
}

export function terminalWorkspaceFocusTargets({
  sessions,
  activeSession,
  liveDiffTargets,
  messageHistoryTargets,
  messages,
  availableWidth,
  availableHeight,
  sidebarWidth,
}: {
  sessions: readonly TerminalSession[]
  activeSession: TerminalSession | undefined
  liveDiffTargets: ReadonlyMap<string, { startedAt: number; agentKey: string; sessionId: string }>
  messageHistoryTargets: ReadonlyMap<string, MessageHistoryTarget>
  messages: ReadonlyMap<string, readonly AgentMessageHistoryEntry[]>
  availableWidth: number
  availableHeight: number
  sidebarWidth: number
}) {
  const targets: TerminalFocusTargetKey[] = [TERMINAL_SIDEBAR_FOCUS_TARGET]
  if (!activeSession) return targets
  const activeSectionSessions = sessions.filter(
    (session) => session.sectionId === activeSession.sectionId,
  )
  const liveDiffCoversTerminal = liveDiffCoversActiveSplit(
    activeSectionSessions,
    availableWidth,
    availableHeight,
    sidebarWidth,
  )
  for (const session of activeSectionSessions) {
    const liveDiffTarget = liveDiffTargets.get(session.id)
    const liveDiffVisible =
      liveDiffTarget?.startedAt === session.startedAt &&
      (!session.agent || liveDiffTarget.agentKey === session.agent.key)
    const liveDiffCoversSession = liveDiffCoversTerminal && liveDiffVisible
    if (!liveDiffCoversSession) targets.push(terminalFocusTargetKey("terminal", session.id))
    if (session.remoteSetup || session.remoteCodexUpdate)
      targets.push(terminalFocusTargetKey("setup", session.id))
    if (
      !liveDiffCoversSession &&
      messageHistoryForSession(session, messageHistoryTargets.get(session.id), messages)
    )
      targets.push(terminalFocusTargetKey("history", session.id))
    if (liveDiffVisible) targets.push(terminalFocusTargetKey("live-diff", session.id))
  }
  return targets
}
