import { type BoxRenderable, EmbeddedTerminalRenderable } from "@opentui/core"
import { extend } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { memo, useEffect, useRef, useState } from "react"
import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import type { TerminalSession } from "../model/sessions"
import { AgentMessageHistoryPanel } from "./AgentMessageHistoryPanel"
import { LiveDiffPanel } from "./LiveDiffPanel"

extend({ "embedded-terminal": EmbeddedTerminalRenderable })
declare module "@opentui/react" {
  interface OpenTUIComponents {
    "embedded-terminal": typeof EmbeddedTerminalRenderable
  }
}
export type FreeTerminalPaneLayout = {
  top: 0 | "50%"
  left: 0 | "50%"
  width: "50%" | "100%"
  height: "50%" | "100%"
  borderTop: boolean
  borderLeft: boolean
}
type PaneProps = {
  session: TerminalSession
  active: boolean
  toolActive?: boolean
  visible: boolean
  appearanceKey: string
  paletteSequence: string
  layout: FreeTerminalPaneLayout
  onActivate: (id: string) => void
  onReady: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onGone: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onInput: (id: string, data: Uint8Array) => void
  onResize: (id: string, columns: number, rows: number) => void
  liveDiff?:
    | {
        agentKey: string
        manualDirectories: readonly string[]
        stacked: boolean
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
}
function liveDiffWidths(frameWidth: number, borderLeft: boolean, stacked: boolean) {
  const innerWidth = Math.max(1, frameWidth - (borderLeft ? 1 : 0))
  const originalDiffWidth = Math.round(innerWidth * (stacked ? 1 : 0.48))
  const minimumDiffWidth = Math.min(27, innerWidth)
  const normalDiffWidth = Math.max(minimumDiffWidth, originalDiffWidth - 14)
  return {
    diffWidth: normalDiffWidth,
    stableContentWidth: Math.max(1, normalDiffWidth - (stacked ? 0 : 1)),
    terminalWidth: Math.max(1, innerWidth - normalDiffWidth),
  }
}
function liveDiffHeights(frameHeight: number, borderTop: boolean, stacked: boolean) {
  if (!stacked) return { terminalHeight: "100%" as const, diffHeight: "100%" as const }
  if (!frameHeight) return { terminalHeight: "52%" as const, diffHeight: "48%" as const }
  const innerHeight = Math.max(1, frameHeight - (borderTop ? 1 : 0))
  const diffHeight = Math.min(
    Math.max(1, innerHeight - 1),
    Math.max(16, Math.round(innerHeight * 0.48)),
  )
  return { terminalHeight: Math.max(1, innerHeight - diffHeight), diffHeight }
}
function messageHistoryHeights(terminalAreaHeight: number, open: boolean, detailOpen: boolean) {
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
function samePane(previous: PaneProps, next: PaneProps) {
  // Names and process/agent status belong to the sidebar; this pane only reads the session ID.
  return (
    previous.session.id === next.session.id &&
    previous.active === next.active &&
    previous.toolActive === next.toolActive &&
    previous.visible === next.visible &&
    previous.appearanceKey === next.appearanceKey &&
    previous.paletteSequence === next.paletteSequence &&
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
    previous.liveDiff?.running === next.liveDiff?.running &&
    previous.liveDiff?.focusRequest === next.liveDiff?.focusRequest &&
    previous.onCloseLiveDiff === next.onCloseLiveDiff &&
    previous.onAddLiveDiffProject === next.onAddLiveDiffProject &&
    previous.messageHistory?.messages === next.messageHistory?.messages &&
    previous.messageHistory?.focusRequest === next.messageHistory?.focusRequest &&
    previous.onCloseMessageHistory === next.onCloseMessageHistory &&
    previous.onReturnMessageHistoryTerminal === next.onReturnMessageHistoryTerminal
  )
}
export const FreeTerminalPane = memo(function FreeTerminalPane({
  session,
  active,
  toolActive,
  visible,
  paletteSequence,
  layout,
  onActivate,
  onReady,
  onGone,
  onInput,
  onResize,
  liveDiff,
  onCloseLiveDiff,
  onAddLiveDiffProject,
  messageHistory,
  onCloseMessageHistory,
  onReturnMessageHistoryTerminal,
}: PaneProps) {
  const terminalRef = useRef<EmbeddedTerminalRenderable | null>(null)
  const [frameHeight, setFrameHeight] = useState(0)
  const [frameWidth, setFrameWidth] = useState(0)
  const [messageDetailOpen, setMessageDetailOpen] = useState(false)
  const { diffWidth, stableContentWidth, terminalWidth } = liveDiffWidths(
    frameWidth,
    layout.borderLeft,
    Boolean(liveDiff?.stacked),
  )
  const fileTableHeight = liveDiff?.stacked ? 4 : Math.max(4, Math.round(frameHeight * 0.3))
  const { terminalHeight, diffHeight } = liveDiffHeights(
    frameHeight,
    layout.borderTop,
    Boolean(liveDiff?.stacked),
  )
  const terminalAreaHeight = typeof terminalHeight === "number" ? terminalHeight : frameHeight
  const { historyHeight, embeddedHeight } = messageHistoryHeights(
    terminalAreaHeight,
    Boolean(messageHistory),
    messageDetailOpen,
  )
  const borders: Array<"top" | "left"> = []
  if (layout.borderTop) borders.push("top")
  if (layout.borderLeft) borders.push("left")
  useEffect(() => {
    const terminal = terminalRef.current
    if (terminal && paletteSequence) terminal.write(paletteSequence)
  }, [paletteSequence])
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    onReady(session.id, terminal)
    return () => onGone(session.id, terminal)
  }, [onGone, onReady, session.id])
  useEffect(() => {
    if (!messageHistory) setMessageDetailOpen(false)
  }, [messageHistory])
  return (
    <box
      visible={visible}
      style={{
        position: "absolute",
        top: layout.top,
        left: layout.left,
        width: layout.width,
        height: layout.height,
        minWidth: 1,
        minHeight: 1,
        backgroundColor: COLORS.canvas,
        overflow: "hidden",
      }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes handle terminal mouse activation without ARIA roles. */}
      <box
        id={`terminal-pane-frame-${session.id}`}
        onMouseDown={() => onActivate(session.id)}
        onSizeChange={function (this: BoxRenderable) {
          if (!liveDiff && !messageHistory) return
          setFrameHeight((current) => (current === this.height ? current : this.height))
          setFrameWidth((current) => (current === this.width ? current : this.width))
        }}
        style={{
          flexGrow: 1,
          minWidth: 1,
          minHeight: 1,
          border: borders,
          borderStyle: "single",
          borderColor: active ? COLORS.terminal : COLORS.border,
          backgroundColor: COLORS.canvas,
          overflow: "hidden",
          flexDirection: liveDiff?.stacked ? "column" : "row",
        }}
      >
        <box
          style={{
            width: liveDiff && !liveDiff.stacked && frameWidth ? terminalWidth : "100%",
            height: terminalHeight,
            minWidth: 1,
            minHeight: 1,
            flexShrink: 1,
            flexDirection: "column",
          }}
        >
          <box style={{ width: "100%", height: embeddedHeight, minHeight: 1, flexShrink: 1 }}>
            <embedded-terminal
              ref={terminalRef}
              id={`free-terminal-${session.id}`}
              maxScrollback={5_000}
              selectable
              onData={(data) => onInput(session.id, data)}
              onTerminalResize={(columns, rows) => onResize(session.id, columns, rows)}
              onMouseDown={() => onActivate(session.id)}
              style={{ width: "100%", height: "100%", minHeight: 1, flexGrow: 1, flexShrink: 1 }}
            />
          </box>
          {messageHistory && onCloseMessageHistory && onReturnMessageHistoryTerminal && (
            <box
              style={{
                width: "100%",
                height: historyHeight,
                minHeight: 1,
                flexShrink: 1,
                border: ["top"],
                borderColor: COLORS.border,
              }}
            >
              <AgentMessageHistoryPanel
                sessionId={session.id}
                messages={messageHistory.messages}
                active={Boolean(toolActive && active)}
                focusRequest={messageHistory.focusRequest}
                onClose={onCloseMessageHistory}
                onReturnTerminal={onReturnMessageHistoryTerminal}
                onDetailModeChange={setMessageDetailOpen}
              />
            </box>
          )}
        </box>
        {liveDiff && onCloseLiveDiff && onAddLiveDiffProject && (
          <box
            style={{
              width: frameWidth ? diffWidth : liveDiff.stacked ? "100%" : "48%",
              height: diffHeight,
              minWidth: 1,
              minHeight: 1,
              flexShrink: 1,
              border: [liveDiff.stacked ? "top" : "left"],
              borderColor: COLORS.border,
            }}
          >
            <LiveDiffPanel
              sessionId={session.id}
              agentKey={liveDiff.agentKey}
              initialDirectory={session.workingDirectory ?? ""}
              manualDirectories={liveDiff.manualDirectories}
              running={liveDiff.running}
              active={Boolean(toolActive && active)}
              fileTableHeight={fileTableHeight}
              stableContentWidth={stableContentWidth}
              stacked={liveDiff.stacked}
              focusRequest={liveDiff.focusRequest}
              onClose={onCloseLiveDiff}
              onAddProject={onAddLiveDiffProject}
              onReturnTerminal={() => onActivate(session.id)}
            />
          </box>
        )}
      </box>
    </box>
  )
}, samePane)
