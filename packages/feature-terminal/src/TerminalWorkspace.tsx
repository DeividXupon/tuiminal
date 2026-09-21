import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { getLanguage, translateUi } from "@xupon/tuiminal-core/i18n/index"
import {
  COLORS,
  getUiSettings,
  matchesTerminalMasterKey,
  terminalMasterKeyBytes,
} from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import {
  FREE_TERMINAL_WORKING_DIRECTORY,
  createFreeTerminalCommand,
  createShellTerminalCommand,
} from "./services/terminal"
import { useTerminalSessions } from "./hooks/use-terminal-sessions"
import { useAgentDetection } from "./hooks/use-agent-detection"
import { useAutomaticTmuxMirrors } from "./hooks/use-automatic-tmux-mirrors"
import { useExternalTerminals } from "./hooks/use-external-terminals"
import { createTmuxMirrorCommand } from "./services/tmux-mirror-command"
import {
  DEFAULT_FOLDER,
  DEFAULT_FOLDER_NAME,
  EXTERNAL_FOLDER,
  EXTERNAL_FOLDER_NAME,
  MAX_SESSIONS,
  MAX_TERMINALS_PER_SECTION,
  cleanTerminalName,
  terminalSections,
  type TerminalFolder,
  type FreeTerminalCommand,
} from "./model/sessions"
import { FreeTerminalPane, type FreeTerminalPaneLayout } from "./ui/FreeTerminalPane"
import { TerminalSidebar } from "./ui/TerminalSidebar"
import { TERMINAL_ACTIONS, TerminalActions } from "./ui/TerminalActions"
import { TerminalDialog, type TerminalDialogKind } from "./ui/TerminalDialog"
import { TerminalTmuxDialog } from "./ui/TerminalTmuxDialog"
import { TUIMINAL_TMUX_FOLDER, tmuxPaneKey, type TmuxPaneInfo } from "./model/tmux"
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
import { usePinnedTmuxSidebars } from "./hooks/use-pinned-tmux-sidebars"
import { discoverTmuxWorkspace } from "./services/tmux-agents"
import { focusPinnedTmuxSidebar } from "./services/pinned-sidebar-tmux"
import {
  loadTerminalWorkspaceState,
  saveTerminalWorkspaceState,
  terminalWorkspaceAssignmentKey,
  type TerminalWorkspaceState,
} from "./services/terminal-workspace-state"

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

function nextTerminalFolderId(folders: readonly TerminalFolder[]) {
  let number = 1
  while (folders.some((folder) => folder.id === `folder-${number}`)) number += 1
  return `folder-${number}`
}

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
    moveSession,
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
  const [folders, setFolders] = useState<TerminalFolder[]>([
    ...RESERVED_TERMINAL_FOLDERS,
    ...initialWorkspaceState.folders,
  ])
  const foldersRef = useRef(folders)
  foldersRef.current = folders
  const [selectedFolder, setSelectedFolder] = useState(DEFAULT_FOLDER)
  const [leaderActive, setLeaderActive] = useState(false)
  const leaderRef = useRef(false)
  const [dialog, setDialog] = useState<TerminalDialogKind | "tmux" | null>(null)
  const dialogRef = useRef<TerminalDialogKind | "tmux" | null>(null)
  const [zoomed, setZoomed] = useState(false)
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
  const sections = terminalSections(sessions)
  const activeSession = sessions.find((session) => session.id === activeSessionId)
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
  seenAgents.current = new Set(
    active && !dialog && !leaderActive
      ? sessions
          .filter(
            (session) =>
              session.sectionId === activeSession?.sectionId &&
              (!zoomed || session.id === activeSessionId),
          )
          .map((session) => session.id)
      : [],
  )
  useAgentDetection(sessionsRef, agentOutputs, seenAgents, updateSession, processHandles)
  const folderForTmuxPane = useCallback((pane: TmuxPaneInfo) => {
    const defaultFolder = pane.ownedByTuiminal ? DEFAULT_FOLDER : TUIMINAL_TMUX_FOLDER
    const savedFolder = workspaceStateRef.current.assignments[terminalWorkspaceAssignmentKey(pane)]
    return savedFolder && foldersRef.current.some((folder) => folder.id === savedFolder)
      ? savedFolder
      : defaultFolder
  }, [])
  useAutomaticTmuxMirrors(sessionsRef, dismissedTmuxPanes, launchCommand, folderForTmuxPane)
  usePinnedTmuxSidebars(sidebarPinned, sidebarWidth, masterKey)

  useEffect(() => {
    const assignments = { ...workspaceStateRef.current.assignments }
    for (const session of sessions) {
      if (session.tmux) assignments[terminalWorkspaceAssignmentKey(session.tmux)] = session.folderId
    }
    const next: TerminalWorkspaceState = {
      folders: folders.filter(
        (folder) => !RESERVED_TERMINAL_FOLDERS.some((reserved) => reserved.id === folder.id),
      ),
      assignments,
    }
    const signature = JSON.stringify(next)
    if (signature === lastWorkspaceStateSignature.current) return
    try {
      workspaceStateRef.current = saveTerminalWorkspaceState(FREE_TERMINAL_WORKING_DIRECTORY, next)
      lastWorkspaceStateSignature.current = signature
    } catch {
      // Persistence failure must not interrupt live terminal sessions.
    }
  }, [folders, sessions])

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
  const setLeader = (open: boolean) => {
    leaderRef.current = open
    setLeaderActive(open)
  }
  const openDialog = (kind: TerminalDialogKind | "tmux") => {
    dialogRef.current = kind
    setDialog(kind)
  }
  const closeDialog = () => {
    dialogRef.current = null
    setDialog(null)
    restoreFocus()
  }
  const launchSection = (
    command: FreeTerminalCommand = createShellTerminalCommand(),
    folderId = DEFAULT_FOLDER,
  ) => {
    sequence.current += 1
    launchCommand(command, {
      sectionId: `section-${sequence.current}`,
      row: 0,
      column: 0,
      folderId,
    })
    setSelectedFolder(folderId)
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
  const mirrorSession = (target: TmuxPaneInfo) => {
    launchSection(createTmuxMirrorCommand(target), folderForTmuxPane(target))
    closeDialog()
  }
  const changeSection = (delta: number) => {
    const current = sections.findIndex((candidate) => candidate.id === activeSession?.sectionId)
    const next = sections[(Math.max(0, current) + delta + sections.length) % sections.length]
    if (next) activateSession(next.panes[0]!.id)
  }
  const disabled = (key: string) => {
    if (["v", "s"].includes(key)) return !canSplit
    if (["n", "c", "/", "t"].includes(key)) return sessions.length >= MAX_SESSIONS
    if (key === "r" && activeSession?.tmux) return true
    if (["r", "x", "m", "e", "o", "tab", "p", "1", "a", "f"].includes(key)) return !activeSession
    return key === "2" && section?.panes.length !== 2
  }
  const runAction = (key: string) => {
    if (disabled(key) || !TERMINAL_ACTIONS.some(([action]) => action === key)) return
    setLeader(false)
    if (key === "g") {
      terminalRefs.current.get(activeSessionRef.current ?? "")?.blur()
      renderer.currentFocusedRenderable?.blur()
      return
    }
    if (!["/", "d", "e", "l", "o", "t"].includes(key)) restoreFocus()
    switch (key) {
      case "n":
      case "c":
        launchSection()
        break
      case "/":
        openDialog("command")
        break
      case "t":
        openDialog("tmux")
        break
      case "v":
        split(false)
        break
      case "s":
        split(true)
        break
      case "tab":
        moveSession(1)
        break
      case "p":
        moveSession(-1)
        break
      case "a":
        changeSection(-1)
        break
      case "f":
        changeSection(1)
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
      case "d":
        openDialog("folder")
        break
      case "e":
        openDialog("rename")
        break
      case "o":
        openDialog("move")
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
  const saveDialog = (value: string) => {
    if (dialog === "command") {
      launchSection(createFreeTerminalCommand(value))
      closeDialog()
      return
    }
    if (dialog === "move") {
      if (!folders.some((folder) => folder.id === value)) return
      for (const pane of section?.panes ?? []) updateSession(pane.id, { folderId: value })
      setSelectedFolder(value)
      closeDialog()
      return
    }
    const name = cleanTerminalName(value)
    if (!name) return
    if (dialog === "rename" && activeSessionId) {
      updateSession(activeSessionId, { title: name, titleMode: "manual" })
      closeDialog()
      return
    }
    const existing = folders.find(
      (folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    const id = existing?.id ?? nextTerminalFolderId(folders)
    if (!existing) setFolders((current) => [...current, { id, name }])
    setSelectedFolder(id)
    closeDialog()
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

  useEffect(() => {
    publishTerminalSidebar(sidebarOwner.current, {
      sessions: sidebarSessions,
      folders,
      selectedFolder,
      activeSessionId,
      width: sidebarWidth,
      height: sidebarHeight,
      masterKey,
      onSelectFolder: (id) => {
        setSelectedFolder(id)
        workspaceRef.current?.focus()
      },
      onActivate: selectSession,
      onActions: () => {
        if (leaderRef.current) {
          setLeader(false)
          restoreFocus()
        } else setLeader(true)
      },
      onNew: () => runAction("n"),
      onFolder: () => runAction("d"),
    })
  })
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
    folders,
    selectSession,
    launchCommand,
    folderForTmuxPane,
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
            selectedFolder={selectedFolder}
            activeSessionId={activeSessionId}
            width={sidebarWidth}
            height={sidebarHeight}
            masterKey={masterKey}
            focusRequest={focusRequest}
            onSelectFolder={(id) => {
              setSelectedFolder(id)
              workspaceRef.current?.focus()
            }}
            onActivate={selectSession}
            onActions={() => {
              if (leaderRef.current) {
                setLeader(false)
                restoreFocus()
              } else setLeader(true)
            }}
            onNew={() => runAction("n")}
            onFolder={() => runAction("d")}
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
                visible={visible}
                appearanceKey={appearanceKey}
                layout={layout}
                onActivate={selectSession}
                onReady={terminalReady}
                onGone={terminalGone}
                onInput={terminalInput}
                onResize={terminalResize}
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
      {dialog === "tmux" && <TerminalTmuxDialog onSelect={mirrorSession} onClose={closeDialog} />}
      {dialog && dialog !== "tmux" && (
        <TerminalDialog
          kind={dialog}
          initialValue={dialog === "rename" ? (activeSession?.title ?? "") : ""}
          folders={
            dialog === "move"
              ? folders.filter(
                  (folder) => folder.id !== TUIMINAL_TMUX_FOLDER && folder.id !== EXTERNAL_FOLDER,
                )
              : folders
          }
          onSave={saveDialog}
          onClose={closeDialog}
        />
      )}
    </box>
  )
}
