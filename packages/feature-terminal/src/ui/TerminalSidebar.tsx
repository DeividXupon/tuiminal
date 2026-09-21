import type { BoxRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { focusedRenderableId } from "@xupon/tuiminal-core/keyboard/scope"
import {
  COLORS,
  matchesTerminalMasterKey,
  type TerminalMasterKey,
} from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import {
  isRunningAgent,
  terminalSections,
  type TerminalFolder,
  type TerminalSession,
} from "../model/sessions"
import { AGENT_WORKING_FRAMES } from "../rendering/agent-presentation"
import { TerminalAgentList } from "./TerminalAgentList"
import { TerminalSessionGroups } from "./TerminalSessionGroups"
import {
  TerminalSidebarFocusSweep,
  useTerminalSidebarFocusSweep,
} from "./TerminalSidebarFocusSweep"
export { terminalSidebarFocusSweep } from "./TerminalSidebarFocusSweep"

function consumeKey(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function handleMasterKey(key: KeyEvent, masterKey: TerminalMasterKey, onMasterKey?: () => void) {
  if (!onMasterKey || !matchesTerminalMasterKey(key, masterKey)) return false
  consumeKey(key)
  onMasterKey()
  return true
}

function handleEscapeKey(key: KeyEvent, onEscape: (() => void) | undefined, blur: () => void) {
  if (key.name !== "escape") return false
  consumeKey(key)
  if (onEscape) onEscape()
  else blur()
  return true
}

function handleMovementKey(
  key: KeyEvent,
  navigationIds: string[],
  cursorRef: { current: string | null },
  setCursorId: (id: string) => void,
) {
  const direction = ["up", "k"].includes(key.name) ? -1 : ["down", "j"].includes(key.name) ? 1 : 0
  if (!direction || !navigationIds.length) return false
  consumeKey(key)
  const index = navigationIds.indexOf(cursorRef.current ?? "")
  const origin = index >= 0 ? index : direction > 0 ? -1 : 0
  const next = navigationIds[(origin + direction + navigationIds.length) % navigationIds.length]
  if (next) {
    cursorRef.current = next
    setCursorId(next)
  }
  return true
}

function handleActivationKey(
  key: KeyEvent,
  cursorId: string | null,
  onActivate: (id: string) => void,
) {
  if (!cursorId || (key.name !== "enter" && key.name !== "return")) return false
  consumeKey(key)
  onActivate(cursorId)
  return true
}

function handleSidebarKey(
  key: KeyEvent,
  options: {
    masterKey: TerminalMasterKey
    navigationIds: string[]
    cursorRef: { current: string | null }
    setCursorId: (id: string) => void
    onActivate: (id: string) => void
    onMasterKey: (() => void) | undefined
    onEscape: (() => void) | undefined
    blur: () => void
  },
) {
  if (handleMasterKey(key, options.masterKey, options.onMasterKey)) return
  if (handleEscapeKey(key, options.onEscape, options.blur)) return
  if (handleMovementKey(key, options.navigationIds, options.cursorRef, options.setCursorId)) return
  handleActivationKey(key, options.cursorRef.current, options.onActivate)
}

export function TerminalSidebar({
  active = true,
  sessions,
  folders,
  selectedFolder,
  activeSessionId,
  width,
  height,
  masterKey,
  onSelectFolder,
  onActivate,
  onActions,
  onNew,
  onFolder,
  navigationOnly = false,
  autoFocus = false,
  focusRequest = 0,
  onMasterKey,
  onEscape,
}: {
  active?: boolean
  sessions: TerminalSession[]
  folders: TerminalFolder[]
  selectedFolder: string
  activeSessionId: string | null
  width: number
  height: number
  masterKey: TerminalMasterKey
  onSelectFolder: (id: string) => void
  onActivate: (id: string) => void
  onActions: () => void
  onNew: () => void
  onFolder: () => void
  navigationOnly?: boolean
  autoFocus?: boolean
  focusRequest?: number
  onMasterKey?: () => void
  onEscape?: () => void
}) {
  const renderer = useRenderer()
  const sections = useMemo(
    () => terminalSections(sessions.filter((session) => !isRunningAgent(session))),
    [sessions],
  )
  const navigationIds = useMemo(
    () => [
      ...folders.flatMap((folder) =>
        sections
          .filter((section) => section.folderId === folder.id)
          .flatMap((section) => section.panes.map((pane) => pane.id)),
      ),
      ...sessions.filter(isRunningAgent).map((session) => session.id),
    ],
    [folders, sections, sessions],
  )
  const selectedSession = sessions.find((session) => session.id === activeSessionId)
  const activeFolder = selectedSession?.folderId
  const activeAgent = Boolean(selectedSession && isRunningAgent(selectedSession))
  const agentCount = sessions.filter(isRunningAgent).length
  const compactAgents = height < 10
  const showSessionHeading = !agentCount || height >= 6
  const showCreationActions = !navigationOnly && (!agentCount || height >= 8)
  const fixedHeight =
    Number(showSessionHeading) + (showCreationActions ? 2 : 0) + (navigationOnly ? 2 : 1)
  const agentHeight = agentCount
    ? Math.min(
        Math.max(1, height - fixedHeight),
        Math.max(compactAgents ? 2 : 4, Math.floor(height * 0.4)),
      )
    : 3
  const [frame, setFrame] = useState(0)
  const working = sessions.some(
    (session) => session.status === "running" && session.agent?.state === "working",
  )
  useEffect(() => {
    if (!active || !working || process.env.TUIMINAL_TEST_STATIC_LOADERS === "1") return
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % AGENT_WORKING_FRAMES.length)
    }, 100)
    return () => clearInterval(timer)
  }, [active, working])
  const sidebarRef = useRef<BoxRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const { frame: focusSweepFrame, start: startFocusSweep } = useTerminalSidebarFocusSweep()
  const [cursorId, setCursorId] = useState<string | null>(
    activeSessionId && navigationIds.includes(activeSessionId)
      ? activeSessionId
      : (navigationIds[0] ?? null),
  )
  const cursorRef = useRef(cursorId)
  const previousFocusRequest = useRef(focusRequest)
  useEffect(() => {
    setCursorId((current) => {
      const next =
        current && navigationIds.includes(current)
          ? current
          : activeSessionId && navigationIds.includes(activeSessionId)
            ? activeSessionId
            : (navigationIds[0] ?? null)
      cursorRef.current = next
      return next
    })
  }, [activeSessionId, navigationIds])
  useEffect(() => {
    if (!autoFocus) return
    queueMicrotask(() => sidebarRef.current?.focus())
  }, [autoFocus])
  useEffect(() => {
    if (focusRequest === previousFocusRequest.current) return
    previousFocusRequest.current = focusRequest
    const nextCursor =
      activeSessionId && navigationIds.includes(activeSessionId)
        ? activeSessionId
        : (navigationIds[0] ?? null)
    cursorRef.current = nextCursor
    setCursorId(nextCursor)
    startFocusSweep()
    queueMicrotask(() => sidebarRef.current?.focus())
  }, [activeSessionId, focusRequest, navigationIds, startFocusSweep])
  useKeyboard((key) => {
    if (!active || key.defaultPrevented) return
    const focusedId = focusedRenderableId(renderer.currentFocusedRenderable) ?? ""
    if (!navigationOnly && !focusedId.startsWith("terminal-sidebar")) return
    handleSidebarKey(key, {
      masterKey,
      navigationIds,
      cursorRef,
      setCursorId,
      onActivate,
      onMasterKey,
      onEscape,
      blur: () => renderer.currentFocusedRenderable?.blur(),
    })
  })
  useEffect(() => {
    const cursor = sessions.find((session) => session.id === cursorId)
    if (cursor && !isRunningAgent(cursor))
      scrollRef.current?.scrollChildIntoView(`terminal-sidebar-pane-${cursor.id}`)
    else if (!cursor && !activeAgent && activeFolder === selectedFolder)
      scrollRef.current?.scrollChildIntoView(`terminal-sidebar-pane-${activeSessionId}`)
  }, [activeSessionId, activeFolder, activeAgent, cursorId, selectedFolder, sessions])
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes own native terminal focus and do not expose ARIA roles.
    <box
      id="terminal-sidebar"
      ref={sidebarRef}
      focusable
      onMouseDown={() => {
        startFocusSweep()
        sidebarRef.current?.focus()
      }}
      style={{
        width,
        height,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
        backgroundColor: COLORS.canvas,
        border: ["right"],
        borderColor: COLORS.border,
      }}
    >
      <TerminalSidebarFocusSweep width={width} height={height} frame={focusSweepFrame} />
      {showSessionHeading && (
        <box
          style={{
            height: 1,
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            flexShrink: 0,
          }}
        >
          <>
            <text
              content={truncateDisplay(translateUi("Sessões"), width - 6)}
              style={{ fg: COLORS.muted, flexGrow: 1 }}
            />
            <text
              id="terminal-sidebar-count"
              content={String(sections.length)}
              style={{ fg: COLORS.muted }}
            />
          </>
        </box>
      )}
      <scrollbox
        ref={scrollRef}
        scrollY
        style={{ flexGrow: 1, minHeight: agentCount ? 0 : 1, width: "100%" }}
      >
        <TerminalSessionGroups
          folders={folders}
          sections={sections}
          selectedFolder={selectedFolder}
          activeSessionId={activeSessionId}
          cursorId={cursorId}
          width={width}
          onSelectFolder={onSelectFolder}
          onActivate={(id) => {
            cursorRef.current = id
            setCursorId(id)
            onActivate(id)
          }}
        />
      </scrollbox>
      {showCreationActions && (
        <>
          <InlineButton
            compact
            id="terminal-sidebar-new"
            label="Novo terminal"
            accent={COLORS.terminal}
            onPress={onNew}
          />
          <InlineButton
            compact
            id="terminal-sidebar-new-folder"
            label="Nova pasta"
            onPress={onFolder}
          />
        </>
      )}
      {(agentCount > 0 || !compactAgents) && (
        <TerminalAgentList
          compact={compactAgents}
          frame={frame}
          sessions={sessions}
          activeSessionId={activeSessionId}
          cursorSessionId={cursorId}
          width={width - 1}
          height={agentHeight}
          onActivate={(id) => {
            cursorRef.current = id
            setCursorId(id)
            onActivate(id)
          }}
        />
      )}
      {navigationOnly && (
        <ShortcutText
          content="[↑/↓] [Enter]"
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      )}
      <InlineButton
        compact
        id="terminal-sidebar-actions"
        label={`[${masterKey}]`}
        accent={COLORS.terminal}
        onPress={onActions}
      />
    </box>
  )
}
