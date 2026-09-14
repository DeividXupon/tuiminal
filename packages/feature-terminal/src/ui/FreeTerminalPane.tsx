import { EmbeddedTerminalRenderable } from "@opentui/core"
import { extend } from "@opentui/react"
import { memo, useEffect, useRef } from "react"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import {
  compactTerminalText,
  terminalStatusColor,
  terminalStatusMarker,
  type TerminalPresentationStatus,
} from "../rendering/presentation"
import type { FreeTerminalCommand } from "../services/terminal"

extend({ "embedded-terminal": EmbeddedTerminalRenderable })

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "embedded-terminal": typeof EmbeddedTerminalRenderable
  }
}

export type FreeTerminalPaneSession = FreeTerminalCommand & {
  id: string
  sectionId: string
  row: 0 | 1
  column: 0 | 1
  title: string
  status: TerminalPresentationStatus
  pid: number | null
  exitCode: number | null
  startedAt: number
}

export type FreeTerminalPaneLayout = {
  top: 0 | "50%"
  left: 0 | "50%"
  width: "50%" | "100%"
  height: "50%" | "100%"
  borderTop: boolean
  borderLeft: boolean
}

type FreeTerminalPaneProps = {
  session: FreeTerminalPaneSession
  ordinal: number
  active: boolean
  visible: boolean
  appearanceKey: string
  layout: FreeTerminalPaneLayout
  onActivate: (id: string) => void
  onReady: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onGone: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onInput: (id: string, data: Uint8Array) => void
  onResize: (id: string, columns: number, rows: number) => void
  onRestart: (id: string) => void
  onClose: (id: string) => void
}

function samePane(previous: FreeTerminalPaneProps, next: FreeTerminalPaneProps) {
  return (
    previous.session === next.session &&
    previous.ordinal === next.ordinal &&
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
    previous.onResize === next.onResize &&
    previous.onRestart === next.onRestart &&
    previous.onClose === next.onClose
  )
}

export const FreeTerminalPane = memo(function FreeTerminalPane({
  session,
  ordinal,
  active,
  visible,
  layout,
  onActivate,
  onReady,
  onGone,
  onInput,
  onResize,
  onRestart,
  onClose,
}: FreeTerminalPaneProps) {
  const terminalRef = useRef<EmbeddedTerminalRenderable | null>(null)
  const borders: Array<"top" | "left"> = []
  if (visible && layout.borderTop) borders.push("top")
  if (visible && layout.borderLeft) borders.push("left")
  if (visible && active && LAYOUT.compact && !borders.includes("left")) borders.push("left")

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
        top: visible ? layout.top : 0,
        left: visible ? layout.left : 0,
        width: visible ? layout.width : 1,
        height: visible ? layout.height : 1,
        minWidth: visible ? 18 : 1,
        minHeight: visible ? 4 : 1,
        border: borders,
        borderStyle: "single",
        borderColor: active && LAYOUT.compact ? COLORS.terminal : COLORS.border,
        backgroundColor: COLORS.panel,
        overflow: "hidden",
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 1,
          backgroundColor: active ? COLORS.panelRaised : COLORS.panel,
        }}
      >
        <text
          content={`${terminalStatusMarker(session.status)} ${ordinal}:${session.shortLabel} ${compactTerminalText(session.title, 16)}${session.pid ? ` · ${session.pid}` : ""}`}
          style={{ fg: active ? terminalStatusColor(session) : COLORS.muted }}
        />
        <box style={{ flexDirection: "row" }}>
          <InlineButton label="↻" accent={session.accent} onPress={() => onRestart(session.id)} />
          <InlineButton label="×" accent={COLORS.danger} onPress={() => onClose(session.id)} />
        </box>
      </box>
      <embedded-terminal
        ref={terminalRef}
        id={`free-terminal-${session.id}`}
        maxScrollback={5_000}
        selectable
        onData={(data) => onInput(session.id, data)}
        onTerminalResize={(columns, rows) => onResize(session.id, columns, rows)}
        onMouseDown={() => onActivate(session.id)}
        style={{
          width: "100%",
          height: "auto",
          minHeight: 1,
          flexGrow: 1,
          flexShrink: 1,
        }}
      />
    </box>
  )
}, samePane)
