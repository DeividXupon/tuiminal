import type { BoxRenderable, KeyEvent, Renderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRenderableFocus } from "../hooks/use-renderable-focus"
import {
  type AgentMessageHistoryEntry,
  agentMessageElapsedLabel,
  agentMessageModelLabel,
  agentMessageStatusLabel,
} from "../model/agent-message-history"
import { terminalShortcutColor } from "../rendering/terminal-shortcut"
import {
  AgentMessageDetails,
  type AgentMessageDetailView,
  AgentMessageShortcutColor,
} from "./AgentMessageDetails"
import { TerminalInlineButton, TerminalShortcutText } from "./TerminalShortcut"

const TIME_WIDTH = 8
const STATUS_WIDTH = 11
const FLAG_WIDTH = 7
const MODEL_WIDTH = 30
const FIXED_WIDTH = TIME_WIDTH + STATUS_WIDTH + FLAG_WIDTH * 3 + MODEL_WIDTH

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function ignoresHistoryKey(key: KeyEvent, active: boolean) {
  return !active || key.defaultPrevented || key.ctrl || key.meta || key.option || key.super
}

function isInsidePanel(focused: Renderable | null, panel: BoxRenderable | null) {
  for (let current = focused; current; current = current.parent) if (current === panel) return true
  return false
}

type HistoryKeyAction =
  | { type: "close" }
  | { type: "return" }
  | { type: "detail"; view: AgentMessageDetailView | null }
  | { type: "scroll"; amount: number }
  | { type: "select"; delta: number }

const DETAIL_KEY_VIEWS: Readonly<Record<string, AgentMessageDetailView>> = {
  m: "message",
  r: "response",
  a: "activity",
  d: "diff",
}

function navigationAmount(name: string) {
  if (name === "j" || name === "down") return 1
  if (name === "k" || name === "up") return -1
  return 0
}

function historyKeyAction(
  name: string,
  detailView: AgentMessageDetailView | null,
  canOpen: boolean,
  hasRows: boolean,
): HistoryKeyAction | null {
  if (name === "escape") {
    if (detailView && detailView !== "overview") return { type: "detail", view: "overview" }
    return detailView ? { type: "detail", view: null } : { type: "return" }
  }
  if (name === "x") return { type: "close" }
  const amount = navigationAmount(name)
  if (detailView) {
    const target = DETAIL_KEY_VIEWS[name]
    if (target) return { type: "detail", view: target }
    return amount ? { type: "scroll", amount } : null
  }
  if ((name === "enter" || name === "return") && canOpen)
    return { type: "detail", view: "overview" }
  return amount && hasRows ? { type: "select", delta: amount } : null
}

export function AgentMessageHistoryPanel({
  sessionId,
  messages,
  active,
  focusRequest,
  onClose,
  onReturnTerminal,
  onActivateSession,
  onDetailModeChange,
}: {
  sessionId: string
  messages: readonly AgentMessageHistoryEntry[]
  active: boolean
  focusRequest: number
  onClose: (id: string) => void
  onReturnTerminal: (id: string) => void
  onActivateSession: () => void
  onDetailModeChange: (open: boolean) => void
}) {
  const renderer = useRenderer()
  const panel = useRef<BoxRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const previousFocusRequest = useRef(0)
  const previousNewestId = useRef<string | null>(null)
  const rows = useMemo(() => [...messages].reverse(), [messages])
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null)
  const [now, setNow] = useState(Date.now())
  const [width, setWidth] = useState(120)
  const [height, setHeight] = useState(30)
  const [detailView, setDetailView] = useState<AgentMessageDetailView | null>(null)
  const panelFocused = useRenderableFocus(panel)
  const shortcutColor = terminalShortcutColor(active, panelFocused)
  const selectedEntry = rows.find((entry) => entry.id === selectedId) ?? rows[0] ?? null

  const openDetail = (view: AgentMessageDetailView) => {
    if (!selectedEntry) return
    setDetailView(view)
    onDetailModeChange(true)
    queueMicrotask(() => panel.current?.focus())
  }
  const closeDetail = () => {
    setDetailView(null)
    onDetailModeChange(false)
  }

  useEffect(() => {
    if (focusRequest === previousFocusRequest.current) return
    previousFocusRequest.current = focusRequest
    queueMicrotask(() => panel.current?.focus())
  }, [focusRequest])
  useEffect(() => {
    const newestId = rows[0]?.id ?? null
    setSelectedId((current) =>
      !current || current === previousNewestId.current || !rows.some((row) => row.id === current)
        ? newestId
        : current,
    )
    previousNewestId.current = newestId
  }, [rows])
  useEffect(() => {
    if (!active || !messages.length) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [active, messages.length])
  useEffect(() => {
    if (selectedId) list.current?.scrollChildIntoView(`agent-message-${sessionId}-${selectedId}`)
  }, [selectedId, sessionId])

  useKeyboard((key) => {
    if (ignoresHistoryKey(key, active)) return
    if (!isInsidePanel(renderer.currentFocusedRenderable, panel.current)) return
    const action = historyKeyAction(key.name, detailView, Boolean(selectedEntry), rows.length > 0)
    if (!action) return
    consume(key)
    if (action.type === "close") {
      onDetailModeChange(false)
      onClose(sessionId)
    } else if (action.type === "return") {
      onReturnTerminal(sessionId)
    } else if (action.type === "detail") {
      if (action.view === null) closeDetail()
      else openDetail(action.view)
      list.current?.scrollTo(0)
    } else if (action.type === "scroll") {
      list.current?.scrollBy(action.amount)
    } else {
      const current = Math.max(
        0,
        rows.findIndex((entry) => entry.id === selectedId),
      )
      setSelectedId(rows[(current + action.delta + rows.length) % rows.length]?.id ?? null)
    }
  })

  const focusPanel = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    if (active) {
      panel.current?.focus()
      return
    }
    onActivateSession()
    setTimeout(() => panel.current?.focus(), 0)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI focusable boxes do not expose ARIA roles.
    <box
      ref={panel}
      id={`agent-message-history-${sessionId}`}
      focusable
      onMouseDown={focusPanel}
      onSizeChange={function (this: BoxRenderable) {
        setWidth((current) => (current === this.width ? current : this.width))
        setHeight((current) => (current === this.height ? current : this.height))
      }}
      style={{
        flexGrow: 1,
        minHeight: 1,
        minWidth: 1,
        border: ["top"],
        borderColor: active && panelFocused ? BRAND_COLOR : COLORS.border,
        backgroundColor: COLORS.canvas,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <text wrapMode="none">
          <span fg={COLORS.terminal}>
            {detailView ? translateUi("Detalhes da mensagem") : translateUi("Mensagens enviadas")}
          </span>
          <span fg={COLORS.muted}>
            {detailView && selectedEntry
              ? ` · ${agentMessageStatusLabel(selectedEntry, now)}`
              : ` · ${messages.length}`}
          </span>
        </text>
        <TerminalInlineButton
          compact
          id={`agent-message-history-close-${sessionId}`}
          label="×"
          onPress={() => onClose(sessionId)}
        />
      </box>
      {!detailView && (
        <box
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            backgroundColor: COLORS.panelAlt,
          }}
        >
          <text
            content={translateUi("Tempo")}
            wrapMode="none"
            style={{ width: TIME_WIDTH, fg: COLORS.muted, flexShrink: 0 }}
          />
          <text
            content={translateUi("Status")}
            wrapMode="none"
            style={{ width: STATUS_WIDTH, fg: COLORS.muted, flexShrink: 0 }}
          />
          <text
            content={translateUi("Mensagem")}
            wrapMode="none"
            style={{ fg: COLORS.muted, flexGrow: 1 }}
          />
          <text
            content={translateUi("Imagem")}
            wrapMode="none"
            style={{ width: FLAG_WIDTH, fg: COLORS.muted, flexShrink: 0 }}
          />
          <text
            content={translateUi("Áudio")}
            wrapMode="none"
            style={{ width: FLAG_WIDTH, fg: COLORS.muted, flexShrink: 0 }}
          />
          <text
            content={translateUi("Skill")}
            wrapMode="none"
            style={{ width: FLAG_WIDTH, fg: COLORS.muted, flexShrink: 0 }}
          />
          <text
            content={translateUi("Modelo")}
            wrapMode="none"
            style={{ width: MODEL_WIDTH, fg: COLORS.muted, flexShrink: 0 }}
          />
        </box>
      )}
      {!detailView && (
        <scrollbox ref={list} scrollY viewportCulling style={{ flexGrow: 1, minHeight: 1 }}>
          {rows.map((entry) => {
            const selected = entry.id === selectedId
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: rows are selectable with the mouse and J/K.
              <box
                key={entry.id}
                id={`agent-message-${sessionId}-${entry.id}`}
                onMouseDown={(event) => {
                  event.stopPropagation()
                  setSelectedId(entry.id)
                  panel.current?.focus()
                }}
                style={{
                  height: 1,
                  flexShrink: 0,
                  flexDirection: "row",
                  backgroundColor: selected ? COLORS.panelRaised : COLORS.canvas,
                }}
              >
                <text
                  content={`${selected ? "▌" : " "}${agentMessageElapsedLabel(entry.sentAt, now)}`}
                  wrapMode="none"
                  style={{
                    width: TIME_WIDTH,
                    fg: selected ? COLORS.terminal : COLORS.muted,
                    flexShrink: 0,
                  }}
                />
                <text
                  content={truncateDisplay(agentMessageStatusLabel(entry, now), STATUS_WIDTH - 1)}
                  wrapMode="none"
                  style={{ width: STATUS_WIDTH, fg: selected ? COLORS.text : COLORS.muted }}
                />
                <text
                  content={truncateDisplay(entry.text || "—", Math.max(1, width - FIXED_WIDTH - 1))}
                  wrapMode="none"
                  style={{ fg: COLORS.text, flexGrow: 1 }}
                />
                <text
                  content={entry.hasImage ? "  ✓" : ""}
                  wrapMode="none"
                  style={{ width: FLAG_WIDTH, fg: COLORS.success, flexShrink: 0 }}
                />
                <text
                  content={entry.hasAudio ? "  ✓" : ""}
                  wrapMode="none"
                  style={{ width: FLAG_WIDTH, fg: COLORS.success, flexShrink: 0 }}
                />
                <text
                  content={entry.hasSkill ? "  ✓" : ""}
                  wrapMode="none"
                  style={{ width: FLAG_WIDTH, fg: COLORS.success, flexShrink: 0 }}
                />
                <text
                  content={truncateDisplay(agentMessageModelLabel(entry), MODEL_WIDTH - 1)}
                  wrapMode="none"
                  style={{ width: MODEL_WIDTH, fg: COLORS.terminal }}
                />
              </box>
            )
          })}
          {!rows.length && (
            <text
              content={` ${translateUi("Nenhuma mensagem enviada nesta sessão.")}`}
              style={{ fg: COLORS.muted }}
            />
          )}
        </scrollbox>
      )}
      {detailView && selectedEntry && (
        <AgentMessageShortcutColor value={shortcutColor}>
          <AgentMessageDetails
            entry={selectedEntry}
            view={detailView}
            now={now}
            width={width}
            height={Math.max(1, height - 2)}
            scrollRef={list}
            onOpen={openDetail}
          />
        </AgentMessageShortcutColor>
      )}
      <TerminalShortcutText
        content={translateUi(
          detailView
            ? "[M] mensagem · [R] resposta · [A] atividade · [D] diff · [Esc] voltar"
            : "[J/K] navegar · [Enter] abrir · [Esc] terminal · [X] fechar",
        )}
        shortcutColor={shortcutColor}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </box>
  )
}
