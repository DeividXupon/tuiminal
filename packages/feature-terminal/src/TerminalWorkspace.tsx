import type { BoxRenderable } from "@opentui/core"
import { resolve } from "node:path"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { getLanguage, translateUi } from "@xupon/tuiminal-core/i18n/index"
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
} from "./model/sessions"
import { type TmuxPaneInfo, TUIMINAL_TMUX_FOLDER } from "./model/tmux"
import { focusPinnedTmuxSidebar } from "./services/pinned-sidebar-tmux"
import {
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
import { FreeTerminalPane, type FreeTerminalPaneLayout } from "./ui/FreeTerminalPane"
import { TERMINAL_ACTIONS, TerminalActions } from "./ui/TerminalActions"
import { TerminalDialog, type TerminalDialogKind } from "./ui/TerminalDialog"
import { TerminalSidebar } from "./ui/TerminalSidebar"

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
}: {
  active: boolean
  externalSidebarHost?: boolean
}) {
  const renderer = useRenderer()
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
  const [zoomed, setZoomed] = useState(false)
  const [liveDiffTarget, setLiveDiffTarget] = useState<{
    sessionId: string
    agentKey: string
    startedAt: number
    manualDirectories: readonly string[]
  } | null>(null)
  const dialogSessionRef = useRef<string | null>(null)
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
              .filter(
                (session) =>
                  session.sectionId === activeSession?.sectionId &&
                  (!zoomed || session.id === activeSessionId),
              )
              .map((session) => session.id)
          : [],
      ),
    [active, activeSession?.sectionId, activeSessionId, dialog, leaderActive, sessions, zoomed],
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
      if (session) setSelectedFolder(session.folderId)
      activateSession(id)
    },
    [activateSession, externalSessions, sessionsRef, setNotice],
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
    setZoomed(false)
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
    setZoomed(false)
  }
  const disabled = (key: string) => {
    if (["v", "s"].includes(key)) return !canSplit
    if (["n", "c", "/"].includes(key)) return sessions.length >= MAX_SESSIONS
    if (key === "r" && activeSession?.tmux) return true
    if (key === "d")
      return !(
        (activeSession?.status === "running" && activeSession.agent) ||
        liveDiffTarget?.sessionId === activeSessionId
      )
    if (["r", "x", "m", "e", "1"].includes(key)) return !activeSession
    return key === "2" && section?.panes.length !== 2
  }
  const toggleLiveDiff = () => {
    if (liveDiffTarget?.sessionId === activeSessionId) {
      setLiveDiffTarget(null)
      return
    }
    if (!activeSession?.agent) return
    setLiveDiffTarget({
      sessionId: activeSession.id,
      agentKey: activeSession.agent.key,
      startedAt: activeSession.startedAt,
      manualDirectories: [],
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
    if (!["/", "e", "l"].includes(key)) restoreFocus()
    switch (key) {
      case "n":
      case "c":
        launchSection()
        break
      case "/":
        openDialog("command")
        break
      case "v":
        split(false)
        break
      case "s":
        split(true)
        break
      case "1":
      case "2": {
        const pane = section?.panes[Number(key) - 1]
        if (pane) activateSession(pane.id)
        break
      }
      case "m":
        setZoomed((value) => !value)
        break
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
    }
  }
  runActionRef.current = runAction
  const openSidebarTerminal = useCallback(() => runActionRef.current("n"), [])
  const closeLiveDiff = useCallback(
    (id: string) => {
      setLiveDiffTarget((current) => (current?.sessionId === id ? null : current))
      focusTerminal(id)
    },
    [focusTerminal],
  )
  const addLiveDiffProject = useCallback((id: string) => {
    dialogSessionRef.current = id
    dialogRef.current = "live-diff-path"
    setDialog("live-diff-path")
  }, [])
  const saveDialog = (value: string) => {
    if (dialog === "command") {
      launchSection(createFreeTerminalCommand(value))
      closeDialog()
      return
    }
    if (dialog === "live-diff-path") {
      const id = dialogSessionRef.current
      const directory = resolve(FREE_TERMINAL_WORKING_DIRECTORY, value)
      setLiveDiffTarget((current) =>
        current?.sessionId === id && !current.manualDirectories.includes(directory)
          ? { ...current, manualDirectories: [...current.manualDirectories, directory] }
          : current,
      )
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
    } else if (dialogRef.current || leaderRef.current) return
    else if (activeSessionId) focusTerminal(activeSessionId)
    else workspaceRef.current?.focus()
  }, [active, activeSessionId, focusTerminal])

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
      onSelectFolder: selectFolderInSidebar,
      onToggleFolder: toggleFolder,
      onActivate: selectSession,
      onActions: toggleSidebarActions,
      onNew: openSidebarTerminal,
    }),
    [
      activeSessionId,
      collapsedFolderIds,
      masterKey,
      openSidebarTerminal,
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
    toggleFolder,
  ])

  useKeyboard((key) => {
    if (!active || dialogRef.current || key.defaultPrevented) return
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
    // Unknown keys stay in the menu; [Esc] always cancels without reaching the PTY.
    runAction(key.name)
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
            focusRequest={focusRequest}
            onSelectFolder={selectFolderInSidebar}
            onToggleFolder={toggleFolder}
            onActivate={selectSession}
            onActions={toggleSidebarActions}
            onNew={openSidebarTerminal}
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
              <InlineButton
                compact
                label="Novo terminal"
                accent={COLORS.terminal}
                onPress={() => launchSection()}
              />
            </box>
          )}
          {sessions.map((session) => {
            const visible =
              session.sectionId === activeSession?.sectionId &&
              (!zoomed || session.id === activeSessionId)
            const splitSection = section?.panes.length === 2 && !zoomed
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
    </box>
  )
}
