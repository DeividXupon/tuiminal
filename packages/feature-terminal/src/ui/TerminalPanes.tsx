import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { ComponentProps } from "react"
import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import type { TerminalFocusTargetKey } from "../model/focus-selection"
import type { TerminalSession } from "../model/sessions"
import { FreeTerminalPane, type FreeTerminalPaneLayout } from "./FreeTerminalPane"
import { TerminalInlineButton } from "./TerminalShortcut"

const FULL_PANE: FreeTerminalPaneLayout = {
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  borderTop: false,
  borderLeft: false,
}

const MIN_SHARED_LIVE_DIFF_PANE_WIDTH = 34
const MIN_SHARED_LIVE_DIFF_PANE_HEIGHT = 12

export function liveDiffCoversSplitPane({
  availableWidth,
  availableHeight,
  sidebarWidth,
  splitDown,
}: {
  availableWidth: number
  availableHeight: number
  sidebarWidth: number
  splitDown: boolean
}) {
  const workspaceWidth = Math.max(1, availableWidth - sidebarWidth)
  const paneWidth = splitDown ? workspaceWidth : Math.max(1, Math.floor((workspaceWidth - 1) / 2))
  const paneHeight = splitDown
    ? Math.max(1, Math.floor((availableHeight - 1) / 2))
    : availableHeight
  return (
    paneWidth < MIN_SHARED_LIVE_DIFF_PANE_WIDTH || paneHeight < MIN_SHARED_LIVE_DIFF_PANE_HEIGHT
  )
}

type PaneProps = ComponentProps<typeof FreeTerminalPane>

type LiveDiffPaneTarget = {
  sessionId: string
  agentKey: string
  startedAt: number
  manualDirectories: readonly string[]
  focusRequest: number
}

type TerminalPanesProps = {
  sessions: readonly TerminalSession[]
  activeSession: TerminalSession | undefined
  activeSessionId: string | null
  toolActive: boolean
  appearanceKey: string
  paletteSequence: string
  availableWidth: number
  availableHeight: number
  sidebarWidth: number
  liveDiffTargets: ReadonlyMap<string, LiveDiffPaneTarget>
  messageHistoryTargets: ReadonlyMap<
    string,
    { sessionId: string; startedAt: number; focusRequest: number }
  >
  agentMessages: ReadonlyMap<string, readonly AgentMessageHistoryEntry[]>
  selectedFocusTarget: TerminalFocusTargetKey | null
  onNewTerminal: () => void
  onNewCodex: () => void
  onActivate: PaneProps["onActivate"]
  onReady: PaneProps["onReady"]
  onGone: PaneProps["onGone"]
  onInput: PaneProps["onInput"]
  onResize: PaneProps["onResize"]
  onCloseLiveDiff: NonNullable<PaneProps["onCloseLiveDiff"]>
  onAddLiveDiffProject: NonNullable<PaneProps["onAddLiveDiffProject"]>
  onCloseMessageHistory: NonNullable<PaneProps["onCloseMessageHistory"]>
  onReturnMessageHistoryTerminal: NonNullable<PaneProps["onReturnMessageHistoryTerminal"]>
  onFocusTarget: (target: TerminalFocusTargetKey) => void
}

function paneLayout(
  session: TerminalSession,
  visible: boolean,
  splitSection: boolean,
  down: boolean,
): FreeTerminalPaneLayout {
  if (!splitSection || !visible) return FULL_PANE
  return {
    top: down && session.row === 1 ? "50%" : 0,
    left: !down && session.column === 1 ? "50%" : 0,
    width: down ? "100%" : "50%",
    height: down ? "50%" : "100%",
    borderTop: Boolean(down && session.row === 1),
    borderLeft: Boolean(!down && session.column === 1),
  }
}

function paneLiveDiff(
  session: TerminalSession,
  target: LiveDiffPaneTarget | undefined,
  stacked: boolean,
  coversTerminal: boolean,
  sharesSplitPane: boolean,
): PaneProps["liveDiff"] {
  if (!matchesLiveDiffTarget(session, target)) return undefined
  return {
    agentKey: target.agentKey,
    manualDirectories: target.manualDirectories,
    stacked,
    coversTerminal,
    sharesSplitPane,
    running: session.status === "running" && Boolean(session.agent),
    focusRequest: target.focusRequest,
  }
}

function matchesLiveDiffTarget(
  session: TerminalSession,
  target: LiveDiffPaneTarget | undefined,
): target is LiveDiffPaneTarget {
  return Boolean(
    target &&
      target.sessionId === session.id &&
      target.startedAt === session.startedAt &&
      (!session.agent || target.agentKey === session.agent.key),
  )
}

function paneMessageHistory(
  session: TerminalSession,
  target: { sessionId: string; startedAt: number; focusRequest: number } | undefined,
  messages: TerminalPanesProps["agentMessages"],
): PaneProps["messageHistory"] {
  if (target?.sessionId !== session.id || target.startedAt !== session.startedAt) return undefined
  return { messages: messages.get(session.id) ?? [], focusRequest: target.focusRequest }
}

function TerminalPaneItem({
  session,
  visible,
  splitSection,
  liveDiffCoversTerminal,
  down,
  panes,
}: {
  session: TerminalSession
  visible: boolean
  splitSection: boolean
  liveDiffCoversTerminal: boolean
  down: boolean
  panes: TerminalPanesProps
}) {
  const stacked =
    !liveDiffCoversTerminal && (splitSection || panes.availableWidth - panes.sidebarWidth < 90)
  return (
    <FreeTerminalPane
      session={session}
      active={session.id === panes.activeSessionId}
      toolActive={panes.toolActive}
      visible={visible}
      appearanceKey={panes.appearanceKey}
      paletteSequence={panes.paletteSequence}
      layout={paneLayout(session, visible, splitSection, down)}
      onActivate={panes.onActivate}
      onReady={panes.onReady}
      onGone={panes.onGone}
      onInput={panes.onInput}
      onResize={panes.onResize}
      liveDiff={paneLiveDiff(
        session,
        panes.liveDiffTargets.get(session.id),
        stacked,
        liveDiffCoversTerminal,
        splitSection && !liveDiffCoversTerminal,
      )}
      onCloseLiveDiff={panes.onCloseLiveDiff}
      onAddLiveDiffProject={panes.onAddLiveDiffProject}
      messageHistory={paneMessageHistory(
        session,
        panes.messageHistoryTargets.get(session.id),
        panes.agentMessages,
      )}
      onCloseMessageHistory={panes.onCloseMessageHistory}
      onReturnMessageHistoryTerminal={panes.onReturnMessageHistoryTerminal}
      focusSelection={
        panes.selectedFocusTarget && visible
          ? { selectedTarget: panes.selectedFocusTarget, onFocus: panes.onFocusTarget }
          : undefined
      }
    />
  )
}

export function TerminalPanes(panes: TerminalPanesProps) {
  const { sessions, activeSession, onNewTerminal, onNewCodex } = panes
  const visibleSessions = activeSession
    ? sessions.filter((session) => session.sectionId === activeSession.sectionId)
    : []
  const splitSection = visibleSessions.length === 2
  const down = visibleSessions.some((pane) => pane.row === 1)
  const coverLiveDiff =
    splitSection &&
    liveDiffCoversSplitPane({
      availableWidth: panes.availableWidth,
      availableHeight: panes.availableHeight,
      sidebarWidth: panes.sidebarWidth,
      splitDown: down,
    })

  return (
    <box
      id="terminal-panes"
      style={{ flexGrow: 1, position: "relative", overflow: "hidden", minWidth: 1 }}
    >
      {!sessions.length && (
        <box style={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
          <box style={{ flexDirection: "row" }}>
            <TerminalInlineButton
              compact
              label="Novo terminal"
              accent={COLORS.terminal}
              onPress={onNewTerminal}
            />
            <TerminalInlineButton
              compact
              label="Novo Codex"
              accent={COLORS.terminal}
              onPress={onNewCodex}
            />
          </box>
        </box>
      )}
      {sessions.map((session) => (
        <TerminalPaneItem
          key={session.id}
          session={session}
          visible={session.sectionId === activeSession?.sectionId}
          splitSection={splitSection}
          liveDiffCoversTerminal={
            coverLiveDiff && matchesLiveDiffTarget(session, panes.liveDiffTargets.get(session.id))
          }
          down={down}
          panes={panes}
        />
      ))}
    </box>
  )
}
