import { EmbeddedTerminalRenderable } from "@opentui/core"
import { extend } from "@opentui/react"
import { memo, useEffect, useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { TerminalSession } from "../model/sessions"

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
  visible: boolean
  appearanceKey: string
  layout: FreeTerminalPaneLayout
  onActivate: (id: string) => void
  onReady: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onGone: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onInput: (id: string, data: Uint8Array) => void
  onResize: (id: string, columns: number, rows: number) => void
}
function samePane(previous: PaneProps, next: PaneProps) {
  // Names and process/agent status belong to the sidebar; this pane only reads the session ID.
  return (
    previous.session.id === next.session.id &&
    previous.active === next.active &&
    previous.visible === next.visible &&
    previous.appearanceKey === next.appearanceKey &&
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
    previous.onResize === next.onResize
  )
}
export const FreeTerminalPane = memo(function FreeTerminalPane({
  session,
  active,
  visible,
  layout,
  onActivate,
  onReady,
  onGone,
  onInput,
  onResize,
}: PaneProps) {
  const terminalRef = useRef<EmbeddedTerminalRenderable | null>(null)
  const borders: Array<"top" | "left"> = []
  if (layout.borderTop) borders.push("top")
  if (layout.borderLeft) borders.push("left")
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    onReady(session.id, terminal)
    return () => onGone(session.id, terminal)
  }, [onGone, onReady, session.id])
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
        style={{
          flexGrow: 1,
          minWidth: 1,
          minHeight: 1,
          border: borders,
          borderStyle: "single",
          borderColor: active ? COLORS.terminal : COLORS.border,
          backgroundColor: COLORS.canvas,
          overflow: "hidden",
        }}
      >
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
    </box>
  )
}, samePane)
