import type { BoxRenderable, InputRenderable, KeyEvent } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useMemo, useRef, useState } from "react"
import type { AgentProviderId } from "../model/agent-provider"
import {
  type AgentResumePaginationState,
  type AgentResumeTab,
  type AgentResumeThread,
  agentResumeThreadKey,
  agentResumeThreadsForTab,
  DEFAULT_AGENT_RESUME_PAGINATION,
} from "../model/agent-resume-thread"
import { TERMINAL_ACTION_TAG_LABELS, TERMINAL_ACTIONS } from "../model/terminal-actions"
import { TerminalActionListPanel } from "./TerminalActionListPanel"
import { TerminalResumePanel } from "./TerminalResumePanel"
import { adjacentAgentResumeTab } from "./TerminalResumeTabs"
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
  if (key.ctrl || key.super) return null
  if (key.shift) {
    const name = key.name.toLowerCase()
    return ["h", "l"].includes(name) ? `shift+${name}` : null
  }
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
  if (searchFocused || key.ctrl || key.meta || key.option || key.shift || key.super) return null
  const name = key.name.toLowerCase()
  if (name === "left" || name === "h") return "actions" as const
  if (name === "right" || name === "l") return "agents" as const
  return null
}

function isSlashKey(key: KeyEvent) {
  return key.name === "/" || key.sequence === "/" || key.raw === "/"
}

function handleDialogKey(
  key: KeyEvent,
  searchFocused: boolean,
  input: InputRenderable | null,
  dialog: BoxRenderable | null,
  close: () => void,
) {
  if (key.name === "escape") {
    consumeKey(key)
    if (searchFocused) {
      input?.blur()
      dialog?.focus()
    } else close()
    return true
  }
  if (!searchFocused && isSlashKey(key)) {
    consumeKey(key)
    input?.focus()
    return true
  }
  return false
}

function resumeTabDirection(key: KeyEvent, searchFocused: boolean, panel: TerminalActionPanel) {
  if (searchFocused || panel !== "agents") return 0
  if (key.name.toLowerCase() === "z") return -1 as const
  if (key.name.toLowerCase() === "v") return 1 as const
  return 0
}

function nextPanel(current: TerminalActionPanel, requested: TerminalActionPanel) {
  if (current !== requested) return requested
  return requested === "actions" ? "agents" : "actions"
}

export type TerminalActionPanel = "actions" | "agents"

function TerminalActionTabs({
  visible,
  activePanel,
  onSelect,
}: {
  visible: boolean
  activePanel: TerminalActionPanel
  onSelect: (panel: TerminalActionPanel) => void
}) {
  if (!visible) return null
  return (
    <box id="terminal-master-key-tabs" style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <InlineButton
        id="terminal-action-tab-actions"
        label="AÇÕES"
        selected={activePanel === "actions"}
        accent={COLORS.terminal}
        onPress={() => onSelect("actions")}
      />
      <InlineButton
        id="terminal-action-tab-agents"
        label="AGENTES"
        selected={activePanel === "agents"}
        accent={COLORS.terminal}
        onPress={() => onSelect("agents")}
      />
    </box>
  )
}

export function TerminalActions({
  width,
  height,
  recentThreads = [],
  activeRemoteProfileId,
  resumePagination = DEFAULT_AGENT_RESUME_PAGINATION,
  onLoadMoreThreads,
  onAction,
  onSelectThread,
  disabled,
  compact = false,
  inactive = false,
  initialPanel = "actions",
}: {
  width: number
  height: number
  recentThreads?: readonly AgentResumeThread[]
  activeRemoteProfileId?: string | undefined
  resumePagination?: AgentResumePaginationState | undefined
  onLoadMoreThreads?: (providerId: AgentProviderId) => void
  onAction: (key: string) => void
  onSelectThread?: (thread: AgentResumeThread) => void
  disabled: (key: string) => boolean
  compact?: boolean
  /** Renders without taking focus or keyboard input, as in simulated tutorials. */
  inactive?: boolean
  initialPanel?: TerminalActionPanel
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const input = useRef<InputRenderable | null>(null)
  const [query, setQuery] = useState("")
  const [activePanel, setActivePanel] = useState<TerminalActionPanel>(initialPanel)
  const [activeResumeTab, setActiveResumeTab] = useState<AgentResumeTab>("global")
  const [selectedAction, setSelectedAction] = useState(0)
  const [selectedAgentKey, setSelectedAgentKey] = useState<string | null>(null)
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
      agentResumeThreadsForTab(
        recentThreads,
        activeResumeTab,
        activeRemoteProfileId,
        resumePagination.limits,
      ).filter(
        (thread) =>
          !query.trim() ||
          matchesQuery(
            `${thread.title} ${thread.preview} ${thread.cwd} ${thread.projectName} ${thread.gitBranch} ${thread.remoteProfileName ?? ""}`,
            query,
          ),
      ),
    [activeRemoteProfileId, activeResumeTab, query, recentThreads, resumePagination.limits],
  )
  const selectedAgent = Math.max(
    0,
    selectedAgentKey
      ? threads.findIndex((thread) => agentResumeThreadKey(thread) === selectedAgentKey)
      : 0,
  )
  const dialogWidth = compact ? width : Math.max(1, Math.min(120, width - 2))
  const dialogHeight = Math.max(1, Math.min(compact ? 24 : 30, height - 2))
  const panelContentWidth = Math.max(
    1,
    compact ? dialogWidth - 4 : Math.floor((dialogWidth - 9) / 2),
  )
  const actionPanelBackground = activePanel === "actions" ? COLORS.panelAlt : COLORS.panel
  const agentPanelBackground = activePanel === "agents" ? COLORS.panelAlt : COLORS.panel

  useEffect(() => {
    if (!inactive) dialog.current?.focus()
  }, [inactive])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    setSelectedAction((current) => Math.min(current, Math.max(0, actions.length - 1)))
  }, [actions.length])
  useEffect(() => {
    const selected = selectedAgentKey
      ? threads.some((thread) => agentResumeThreadKey(thread) === selectedAgentKey)
      : false
    if (!selected) setSelectedAgentKey(threads[0] ? agentResumeThreadKey(threads[0]) : null)
  }, [selectedAgentKey, threads])
  const choose = () => {
    if (activePanel === "actions") {
      const action = actions[selectedAction]
      if (action && !disabled(action.key)) onAction(action.key)
      return
    }
    const thread = threads[selectedAgent]
    if (thread) onSelectThread?.(thread)
  }
  const close = () => onAction("escape")
  const moveListSelection = (direction: number) => {
    const itemCount = activePanel === "actions" ? actions.length : threads.length
    if (!itemCount) return false
    if (activePanel === "actions")
      setSelectedAction((current) => (current + direction + itemCount) % itemCount)
    else if (
      direction > 0 &&
      selectedAgent === itemCount - 1 &&
      activeResumeTab !== "global" &&
      resumePagination.hasMore[activeResumeTab]
    )
      onLoadMoreThreads?.(activeResumeTab)
    else {
      const next = (selectedAgent + direction + itemCount) % itemCount
      const thread = threads[next]
      if (thread) setSelectedAgentKey(agentResumeThreadKey(thread))
    }
    return true
  }

  useKeyboard((key) => {
    if (inactive) return
    const searchFocused = input.current?.focused ?? false
    if (handleDialogKey(key, searchFocused, input.current, dialog.current, close)) return
    if (!searchFocused && key.name === "tab") {
      consumeKey(key)
      setActivePanel((current) => nextPanel(current, current))
      return
    }
    const panel = terminalActionPanel(key, searchFocused)
    if (panel) {
      consumeKey(key)
      setActivePanel(panel)
      return
    }
    const tabDirection = resumeTabDirection(key, searchFocused, activePanel)
    if (tabDirection) {
      consumeKey(key)
      setActiveResumeTab((current) => adjacentAgentResumeTab(current, tabDirection))
      setSelectedAgentKey(null)
      return
    }
    const direction = terminalActionDirection(key, searchFocused)
    if (direction && moveListSelection(direction)) {
      consumeKey(key)
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
      border={!compact}
      placement={compact ? "bottom" : "center"}
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
      <TerminalActionTabs visible={compact} activePanel={activePanel} onSelect={setActivePanel} />
      <box
        id="terminal-master-key-panels"
        style={{ flexGrow: 1, minHeight: 1, flexDirection: "row", gap: 1 }}
      >
        {(!compact || activePanel === "actions") && (
          <TerminalActionListPanel
            compact={compact}
            active={activePanel === "actions"}
            backgroundColor={actionPanelBackground}
            actions={actions}
            selectedIndex={selectedAction}
            descriptionWidth={panelContentWidth}
            query={query}
            disabled={disabled}
            onSelect={(index, action) => {
              setActivePanel("actions")
              setSelectedAction(index)
              if (!disabled(action.key)) onAction(action.key)
            }}
          />
        )}
        {(!compact || activePanel === "agents") && (
          <TerminalResumePanel
            compact={compact}
            active={activePanel === "agents"}
            backgroundColor={agentPanelBackground}
            threads={threads}
            query={query}
            selectedIndex={selectedAgent}
            width={panelContentWidth}
            now={now}
            activeTab={activeResumeTab}
            pagination={resumePagination}
            onSelectTab={(tab) => {
              setActivePanel("agents")
              setActiveResumeTab(tab)
              setSelectedAgentKey(null)
            }}
            onSelectThread={(thread) => {
              setActivePanel("agents")
              setSelectedAgentKey(agentResumeThreadKey(thread))
              onSelectThread?.(thread)
            }}
            onReachEnd={() => {
              if (activeResumeTab !== "global") onLoadMoreThreads?.(activeResumeTab)
            }}
          />
        )}
      </box>
      <TerminalShortcutText
        content="[←/→ H/L] painel · [Z←] [→V] agente · [↑/↓] navegar · [Enter] abrir · [Esc] fechar"
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </ModalSurface>
  )
}
