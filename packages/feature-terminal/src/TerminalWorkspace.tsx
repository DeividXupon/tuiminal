import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { getLanguage, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import {
  COLORS,
  getUiSettings,
  matchesTerminalMasterKey,
  terminalMasterKeyBytes,
} from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useAgentDetection } from "./hooks/use-agent-detection"
import { useAgentNotifications } from "./hooks/use-agent-notifications"
import { useAutomaticTmuxMirrors } from "./hooks/use-automatic-tmux-mirrors"
import { useExternalTerminals } from "./hooks/use-external-terminals"
import { usePinnedTmuxSidebars } from "./hooks/use-pinned-tmux-sidebars"
import { useTerminalPalette } from "./hooks/use-terminal-palette"
import { useTerminalSessions } from "./hooks/use-terminal-sessions"
import {
  clearTerminalSidebar,
  publishTerminalSidebar,
  requestTerminalSidebarFocus,
  subscribeTerminalSidebar,
  terminalSidebarFocusRevision,
  terminalSidebarPinnedSnapshot,
  terminalSidebarRequestRevision,
  terminalSidebarSnapshot,
  toggleTerminalSidebarPinned,
} from "./model/pinned-sidebar"
import {
  cleanTerminalName,
  DEFAULT_FOLDER,
  DEFAULT_FOLDER_NAME,
  EXTERNAL_FOLDER,
  EXTERNAL_FOLDER_NAME,
  type FreeTerminalCommand,
  MAX_SESSIONS,
  MAX_TERMINALS_PER_SECTION,
  type TerminalFolder,
  terminalSections,
  visibleTerminalShortcutTargets,
} from "./model/sessions"
import { type TmuxPaneInfo, TUIMINAL_TMUX_FOLDER } from "./model/tmux"
import { focusPinnedTmuxSidebar } from "./services/pinned-sidebar-tmux"
import {
  createCodexAgentCommand,
  createCodexTerminalCommand,
  createFreeTerminalCommand,
  createShellTerminalCommand,
  FREE_TERMINAL_WORKING_DIRECTORY,
} from "./services/terminal"
import {
  loadTerminalWorkspaceState,
  saveTerminalWorkspaceState,
  type TerminalWorkspaceState,
  terminalWorkspaceAssignmentKey,
} from "./services/terminal-workspace-state"
import { discoverTmuxWorkspace } from "./services/tmux-agents"
import { createTmuxMirrorCommand } from "./services/tmux-mirror-command"
import { discoverLiveDiffProjects, type LiveDiffProject } from "./services/live-diff-projects"
import { FreeTerminalPane, type FreeTerminalPaneLayout } from "./ui/FreeTerminalPane"
import { TERMINAL_ACTIONS, TerminalActions, terminalActionKey } from "./ui/TerminalActions"
import { TerminalDialog, type TerminalDialogKind } from "./ui/TerminalDialog"
import { LiveDiffProjectPicker } from "./ui/LiveDiffProjectPicker"
import { TerminalSidebar } from "./ui/TerminalSidebar"
import { tmuxAgentNotice } from "./rendering/tmux-agent-notice"

const FULL_PANE: FreeTerminalPaneLayout = {
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  borderTop: false,
  borderLeft: false,
}

const RESERVED_TERMINAL_FOLDERS: TerminalFolder[] = [
  { id: DEFAULT_FOLDER, name: DEFAULT_FOLDER_NAME },
  { id: TUIMINAL_TMUX_FOLDER, name: "tmux" },
  { id: EXTERNAL_FOLDER, name: EXTERNAL_FOLDER_NAME },
]

export function FreeTerminal({
  active,
  externalSidebarHost = false,
  onOpenSettings,
  onSelectTool,
  onQuit,
}: {
  active: boolean
  externalSidebarHost?: boolean
  onOpenSettings?: () => void
  onSelectTool?: (tool: "database" | "git" | "runner" | "http" | "terminal") => void
  onQuit?: () => void
}) {
  const { notify } = useNotifications()
  const renderer = useRenderer()
  const terminalPaletteSequence = useTerminalPalette()
  const dimensions = useTerminalDimensions()
  const workspaceRef = useRef<BoxRenderable | null>(null)
  const terminal = useTerminalSessions(active)
  const {
    sessions,
    sessionsRef,
    dismissedTmuxPanes,
    activeSessionId,
    activeSessionRef,
    terminalRefs,
    agentOutputs,
    processHandles,
    activateSession,
    focusTerminal,
    updateSession,
    launchCommand,
    closeSession,
    restartSession,
    terminalReady,
    terminalGone,
    terminalInput,
    terminalResize,
    setNotice,
  } = terminal
  const externalSessions = useExternalTerminals()
  const sidebarSessions = useMemo(
    () => [...sessions, ...externalSessions],
    [externalSessions, sessions],
  )
  const [initialWorkspaceState] = useState(() =>
    loadTerminalWorkspaceState(FREE_TERMINAL_WORKING_DIRECTORY),
  )
  const workspaceStateRef = useRef<TerminalWorkspaceState>(initialWorkspaceState)
  const lastWorkspaceStateSignature = useRef(JSON.stringify(initialWorkspaceState))
  const folders = RESERVED_TERMINAL_FOLDERS
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(
    initialWorkspaceState.collapsedFolderIds,
  )
  const [selectedFolder, setSelectedFolder] = useState(DEFAULT_FOLDER)
  const [leaderActive, setLeaderActive] = useState(false)
  const leaderRef = useRef(false)
  const [dialog, setDialog] = useState<TerminalDialogKind | null>(null)
  const dialogRef = useRef<TerminalDialogKind | null>(null)
  const [liveDiffTarget, setLiveDiffTarget] = useState<{
    sessionId: string
    agentKey: string
    startedAt: number
    manualDirectories: readonly string[]
    focusRequest: number
  } | null>(null)
  const [liveDiffProjectPicker, setLiveDiffProjectPicker] = useState<{
    sessionId: string
    projects: readonly LiveDiffProject[]
    loading: boolean
    error: string
  } | null>(null)
  const liveDiffProjectSearch = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const sidebarOwner = useRef({})
  const runActionRef = useRef<(key: string) => void>(() => undefined)
  const handledTargetRevision = useRef(0)
  const sidebarPinned = useSyncExternalStore(
    subscribeTerminalSidebar,
    terminalSidebarPinnedSnapshot,
    terminalSidebarPinnedSnapshot,
  )
  const requestedTargetRevision = useSyncExternalStore(
    subscribeTerminalSidebar,
    terminalSidebarRequestRevision,
    terminalSidebarRequestRevision,
  )
  const focusRequest = useSyncExternalStore(
    subscribeTerminalSidebar,
    terminalSidebarFocusRevision,
    terminalSidebarFocusRevision,
  )
  const masterKey = getUiSettings().terminalMasterKey
  const sections = useMemo(() => terminalSections(sessions), [sessions])
  const masterKeyTargets = useMemo(
    () => visibleTerminalShortcutTargets(sidebarSessions, folders, collapsedFolderIds),
    [collapsedFolderIds, sidebarSessions],
  )
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  useEffect(() => {
    if (!liveDiffTarget) return
    const owner = sessions.find((session) => session.id === liveDiffTarget.sessionId)
    if (
      !owner ||
      owner.startedAt !== liveDiffTarget.startedAt ||
      (owner.agent && owner.agent.key !== liveDiffTarget.agentKey)
    ) {
      setLiveDiffTarget(null)
    }
  }, [liveDiffTarget, sessions])
  const section = sections.find((section) => section.id === activeSession?.sectionId)
  const canSplit = Boolean(
    section && section.panes.length < MAX_TERMINALS_PER_SECTION && sessions.length < MAX_SESSIONS,
  )
  const sidebarWidth = Math.max(16, Math.min(32, Math.floor(dimensions.width * 0.22)))
  const sidebarHeight =
    dimensions.height - 1 - (leaderActive ? Math.max(3, Math.floor(dimensions.height / 2)) : 0)
  const appearanceKey = [getLanguage(), COLORS.canvas, COLORS.border, COLORS.terminal].join(
    "\u0000",
  )
  const seenAgents = useRef<ReadonlySet<string>>(new Set())
  seenAgents.current = useMemo(
    () =>
      new Set(
        active && !dialog && !leaderActive
          ? sessions
              .filter((session) => session.sectionId === activeSession?.sectionId)
              .map((session) => session.id)
          : [],
      ),
    [active, activeSession?.sectionId, dialog, leaderActive, sessions],
  )
  useAgentDetection(sessionsRef, agentOutputs, seenAgents, updateSession, processHandles)
  useAgentNotifications(sessions, seenAgents)
  const folderForTmuxPane = useCallback((pane: TmuxPaneInfo) => {
    const defaultFolder = pane.ownedByTuiminal ? DEFAULT_FOLDER : TUIMINAL_TMUX_FOLDER
    const savedFolder = workspaceStateRef.current.assignments[terminalWorkspaceAssignmentKey(pane)]
    return savedFolder && RESERVED_TERMINAL_FOLDERS.some((folder) => folder.id === savedFolder)
      ? savedFolder
      : defaultFolder
  }, [])
  useAutomaticTmuxMirrors(sessionsRef, dismissedTmuxPanes, launchCommand, folderForTmuxPane)
  usePinnedTmuxSidebars(sidebarPinned, sidebarWidth, masterKey)

  useEffect(() => {
    const assignments = Object.fromEntries(
      Object.entries(workspaceStateRef.current.assignments).filter(([, folderId]) =>
        folders.some((folder) => folder.id === folderId),
      ),
    )
    for (const session of sessions) {
      if (session.tmux) assignments[terminalWorkspaceAssignmentKey(session.tmux)] = session.folderId
    }
    const next: TerminalWorkspaceState = {
      folders: [],
      assignments,
      collapsedFolderIds,
    }
    const signature = JSON.stringify(next)
    if (signature === lastWorkspaceStateSignature.current) return
    try {
      workspaceStateRef.current = saveTerminalWorkspaceState(FREE_TERMINAL_WORKING_DIRECTORY, next)
      lastWorkspaceStateSignature.current = signature
    } catch {
      // Persistence failure must not interrupt live terminal sessions.
    }
  }, [collapsedFolderIds, sessions])

  const toggleFolder = useCallback((id: string) => {
    setCollapsedFolderIds((current) =>
      current.includes(id) ? current.filter((folderId) => folderId !== id) : [...current, id],
    )
  }, [])
  const selectFolderInSidebar = useCallback((id: string) => {
    setSelectedFolder(id)
    workspaceRef.current?.focus()
  }, [])

  const selectSession = useCallback(
    (id: string) => {
      leaderRef.current = false
      setLeaderActive(false)
      const external = externalSessions.find((session) => session.id === id)
      if (external) {
        setSelectedFolder(EXTERNAL_FOLDER)
        setNotice(
          `${translateUi("Terminal externo: use a janela original.")} · ${external.external?.terminalId ?? external.title}`,
        )
        return
      }
      const session = sessionsRef.current.find((session) => session.id === id)
      if (session) {
        setSelectedFolder(session.folderId)
        const notice = session.tmux ? tmuxAgentNotice(session.agent) : null
        if (notice) notify(notice)
      }
      activateSession(id)
    },
    [activateSession, externalSessions, notify, sessionsRef, setNotice],
  )
  const restoreFocus = useCallback(() => {
    if (activeSessionRef.current) focusTerminal(activeSessionRef.current)
    else queueMicrotask(() => workspaceRef.current?.focus())
  }, [activeSessionRef, focusTerminal])
  const toggleSidebarActions = useCallback(() => {
    if (leaderRef.current) {
      leaderRef.current = false
      setLeaderActive(false)
      restoreFocus()
      return
    }
    leaderRef.current = true
    setLeaderActive(true)
  }, [restoreFocus])
  const setLeader = (open: boolean) => {
    leaderRef.current = open
    setLeaderActive(open)
  }
  const openDialog = (kind: TerminalDialogKind) => {
    dialogRef.current = kind
    setDialog(kind)
  }
  const closeDialog = () => {
    dialogRef.current = null
    setDialog(null)
    restoreFocus()
  }
  const launchSection = (command: FreeTerminalCommand = createShellTerminalCommand()) => {
    sequence.current += 1
    launchCommand(command, {
      sectionId: `section-${sequence.current}`,
      row: 0,
      column: 0,
      folderId: DEFAULT_FOLDER,
    })
    setSelectedFolder(DEFAULT_FOLDER)
  }
  const split = (down: boolean) => {
    if (!activeSession || !canSplit) {
      setNotice("Esta seção já possui dois terminais.")
      return
    }
    launchCommand(createShellTerminalCommand(), {
      sectionId: activeSession.sectionId,
      folderId: activeSession.folderId,
      row: down ? 1 : 0,
      column: down ? 0 : 1,
    })
  }
  const disabled = (key: string) => {
    if (["v", "s"].includes(key)) return !canSplit
    if (["n", "c", "a"].includes(key)) return sessions.length >= MAX_SESSIONS
    if (key.startsWith("alt+")) return !onSelectTool
    if (key === ",") return !onOpenSettings
    if (key === "q") return !onQuit
    if (key === "r" && activeSession?.tmux) return true
    if (key === "d")
      return !(
        (activeSession?.status === "running" && activeSession.agent) ||
        liveDiffTarget?.sessionId === activeSessionId
      )
    return ["r", "x", "e"].includes(key) && !activeSession
  }
  const toggleLiveDiff = () => {
    if (liveDiffTarget?.sessionId === activeSessionId) {
      setLiveDiffTarget((current) =>
        current ? { ...current, focusRequest: current.focusRequest + 1 } : current,
      )
      return
    }
    if (!activeSession?.agent) return
    setLiveDiffTarget({
      sessionId: activeSession.id,
      agentKey: activeSession.agent.key,
      startedAt: activeSession.startedAt,
      manualDirectories: [],
      focusRequest: 1,
    })
  }
  const runAction = (key: string) => {
    if (disabled(key) || !TERMINAL_ACTIONS.some(([action]) => action === key)) return
    setLeader(false)
    if (key === "g") {
      terminalRefs.current.get(activeSessionRef.current ?? "")?.blur()
      renderer.currentFocusedRenderable?.blur()
      return
    }
    if (!["e", "l", ",", "q"].includes(key) && !key.startsWith("alt+")) restoreFocus()
    switch (key) {
      case "n":
      case "c":
        launchSection()
        break
      case "a":
        launchSection(createCodexTerminalCommand())
        break
      case "v":
        split(false)
        break
      case "s":
        split(true)
        break
      case "alt+1":
      case "alt+2":
      case "alt+3":
      case "alt+4":
      case "alt+5": {
        const tools = ["database", "git", "runner", "http", "terminal"] as const
        const tool = tools[Number(key.at(-1)) - 1]
        if (tool) onSelectTool?.(tool)
        break
      }
      case "b":
        toggleTerminalSidebarPinned()
        break
      case "l":
        requestTerminalSidebarFocus()
        void focusPinnedTmuxSidebar()
        break
      case "e":
        openDialog("rename")
        break
      case "d":
        toggleLiveDiff()
        break
      case "r":
        if (activeSessionId) restartSession(activeSessionId)
        break
      case "x":
        if (activeSessionId) closeSession(activeSessionId)
        break
      case ",":
        onOpenSettings?.()
        break
      case "q":
        onQuit?.()
        break
    }
  }
  runActionRef.current = runAction
  const openSidebarTerminal = useCallback(() => runActionRef.current("n"), [])
  const openSidebarCommand = useCallback(() => {
    dialogRef.current = "command"
    setDialog("command")
  }, [])
  const openCodexTerminal = useCallback(() => runActionRef.current("a"), [])
  const closeLiveDiff = useCallback(
    (id: string) => {
      setLiveDiffTarget((current) => (current?.sessionId === id ? null : current))
      focusTerminal(id)
    },
    [focusTerminal],
  )
  const addLiveDiffProject = useCallback(
    (id: string, roots: readonly string[]) => {
      const session = sessionsRef.current.find((candidate) => candidate.id === id)
      const seeds = [session?.workingDirectory ?? "", ...roots]
      liveDiffProjectSearch.current?.abort()
      const controller = new AbortController()
      liveDiffProjectSearch.current = controller
      setLiveDiffProjectPicker({
        sessionId: id,
        projects: [],
        loading: true,
        error: "",
      })
      void discoverLiveDiffProjects(seeds, controller.signal)
        .then((projects) => {
          if (controller.signal.aborted) return
          const existing = new Set(roots)
          setLiveDiffProjectPicker((current) =>
            current?.sessionId === id
              ? {
                  ...current,
                  projects: projects.filter((project) => !existing.has(project.path)),
                  loading: false,
                }
              : current,
          )
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setLiveDiffProjectPicker((current) =>
            current?.sessionId === id
              ? {
                  ...current,
                  loading: false,
                  error: translateUi("Não foi possível procurar projetos Git."),
                }
              : current,
          )
        })
    },
    [sessionsRef],
  )
  const closeLiveDiffProjectPicker = useCallback(() => {
    liveDiffProjectSearch.current?.abort()
    liveDiffProjectSearch.current = null
    const id = liveDiffProjectPicker?.sessionId
    setLiveDiffProjectPicker(null)
    if (id) queueMicrotask(() => focusTerminal(id))
  }, [focusTerminal, liveDiffProjectPicker?.sessionId])
  const selectLiveDiffProject = useCallback(
    (path: string) => {
      const id = liveDiffProjectPicker?.sessionId
      if (!id) return
      setLiveDiffTarget((current) =>
        current?.sessionId === id && !current.manualDirectories.includes(path)
          ? { ...current, manualDirectories: [...current.manualDirectories, path] }
          : current,
      )
      closeLiveDiffProjectPicker()
    },
    [closeLiveDiffProjectPicker, liveDiffProjectPicker?.sessionId],
  )
  const saveDialog = (value: string) => {
    if (dialog === "command") {
      launchSection(createFreeTerminalCommand(value))
      closeDialog()
      return
    }
    if (dialog === "codex") {
      launchSection(createCodexAgentCommand(value))
      closeDialog()
      return
    }
    const name = cleanTerminalName(value)
    if (!name) return
    if (dialog === "rename" && activeSessionId) {
      updateSession(activeSessionId, { title: name, titleMode: "manual" })
      closeDialog()
    }
  }

  useEffect(() => {
    if (!active) {
      leaderRef.current = false
      setLeaderActive(false)
      dialogRef.current = null
      setDialog(null)
      liveDiffProjectSearch.current?.abort()
      setLiveDiffProjectPicker(null)
    } else if (dialogRef.current || liveDiffProjectPicker || leaderRef.current) return
    else if (activeSessionId) focusTerminal(activeSessionId)
    else workspaceRef.current?.focus()
  }, [active, activeSessionId, focusTerminal, liveDiffProjectPicker])

  const sidebarView = useMemo(
    () => ({
      sessions: sidebarSessions,
      folders,
      collapsedFolderIds,
      selectedFolder,
      activeSessionId,
      width: sidebarWidth,
      height: sidebarHeight,
      masterKey,
      masterKeyActive: leaderActive,
      onSelectFolder: selectFolderInSidebar,
      onToggleFolder: toggleFolder,
      onActivate: selectSession,
      onActions: toggleSidebarActions,
      onNew: openSidebarTerminal,
      onCommand: openSidebarCommand,
    }),
    [
      activeSessionId,
      collapsedFolderIds,
      leaderActive,
      masterKey,
      openSidebarTerminal,
      openSidebarCommand,
      selectFolderInSidebar,
      selectSession,
      selectedFolder,
      sidebarHeight,
      sidebarSessions,
      sidebarWidth,
      toggleFolder,
      toggleSidebarActions,
    ],
  )
  useEffect(() => {
    publishTerminalSidebar(sidebarOwner.current, sidebarView)
  }, [sidebarView])
  useEffect(() => () => clearTerminalSidebar(sidebarOwner.current), [])

  useEffect(() => {
    const target = terminalSidebarSnapshot().requestedTarget
    if (!target || handledTargetRevision.current === requestedTargetRevision) return
    if ("action" in target) {
      handledTargetRevision.current = requestedTargetRevision
      runActionRef.current(target.action)
      return
    }
    if ("folderId" in target) {
      if (folders.some((candidate) => candidate.id === target.folderId)) {
        handledTargetRevision.current = requestedTargetRevision
        setSelectedFolder(target.folderId)
        toggleFolder(target.folderId)
      }
      return
    }
    if ("sessionId" in target) {
      if (sidebarSessions.some((candidate) => candidate.id === target.sessionId)) {
        handledTargetRevision.current = requestedTargetRevision
        selectSession(target.sessionId)
      }
      return
    }
    const session = sessions.find(
      (candidate) =>
        candidate.tmux?.socket === target.socket && candidate.tmux.paneId === target.paneId,
    )
    if (session) {
      handledTargetRevision.current = requestedTargetRevision
      selectSession(session.id)
      return
    }
    const controller = new AbortController()
    const open = async () => {
      const result = await discoverTmuxWorkspace(controller.signal)
      const found = result.panes.find(
        ({ pane }) => pane.socket === target.socket && pane.paneId === target.paneId,
      )
      if (!found || controller.signal.aborted) return
      handledTargetRevision.current = requestedTargetRevision
      const notice = tmuxAgentNotice(found.agent)
      if (notice) notify(notice)
      sequence.current += 1
      launchCommand(createTmuxMirrorCommand(found.pane, found.agent?.label, false), {
        sectionId: `pinned-tmux-${sequence.current}`,
        folderId: folderForTmuxPane(found.pane),
        row: 0,
        column: 0,
      })
    }
    void open().catch(() => undefined)
    return () => controller.abort()
  }, [
    requestedTargetRevision,
    sessions,
    sidebarSessions,
    selectSession,
    launchCommand,
    folderForTmuxPane,
    notify,
    toggleFolder,
  ])

  useKeyboard((key) => {
    if (!active || dialogRef.current || liveDiffProjectPicker || key.defaultPrevented) return
    const configuredKey = getUiSettings().terminalMasterKey
    if (matchesTerminalMasterKey(key, configuredKey)) {
      key.preventDefault()
      key.stopPropagation()
      if (leaderRef.current) {
        processHandles.current
          .get(activeSessionRef.current ?? "")
          ?.write(terminalMasterKeyBytes(configuredKey))
        setLeader(false)
        restoreFocus()
      } else setLeader(true)
      return
    }
    if (!leaderRef.current) return
    key.preventDefault()
    key.stopPropagation()
    const action = terminalActionKey(key)
    if (action?.startsWith("alt+")) {
      runAction(action)
      return
    }
    if (
      /^[1-9]$/.test(key.name) &&
      !key.ctrl &&
      !key.meta &&
      !key.option &&
      !key.shift &&
      !key.super
    ) {
      const target = masterKeyTargets[Number(key.name) - 1]
      if (target) selectSession(target.id)
      return
    }
    // Unknown keys stay in the menu; [Esc] always cancels without reaching the PTY.
    if (action) runAction(action)
  })

  return (
    <box
      id="terminal-workspace"
      ref={workspaceRef}
      focusable
      style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}
    >
      <box style={{ flexGrow: 1, flexDirection: "row", minHeight: 1 }}>
        {!(externalSidebarHost && sidebarPinned) && (
          <TerminalSidebar
            active={active}
            sessions={sidebarSessions}
            folders={folders}
            collapsedFolderIds={collapsedFolderIds}
            selectedFolder={selectedFolder}
            activeSessionId={activeSessionId}
            width={sidebarWidth}
            height={sidebarHeight}
            masterKey={masterKey}
            masterKeyActive={leaderActive}
            focusRequest={focusRequest}
            onSelectFolder={selectFolderInSidebar}
            onToggleFolder={toggleFolder}
            onActivate={selectSession}
            onActions={toggleSidebarActions}
            onNew={openSidebarTerminal}
            onCommand={sessions.length < MAX_SESSIONS ? openSidebarCommand : undefined}
          />
        )}
        <box
          id="terminal-panes"
          style={{
            flexGrow: 1,
            position: "relative",
            overflow: "hidden",
            minWidth: 1,
          }}
        >
          {!sessions.length && (
            <box style={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
              <box style={{ flexDirection: "row" }}>
                <InlineButton
                  compact
                  label="Novo terminal"
                  accent={COLORS.terminal}
                  onPress={() => launchSection()}
                />
                <InlineButton
                  compact
                  label="Novo Codex"
                  accent={COLORS.terminal}
                  onPress={openCodexTerminal}
                />
              </box>
            </box>
          )}
          {sessions.map((session) => {
            const visible = session.sectionId === activeSession?.sectionId
            const splitSection = section?.panes.length === 2
            const down = section?.panes.some((pane) => pane.row === 1)
            const layout: FreeTerminalPaneLayout =
              !splitSection || !visible
                ? FULL_PANE
                : {
                    top: down && session.row === 1 ? "50%" : 0,
                    left: !down && session.column === 1 ? "50%" : 0,
                    width: down ? "100%" : "50%",
                    height: down ? "50%" : "100%",
                    borderTop: Boolean(down && session.row === 1),
                    borderLeft: Boolean(!down && session.column === 1),
                  }
            return (
              <FreeTerminalPane
                key={session.id}
                session={session}
                active={session.id === activeSessionId}
                toolActive={active}
                visible={visible}
                appearanceKey={appearanceKey}
                paletteSequence={terminalPaletteSequence}
                layout={layout}
                onActivate={selectSession}
                onReady={terminalReady}
                onGone={terminalGone}
                onInput={terminalInput}
                onResize={terminalResize}
                liveDiff={
                  liveDiffTarget?.sessionId === session.id &&
                  liveDiffTarget.startedAt === session.startedAt &&
                  (!session.agent || liveDiffTarget.agentKey === session.agent.key)
                    ? {
                        agentKey: liveDiffTarget.agentKey,
                        manualDirectories: liveDiffTarget.manualDirectories,
                        stacked: splitSection || dimensions.width - sidebarWidth < 90,
                        running: session.status === "running" && Boolean(session.agent),
                        focusRequest: liveDiffTarget.focusRequest,
                      }
                    : undefined
                }
                onCloseLiveDiff={closeLiveDiff}
                onAddLiveDiffProject={addLiveDiffProject}
              />
            )
          })}
        </box>
      </box>
      {leaderActive && (
        <TerminalActions
          width={dimensions.width}
          height={Math.max(3, Math.floor(dimensions.height / 2))}
          onAction={runAction}
          disabled={disabled}
        />
      )}
      {dialog && (
        <TerminalDialog
          kind={dialog}
          initialValue={dialog === "rename" ? (activeSession?.title ?? "") : ""}
          onSave={saveDialog}
          onClose={closeDialog}
        />
      )}
      {liveDiffProjectPicker && (
        <LiveDiffProjectPicker
          projects={liveDiffProjectPicker.projects}
          loading={liveDiffProjectPicker.loading}
          error={liveDiffProjectPicker.error}
          onSelect={selectLiveDiffProject}
          onClose={closeLiveDiffProjectPicker}
        />
      )}
    </box>
  )
}
