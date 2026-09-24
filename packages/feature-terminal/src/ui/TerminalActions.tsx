import type { BoxRenderable, InputRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useMemo, useRef, useState } from "react"
import type { CodexResumeThread } from "../model/codex-resume-threads"
import { TERMINAL_ACTIONS, TERMINAL_ACTION_TAG_LABELS } from "../model/terminal-actions"
import { TerminalActionRow } from "./TerminalActionRow"
import { TerminalAgentResponsePanel, TerminalResumeThreadRow } from "./TerminalResumeThreads"
import { TerminalShortcutText } from "./TerminalShortcut"

export { TERMINAL_ACTIONS } from "../model/terminal-actions"

export function terminalActionKey(key: {
  name: string
  sequence?: string
  raw?: string
  meta?: boolean
  option?: boolean
  ctrl?: boolean
  shift?: boolean
  super?: boolean
}) {
  if (key.meta || key.option) {
    if (key.ctrl || key.shift || key.super) return null
    const number = [key.name, key.sequence, key.raw].find((value) => /^[1-5]$/.test(value ?? ""))
    return number ? `alt+${number}` : null
  }
  if (key.ctrl || key.shift || key.super) return null
  return [key.name, key.sequence, key.raw].includes(",") ? "," : key.name
}

function matchesQuery(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}

function consumeKey(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function terminalActionDirection(key: KeyEvent, searchFocused: boolean) {
  if (key.name === "up" || (!searchFocused && key.name.toLowerCase() === "k")) return -1
  if (key.name === "down" || (!searchFocused && key.name.toLowerCase() === "j")) return 1
  return 0
}

function terminalActionPanel(key: KeyEvent, searchFocused: boolean) {
  if (searchFocused) return null
  if (key.name === "left") return "actions" as const
  if (key.name === "right") return "agents" as const
  return null
}

function isSlashKey(key: KeyEvent) {
  return key.name === "/" || key.sequence === "/" || key.raw === "/"
}

export function TerminalActions({
  width,
  height,
  recentThreads = [],
  onAction,
  onSelectThread,
  disabled,
}: {
  width: number
  height: number
  recentThreads?: readonly CodexResumeThread[]
  onAction: (key: string) => void
  onSelectThread?: (id: string) => void
  disabled: (key: string) => boolean
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const input = useRef<InputRenderable | null>(null)
  const actionList = useRef<ScrollBoxRenderable | null>(null)
  const agentList = useRef<ScrollBoxRenderable | null>(null)
  const [query, setQuery] = useState("")
  const [activePanel, setActivePanel] = useState<"actions" | "agents">("actions")
  const [selectedAction, setSelectedAction] = useState(0)
  const [selectedAgent, setSelectedAgent] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const actions = useMemo(
    () =>
      TERMINAL_ACTIONS.filter(
        ({ label, description, tags }) =>
          !query.trim() ||
          matchesQuery(
            `${translateUi(label)} ${translateUi(description)} ${tags
              .map((tag) => translateUi(TERMINAL_ACTION_TAG_LABELS[tag]))
              .join(" ")}`,
            query,
          ),
      ),
    [query],
  )
  const threads = useMemo(
    () =>
      recentThreads.filter(
        (thread) =>
          !query.trim() || matchesQuery(`${thread.title} ${thread.preview} ${thread.cwd}`, query),
      ),
    [query, recentThreads],
  )
  const selectedThread = activePanel === "agents" ? threads[selectedAgent] : undefined
  const dialogWidth = Math.max(1, Math.min(120, width - 2))
  const dialogHeight = Math.max(1, Math.min(30, height - 2))
  const panelContentWidth = Math.max(1, Math.floor((dialogWidth - 9) / 2))
  const actionPanelBackground = activePanel === "actions" ? COLORS.panelAlt : COLORS.panel
  const agentPanelBackground = activePanel === "agents" ? COLORS.panelAlt : COLORS.panel

  useEffect(() => {
    dialog.current?.focus()
  }, [])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    setSelectedAction((current) => Math.min(current, Math.max(0, actions.length - 1)))
  }, [actions.length])
  useEffect(() => {
    setSelectedAgent((current) => Math.min(current, Math.max(0, threads.length - 1)))
  }, [threads.length])
  useEffect(() => {
    const key = actions[selectedAction]?.key
    if (activePanel === "actions" && key)
      actionList.current?.scrollChildIntoView(`terminal-action-${key}`)
  }, [actions, activePanel, selectedAction])
  useEffect(() => {
    const id = threads[selectedAgent]?.id
    if (activePanel === "agents" && id)
      agentList.current?.scrollChildIntoView(`terminal-resume-thread-${id}`)
  }, [activePanel, selectedAgent, threads])

  const choose = () => {
    if (activePanel === "actions") {
      const action = actions[selectedAction]
      if (action && !disabled(action.key)) onAction(action.key)
      return
    }
    const thread = threads[selectedAgent]
    if (thread) onSelectThread?.(thread.id)
  }
  const close = () => onAction("escape")

  useKeyboard((key) => {
    const searchFocused = input.current?.focused ?? false
    if (key.name === "escape") {
      consumeKey(key)
      if (searchFocused) {
        input.current?.blur()
        dialog.current?.focus()
      } else close()
      return
    }
    if (!searchFocused && isSlashKey(key)) {
      consumeKey(key)
      input.current?.focus()
      return
    }
    const panel = terminalActionPanel(key, searchFocused)
    if (panel) {
      consumeKey(key)
      setActivePanel(panel)
      return
    }
    const direction = terminalActionDirection(key, searchFocused)
    const itemCount = activePanel === "actions" ? actions.length : threads.length
    if (direction && itemCount) {
      consumeKey(key)
      if (activePanel === "actions")
        setSelectedAction((current) => (current + direction + itemCount) % itemCount)
      else setSelectedAgent((current) => (current + direction + itemCount) % itemCount)
      return
    }
    if (key.name === "enter" || key.name === "return") {
      consumeKey(key)
      choose()
    }
  })

  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-actions"
      width={dialogWidth}
      height={dialogHeight}
      borderColor={COLORS.terminal}
      backgroundColor={COLORS.canvas}
      backdropOpacity={0}
      zIndex={780}
      onBackdropPress={close}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text
          content={`◆ ${translateUi("Master Key")}`}
          style={{ flexGrow: 1, fg: COLORS.terminal }}
        />
        <TerminalShortcutText content="[/] buscar" style={{ flexShrink: 0, fg: COLORS.muted }} />
      </box>
      <input
        ref={input}
        id="terminal-action-search"
        value={query}
        placeholder={translateUi("Pesquisar ações e agentes…")}
        onInput={setQuery}
        onMouseDown={() => input.current?.focus()}
        width="100%"
        style={{
          backgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedBackgroundColor: COLORS.panelRaised,
          focusedTextColor: COLORS.text,
        }}
      />
      <box
        id="terminal-master-key-panels"
        style={{ flexGrow: 1, minHeight: 1, flexDirection: "row", gap: 1 }}
      >
        <box
          id="terminal-action-panel"
          style={{
            flexGrow: 1,
            flexBasis: 0,
            minWidth: 1,
            backgroundColor: actionPanelBackground,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={`${activePanel === "actions" ? "›" : " "} ${translateUi("AÇÕES")}`}
            style={{
              height: 1,
              flexShrink: 0,
              fg: activePanel === "actions" ? COLORS.focus : COLORS.muted,
            }}
          />
          <scrollbox ref={actionList} id="terminal-action-results" scrollY style={{ flexGrow: 1 }}>
            {actions.map((action, index) => {
              const active = activePanel === "actions" && selectedAction === index
              const actionDisabled = disabled(action.key)
              return (
                <TerminalActionRow
                  key={action.key}
                  action={action}
                  active={active}
                  disabled={actionDisabled}
                  backgroundColor={actionPanelBackground}
                  descriptionWidth={panelContentWidth}
                  onSelect={() => {
                    setActivePanel("actions")
                    setSelectedAction(index)
                    if (!actionDisabled) onAction(action.key)
                  }}
                />
              )
            })}
            {query.trim() && actions.length === 0 && (
              <text content={translateUi("Nenhum resultado.")} style={{ fg: COLORS.muted }} />
            )}
          </scrollbox>
        </box>
        <box
          id="terminal-agent-panel"
          style={{
            flexGrow: 1,
            flexBasis: 0,
            minWidth: 1,
            backgroundColor: agentPanelBackground,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={`${activePanel === "agents" ? "›" : " "} ${translateUi("AGENTES · CODEX /RESUME")}`}
            style={{
              height: 1,
              flexShrink: 0,
              fg: activePanel === "agents" ? COLORS.focus : COLORS.muted,
            }}
          />
          <scrollbox ref={agentList} id="terminal-agent-results" scrollY style={{ flexGrow: 1 }}>
            {threads.map((thread, index) => (
              <TerminalResumeThreadRow
                key={thread.id}
                thread={thread}
                active={activePanel === "agents" && selectedAgent === index}
                width={panelContentWidth}
                now={now}
                backgroundColor={agentPanelBackground}
                onSelect={(id) => {
                  setActivePanel("agents")
                  setSelectedAgent(index)
                  onSelectThread?.(id)
                }}
              />
            ))}
            {!query.trim() && recentThreads.length === 0 && (
              <text
                content={translateUi("Nenhuma conversa disponível no /resume do Codex local.")}
                style={{ fg: COLORS.muted }}
              />
            )}
            {query.trim() && threads.length === 0 && (
              <text content={translateUi("Nenhum resultado.")} style={{ fg: COLORS.muted }} />
            )}
          </scrollbox>
          {selectedThread && <TerminalAgentResponsePanel thread={selectedThread} now={now} />}
        </box>
      </box>
      <TerminalShortcutText
        content="[←/→] painel · [↑/↓] navegar · [Enter] abrir · [Esc] fechar"
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </ModalSurface>
  )
}
