import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { focusedRenderableId } from "@xupon/tuiminal-core/keyboard/scope"
import { COLORS, type TerminalMasterKey } from "@xupon/tuiminal-core/settings/theme"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import { useRenderableFocus } from "../hooks/use-renderable-focus"
import { useTerminalSidebarScroll } from "../hooks/use-terminal-sidebar-scroll"
import {
  TERMINAL_SIDEBAR_FOCUS_TARGET,
  type TerminalFocusTargetKey,
} from "../model/focus-selection"
import {
  isRunningAgent,
  masterKeyShortcutLabel,
  numberedTerminalSections,
  orderedRunningAgents,
  sidebarTerminalSessions,
  type TerminalFolder,
  type TerminalSession,
  visibleTerminalShortcutTargets,
} from "../model/sessions"
import { AGENT_WORKING_FRAMES } from "../rendering/agent-presentation"
import { agentTaskTitleWidth } from "../rendering/agent-title-marquee"
import { terminalShortcutColor } from "../rendering/terminal-shortcut"
import { TerminalAgentList } from "./TerminalAgentList"
import { TerminalFocusSelection } from "./TerminalFocusSelection"
import { TerminalSessionGroups } from "./TerminalSessionGroups"
import {
  TerminalInlineButton,
  TerminalShortcutAnimation,
  TerminalShortcutText,
} from "./TerminalShortcut"
import {
  TerminalSidebarFocusSweep,
  useTerminalSidebarFocusSweep,
} from "./TerminalSidebarFocusSweep"
import { handleSidebarKey } from "./terminal-sidebar-keyboard"

export { terminalSidebarFocusSweep } from "./TerminalSidebarFocusSweep"

const FOLDER_CURSOR_PREFIX = "terminal-folder:"
const NO_COLLAPSED_FOLDERS: readonly string[] = []

const folderCursorId = (id: string) => `${FOLDER_CURSOR_PREFIX}${id}`

function cursorFolderId(id: string | null) {
  return id?.startsWith(FOLDER_CURSOR_PREFIX) ? id.slice(FOLDER_CURSOR_PREFIX.length) : null
}

type SidebarFocusSelection =
  | {
      selectedTarget: TerminalFocusTargetKey
      onFocus: (target: TerminalFocusTargetKey) => void
    }
  | undefined

function TerminalSidebarFocusSelection({
  focusSelection,
}: {
  focusSelection: SidebarFocusSelection
}) {
  if (!focusSelection) return null
  return (
    <TerminalFocusSelection
      target={TERMINAL_SIDEBAR_FOCUS_TARGET}
      selected={focusSelection.selectedTarget === TERMINAL_SIDEBAR_FOCUS_TARGET}
      onFocus={focusSelection.onFocus}
    />
  )
}

export const TerminalSidebar = memo(function TerminalSidebar({
  active = true,
  sessions: allSessions,
  folders,
  selectedFolder,
  activeSessionId,
  width,
  height,
  masterKey,
  onSelectFolder,
  collapsedFolderIds = NO_COLLAPSED_FOLDERS,
  onToggleFolder = () => undefined,
  onActivate,
  onActions,
  onNew,
  onNewAgent,
  navigationOnly = false,
  autoFocus = false,
  focusRequest = 0,
  onMasterKey,
  onEscape,
  borderRight = true,
  masterKeyActive = false,
  focusSelection,
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
  onNewAgent?: (() => void) | undefined
  navigationOnly?: boolean
  autoFocus?: boolean
  focusRequest?: number
  onMasterKey?: () => void
  onEscape?: () => void
  borderRight?: boolean
  /** Shows the direct Master Key target beside each visible agent or terminal. */
  masterKeyActive?: boolean
  focusSelection?: SidebarFocusSelection
}) {
  const renderer = useRenderer()
  const sessions = useMemo(() => sidebarTerminalSessions(allSessions), [allSessions])
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
  const agentCount = sessions.filter(isRunningAgent).length
  const compactAgents = height < 10
  const showSessionHeading = !agentCount || height >= 6
  const showCreationActions = !navigationOnly && (!agentCount || height >= 8)
  const fixedHeight =
    Number(showSessionHeading) +
    Number(showCreationActions) * (onNewAgent ? 2 : 1) +
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
      (session.agent?.state === "working" ||
        (session.agentIntegration && session.agentIntegration.transport !== "screen") ||
        (session.agent?.taskTitle &&
          displayWidth(session.agent.taskTitle) >
            agentTaskTitleWidth(
              session.agent,
              compactAgents,
              width - Number(borderRight),
              displayWidth(shortcuts.get(session.id) ?? ""),
            ))),
  )
  useEffect(() => {
    if (!active || !animatingAgents || process.env.TUIMINAL_TEST_STATIC_LOADERS === "1") return
    const timer = setInterval(() => {
      setFrame((current) => current + 1)
    }, 100)
    return () => clearInterval(timer)
  }, [active, animatingAgents])
  const sidebarRef = useRef<BoxRenderable | null>(null)
  const sidebarFocused = useRenderableFocus(sidebarRef)
  const { frame: focusSweepFrame, start: startFocusSweep } = useTerminalSidebarFocusSweep()
  const [cursorId, setCursorId] = useState<string | null>(
    activeSessionId && navigationIds.includes(activeSessionId)
      ? activeSessionId
      : (navigationIds[0] ?? null),
  )
  const cursorRef = useRef(cursorId)
  const previousFocusRequest = useRef(focusRequest)
  const previousActiveSession = useRef(activeSessionId)
  const selectFolder = (id: string) => {
    const cursor = folderCursorId(id)
    cursorRef.current = cursor
    setCursorId(cursor)
    onSelectFolder(id)
    queueMicrotask(() => sidebarRef.current?.focus())
  }
  useEffect(() => {
    const activeChanged = previousActiveSession.current !== activeSessionId
    previousActiveSession.current = activeSessionId
    setCursorId((current) => {
      const next =
        !activeChanged && current && navigationIds.includes(current)
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
  const scrollRef = useTerminalSidebarScroll({
    sessions,
    cursorId,
    folderId: cursorFolderId(cursorId),
    activeSessionId,
    selectedFolder,
    height,
    collapsedFolderIds,
  })
  return (
    <TerminalShortcutAnimation active={active}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes own native terminal focus and do not expose ARIA roles. */}
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
            frame={frame % AGENT_WORKING_FRAMES.length}
            titleFrame={frame}
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
          id="terminal-sidebar-scroll"
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
          <TerminalInlineButton
            compact
            id="terminal-sidebar-new"
            label="Novo terminal"
            accent={COLORS.terminal}
            onPress={onNew}
          />
        )}
        {showCreationActions && onNewAgent && (
          <TerminalInlineButton
            compact
            id="terminal-sidebar-new-agent"
            label="Novo agente"
            accent={COLORS.terminal}
            onPress={onNewAgent}
          />
        )}
        {navigationOnly && (
          <TerminalShortcutText
            content="[↑/↓] [Enter]"
            shortcutColor={terminalShortcutColor(active, sidebarFocused)}
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
        )}
        <TerminalInlineButton
          compact
          id="terminal-sidebar-actions"
          label={`[${masterKey}]`}
          actionKeys={[`[${masterKey}]`]}
          accent={COLORS.terminal}
          onPress={onActions}
        />
        <TerminalSidebarFocusSelection focusSelection={focusSelection} />
      </box>
    </TerminalShortcutAnimation>
  )
})
