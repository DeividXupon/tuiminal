import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { focusedRenderableId } from "@xupon/tuiminal-core/keyboard/scope"
import { COLORS, type TerminalMasterKey } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import {
  isRunningAgent,
  masterKeyShortcutLabel,
  numberedTerminalSections,
  orderedRunningAgents,
  type TerminalFolder,
  type TerminalSession,
  visibleTerminalShortcutTargets,
} from "../model/sessions"
import { AGENT_WORKING_FRAMES } from "../rendering/agent-presentation"
import { TerminalAgentList } from "./TerminalAgentList"
import { TerminalSessionGroups } from "./TerminalSessionGroups"
import {
  TerminalSidebarFocusSweep,
  useTerminalSidebarFocusSweep,
} from "./TerminalSidebarFocusSweep"
import { handleSidebarKey } from "./terminal-sidebar-keyboard"

export { terminalSidebarFocusSweep } from "./TerminalSidebarFocusSweep"

const FOLDER_CURSOR_PREFIX = "terminal-folder:"

function folderCursorId(id: string) {
  return `${FOLDER_CURSOR_PREFIX}${id}`
}

function cursorFolderId(id: string | null) {
  return id?.startsWith(FOLDER_CURSOR_PREFIX) ? id.slice(FOLDER_CURSOR_PREFIX.length) : null
}

export const TerminalSidebar = memo(function TerminalSidebar({
  active = true,
  sessions,
  folders,
  selectedFolder,
  activeSessionId,
  width,
  height,
  masterKey,
  onSelectFolder,
  collapsedFolderIds = [],
  onToggleFolder = () => undefined,
  onActivate,
  onActions,
  onNew,
  onCommand,
  navigationOnly = false,
  autoFocus = false,
  focusRequest = 0,
  onMasterKey,
  onEscape,
  borderRight = true,
  masterKeyActive = false,
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
  collapsedFolderIds?: readonly string[]
  onToggleFolder?: (id: string) => void
  onActivate: (id: string) => void
  onActions: () => void
  onNew: () => void
  onCommand?: (() => void) | undefined
  navigationOnly?: boolean
  autoFocus?: boolean
  focusRequest?: number
  onMasterKey?: () => void
  onEscape?: () => void
  borderRight?: boolean
  /** Shows the direct Master Key target beside each visible agent or terminal. */
  masterKeyActive?: boolean
}) {
  const renderer = useRenderer()
  const sections = useMemo(() => numberedTerminalSections(sessions), [sessions])
  const visibleFolders = useMemo(
    () => folders.filter((folder) => sections.some((section) => section.folderId === folder.id)),
    [folders, sections],
  )
  const collapsedFolders = useMemo(() => new Set(collapsedFolderIds), [collapsedFolderIds])
  const shortcuts = useMemo(
    () =>
      masterKeyActive
        ? new Map(
            visibleTerminalShortcutTargets(sessions, folders, collapsedFolderIds).flatMap(
              (session, index) => {
                const shortcut = masterKeyShortcutLabel(index)
                return shortcut ? [[session.id, shortcut]] : []
              },
            ),
          )
        : new Map<string, string>(),
    [collapsedFolderIds, folders, masterKeyActive, sessions],
  )
  const navigationIds = useMemo(
    () => [
      ...orderedRunningAgents(sessions).map((session) => session.id),
      ...visibleFolders.flatMap((folder) => [
        folderCursorId(folder.id),
        ...(collapsedFolders.has(folder.id)
          ? []
          : sections
              .filter((section) => section.folderId === folder.id)
              .flatMap((section) => section.panes.map((pane) => pane.id))),
      ]),
    ],
    [collapsedFolders, visibleFolders, sections, sessions],
  )
  const selectedSession = sessions.find((session) => session.id === activeSessionId)
  const activeFolder = selectedSession?.folderId
  const activeAgent = Boolean(selectedSession && isRunningAgent(selectedSession))
  const agentCount = sessions.filter(isRunningAgent).length
  const compactAgents = height < 10
  const showSessionHeading = !agentCount || height >= 6
  const showCreationActions = !navigationOnly && (!agentCount || height >= 8)
  const fixedHeight =
    Number(showSessionHeading) +
    Number(showCreationActions) * (onCommand ? 2 : 1) +
    (navigationOnly ? 2 : 1)
  const agentHeight = agentCount
    ? Math.min(
        Math.max(1, height - fixedHeight),
        Math.max(compactAgents ? 2 : 5, Math.floor(height * 0.4)),
      )
    : 3
  const [frame, setFrame] = useState(0)
  const animatingAgents = sessions.some(
    (session) =>
      session.status === "running" &&
      (session.agent?.state === "working" || session.agentIntegration === "codex-app-server"),
  )
  useEffect(() => {
    if (!active || !animatingAgents || process.env.TUIMINAL_TEST_STATIC_LOADERS === "1") return
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % AGENT_WORKING_FRAMES.length)
    }, 100)
    return () => clearInterval(timer)
  }, [active, animatingAgents])
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
  const selectFolder = (id: string) => {
    const cursor = folderCursorId(id)
    cursorRef.current = cursor
    setCursorId(cursor)
    onSelectFolder(id)
    queueMicrotask(() => sidebarRef.current?.focus())
  }
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
      onActivate: (id) => {
        const folderId = cursorFolderId(id)
        if (folderId) {
          selectFolder(folderId)
          onToggleFolder(folderId)
          return
        }
        onActivate(id)
      },
      onMasterKey,
      onEscape,
      blur: () => renderer.currentFocusedRenderable?.blur(),
    })
  })
  useEffect(() => {
    const folderId = cursorFolderId(cursorId)
    if (folderId) {
      scrollRef.current?.scrollChildIntoView(`terminal-sidebar-folder-${folderId}`)
      return
    }
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
      onMouseDown={(event) => {
        if (event.button !== 0 || event.target?.id !== "terminal-sidebar") return
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
        ...(borderRight ? { border: ["right"] as const, borderColor: COLORS.border } : {}),
      }}
    >
      <TerminalSidebarFocusSweep width={width} height={height} frame={focusSweepFrame} />
      {(agentCount > 0 || !compactAgents) && (
        <TerminalAgentList
          compact={compactAgents}
          frame={frame}
          sessions={sessions}
          activeSessionId={activeSessionId}
          cursorSessionId={cursorId}
          shortcuts={shortcuts}
          width={width - Number(borderRight)}
          height={agentHeight}
          onActivate={(id) => {
            cursorRef.current = id
            setCursorId(id)
            onActivate(id)
          }}
        />
      )}
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
          <text
            content={truncateDisplay(translateUi("Terminais"), width - 6)}
            style={{ fg: COLORS.muted, flexGrow: 1 }}
          />
          <text
            id="terminal-sidebar-count"
            content={String(sections.length)}
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
      <scrollbox
        ref={scrollRef}
        scrollY
        style={{ flexGrow: 1, minHeight: agentCount ? 0 : 1, width: "100%" }}
      >
        <TerminalSessionGroups
          folders={visibleFolders}
          sections={sections}
          selectedFolder={selectedFolder}
          activeSessionId={activeSessionId}
          cursorId={cursorId}
          cursorFolderId={cursorFolderId(cursorId)}
          collapsedFolderIds={collapsedFolders}
          width={width}
          shortcuts={shortcuts}
          onSelectFolder={selectFolder}
          onToggleFolder={onToggleFolder}
          onActivate={(id) => {
            cursorRef.current = id
            setCursorId(id)
            onActivate(id)
          }}
        />
      </scrollbox>
      {showCreationActions && (
        <InlineButton
          compact
          id="terminal-sidebar-new"
          label="Novo terminal"
          accent={COLORS.terminal}
          onPress={onNew}
        />
      )}
      {showCreationActions && onCommand && (
        <InlineButton
          compact
          id="terminal-sidebar-command"
          label="Comando"
          accent={COLORS.terminal}
          onPress={onCommand}
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
})
