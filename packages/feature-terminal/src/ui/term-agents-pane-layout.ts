import type { EmbeddedTerminalRenderable } from "@opentui/core"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import type { TerminalFocusTargetKey } from "../model/focus-selection"
import type { RemoteProjectSyncStatus } from "../model/remote-project-sync"
import type { TerminalSession } from "../model/sessions"
import type { TerminalRepositoryContext } from "../model/terminal-context"
import { type TerminalAgentOrigin, terminalAgentOrigin } from "./TerminalContextTags"

export type TermAgentsPaneLayout = {
  top: 0 | "50%"
  left: 0 | "50%"
  width: "50%" | "100%"
  height: "50%" | "100%"
  borderTop: boolean
  borderLeft: boolean
}

export type TermAgentsPaneProps = {
  session: TerminalSession
  active: boolean
  toolActive?: boolean
  visible: boolean
  appearanceKey: string
  paletteSequence: string
  context?: TerminalRepositoryContext | undefined
  syncStatus?: RemoteProjectSyncStatus | undefined
  masterKey?: string
  layout: TermAgentsPaneLayout
  onActivate: (id: string) => void
  onReady: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onGone: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onInput: (id: string, data: Uint8Array) => void
  onResize: (id: string, columns: number, rows: number) => void
  liveDiff?:
    | {
        agentKey: string
        remote?: NonNullable<TerminalSession["agentLaunch"]>["remote"]
        manualDirectories: readonly string[]
        stacked: boolean
        coversTerminal: boolean
        sharesSplitPane: boolean
        running: boolean
        focusRequest: number
      }
    | undefined
  onCloseLiveDiff?: (id: string) => void
  onAddLiveDiffProject?: (id: string, roots: readonly string[]) => void
  messageHistory?:
    | {
        messages: readonly AgentMessageHistoryEntry[]
        focusRequest: number
      }
    | undefined
  onCloseMessageHistory?: (id: string) => void
  onReturnMessageHistoryTerminal?: (id: string) => void
  onRetryRemoteCodex?: (flowId: number) => void
  focusSelection?:
    | {
        selectedTarget: TerminalFocusTargetKey
        onFocus: (target: TerminalFocusTargetKey) => void
      }
    | undefined
}

function liveDiffWidths(frameWidth: number, borderLeft: boolean, stacked: boolean) {
  const innerWidth = Math.max(1, frameWidth - (borderLeft ? 1 : 0))
  if (stacked)
    return {
      diffWidth: innerWidth,
      stableContentWidth: innerWidth,
      terminalWidth: innerWidth,
    }
  const originalDiffWidth = Math.round(innerWidth * 0.48)
  const minimumDiffWidth = Math.min(27, innerWidth)
  const normalDiffWidth = Math.max(minimumDiffWidth, originalDiffWidth - 14)
  return {
    diffWidth: normalDiffWidth,
    stableContentWidth: Math.max(1, normalDiffWidth - 1),
    terminalWidth: Math.max(1, innerWidth - normalDiffWidth),
  }
}

export function paneLiveDiffWidths(
  frameWidth: number,
  borderLeft: boolean,
  liveDiff: TermAgentsPaneProps["liveDiff"],
) {
  if (liveDiff?.coversTerminal) {
    const innerWidth = Math.max(1, frameWidth - (borderLeft ? 1 : 0))
    return { diffWidth: innerWidth, stableContentWidth: innerWidth, terminalWidth: innerWidth }
  }
  return liveDiffWidths(frameWidth, borderLeft, Boolean(liveDiff?.stacked))
}

export function terminalContentWidth(
  liveDiff: TermAgentsPaneProps["liveDiff"],
  frameWidth: number,
  terminalWidth: number,
) {
  return liveDiff && !liveDiff.coversTerminal && !liveDiff.stacked && frameWidth
    ? terminalWidth
    : "100%"
}

export function liveDiffContainerStyle(
  coversTerminal: boolean,
  frameWidth: number,
  diffWidth: number,
  stacked: boolean,
  diffHeight: number | "48%" | "100%",
) {
  if (coversTerminal)
    return {
      position: "absolute" as const,
      top: 0,
      left: 0,
      width: "100%" as const,
      height: "100%" as const,
      zIndex: 2,
      backgroundColor: COLORS.canvas,
    }
  return {
    position: "relative" as const,
    width: frameWidth ? diffWidth : stacked ? ("100%" as const) : ("48%" as const),
    height: diffHeight,
  }
}

export function liveDiffHeights(
  frameHeight: number,
  borderTop: boolean,
  stacked: boolean,
  sharesSplitPane: boolean,
) {
  if (!stacked) return { terminalHeight: "100%" as const, diffHeight: "100%" as const }
  if (!frameHeight) return { terminalHeight: "52%" as const, diffHeight: "48%" as const }
  const innerHeight = Math.max(1, frameHeight - (borderTop ? 1 : 0))
  if (sharesSplitPane) {
    const diffHeight = Math.max(1, Math.round(innerHeight * 0.48))
    return { terminalHeight: Math.max(1, innerHeight - diffHeight), diffHeight }
  }
  const diffHeight = Math.min(
    Math.max(1, innerHeight - 1),
    Math.max(16, Math.round(innerHeight * 0.48)),
  )
  return { terminalHeight: Math.max(1, innerHeight - diffHeight), diffHeight }
}

export function messageHistoryHeights(
  terminalAreaHeight: number,
  open: boolean,
  detailOpen: boolean,
) {
  if (!open) return { historyHeight: "32%" as const, embeddedHeight: "100%" as const }
  if (!terminalAreaHeight)
    return detailOpen
      ? { historyHeight: "50%" as const, embeddedHeight: "50%" as const }
      : { historyHeight: "32%" as const, embeddedHeight: "68%" as const }
  const desiredHeight = detailOpen
    ? Math.round(terminalAreaHeight * 0.5)
    : Math.max(6, Math.round(terminalAreaHeight * 0.3))
  const historyHeight = Math.max(1, Math.min(desiredHeight, Math.max(1, terminalAreaHeight - 5)))
  return {
    historyHeight,
    embeddedHeight: Math.max(1, terminalAreaHeight - historyHeight),
  }
}

export function remoteSetupHeights(frameHeight: number, open: boolean) {
  if (!open) return { setupHeight: 0, terminalHeight: "100%" as const }
  if (!frameHeight) return { setupHeight: "40%" as const, terminalHeight: "60%" as const }
  const setupHeight = Math.max(6, Math.min(10, frameHeight - 5))
  return { setupHeight, terminalHeight: Math.max(1, frameHeight - setupHeight) }
}

export function measuresPane(
  liveDiff: TermAgentsPaneProps["liveDiff"],
  messageHistory: TermAgentsPaneProps["messageHistory"],
  remoteSetup: TerminalSession["remoteSetup"],
  remoteCodexUpdate: TerminalSession["remoteCodexUpdate"],
  context: TermAgentsPaneProps["context"],
  syncStatus: TermAgentsPaneProps["syncStatus"],
  agentOrigin: TerminalAgentOrigin | undefined,
) {
  return Boolean(
    liveDiff ||
      messageHistory ||
      remoteSetup ||
      remoteCodexUpdate ||
      context ||
      syncStatus ||
      agentOrigin,
  )
}

export function paneContextWidth(
  liveDiff: TermAgentsPaneProps["liveDiff"],
  frameWidth: number,
  terminalWidth: number,
  borderLeft: boolean,
) {
  return liveDiff && !liveDiff.stacked && frameWidth
    ? terminalWidth
    : Math.max(1, frameWidth - (borderLeft ? 1 : 0))
}

export function paneContextActive(toolActive: boolean | undefined, visible: boolean) {
  return Boolean(toolActive && visible)
}

export function sameTerminalPane(previous: TermAgentsPaneProps, next: TermAgentsPaneProps) {
  // Names and live agent activity belong to the sidebar; lifecycle status drives the startup loader.
  return (
    previous.session.id === next.session.id &&
    previous.session.status === next.session.status &&
    previous.active === next.active &&
    previous.toolActive === next.toolActive &&
    previous.visible === next.visible &&
    previous.appearanceKey === next.appearanceKey &&
    previous.paletteSequence === next.paletteSequence &&
    previous.context === next.context &&
    previous.syncStatus === next.syncStatus &&
    terminalAgentOrigin(previous.session) === terminalAgentOrigin(next.session) &&
    previous.masterKey === next.masterKey &&
    previous.layout.top === next.layout.top &&
    previous.layout.left === next.layout.left &&
    previous.layout.width === next.layout.width &&
    previous.layout.height === next.layout.height &&
    previous.layout.borderTop === next.layout.borderTop &&
    previous.layout.borderLeft === next.layout.borderLeft &&
    previous.onActivate === next.onActivate &&
    previous.onReady === next.onReady &&
    previous.onGone === next.onGone &&
    previous.onInput === next.onInput &&
    previous.onResize === next.onResize &&
    (!previous.liveDiff || previous.session.workingDirectory === next.session.workingDirectory) &&
    previous.liveDiff?.agentKey === next.liveDiff?.agentKey &&
    previous.liveDiff?.manualDirectories === next.liveDiff?.manualDirectories &&
    previous.liveDiff?.stacked === next.liveDiff?.stacked &&
    previous.liveDiff?.coversTerminal === next.liveDiff?.coversTerminal &&
    previous.liveDiff?.sharesSplitPane === next.liveDiff?.sharesSplitPane &&
    previous.liveDiff?.running === next.liveDiff?.running &&
    previous.liveDiff?.focusRequest === next.liveDiff?.focusRequest &&
    previous.onCloseLiveDiff === next.onCloseLiveDiff &&
    previous.onAddLiveDiffProject === next.onAddLiveDiffProject &&
    previous.messageHistory?.messages === next.messageHistory?.messages &&
    previous.messageHistory?.focusRequest === next.messageHistory?.focusRequest &&
    previous.onCloseMessageHistory === next.onCloseMessageHistory &&
    previous.onReturnMessageHistoryTerminal === next.onReturnMessageHistoryTerminal &&
    previous.session.remoteCodexUpdate === next.session.remoteCodexUpdate &&
    previous.onRetryRemoteCodex === next.onRetryRemoteCodex &&
    previous.focusSelection?.selectedTarget === next.focusSelection?.selectedTarget &&
    previous.focusSelection?.onFocus === next.focusSelection?.onFocus
  )
}
