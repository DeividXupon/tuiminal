import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
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
