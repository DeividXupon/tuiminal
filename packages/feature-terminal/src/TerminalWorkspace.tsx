import type { BoxRenderable, KeyEvent } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { getLanguage, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import {
  COLORS,
  getUiSettings,
  matchesTerminalMasterKey,
  terminalMasterKeyBytes,
} from "@xupon/tuiminal-core/settings/theme"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useAgentDetection } from "./hooks/use-agent-detection"
import { useAgentNotifications } from "./hooks/use-agent-notifications"
import { useAutomaticTmuxMirrors } from "./hooks/use-automatic-tmux-mirrors"
import { useExternalTerminals } from "./hooks/use-external-terminals"
import { usePinnedTmuxSidebars } from "./hooks/use-pinned-tmux-sidebars"
import { useTerminalFocusSelection } from "./hooks/use-terminal-focus-selection"
import { useTerminalPalette } from "./hooks/use-terminal-palette"
import { useTerminalSessions } from "./hooks/use-terminal-sessions"
import type { AgentMessageHistoryEntry } from "./model/agent-message-history"
import {
  codexResumeThreadsSnapshot,
  subscribeCodexResumeThreads,
} from "./model/codex-resume-threads"
import {
  parseTerminalFocusTargetKey,
  TERMINAL_SIDEBAR_FOCUS_TARGET,
  type TerminalFocusTargetKey,
  terminalFocusTargetKey,
} from "./model/focus-selection"
import {
  clearTerminalSidebar,
  publishTerminalSidebar,
  requestTerminalSidebarFocus,
  subscribeTerminalSidebar,
  terminalSidebarFocusRevision,
  terminalSidebarPinnedSnapshot,
  terminalSidebarRequestRevision,
  terminalSidebarSnapshot,
  terminalSidebarTmuxHostSnapshot,
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
  orderedRunningAgents,
  type TerminalFolder,
  type TerminalSession,
  terminalSections,
  visibleTerminalShortcutTargets,
} from "./model/sessions"
import { type TmuxPaneInfo, TUIMINAL_TMUX_FOLDER } from "./model/tmux"
import { tmuxAgentNotice } from "./rendering/tmux-agent-notice"
import { refreshCodexResumeThreads } from "./services/codex-app-server"
import { discoverLiveDiffProjects, type LiveDiffProject } from "./services/live-diff-projects"
import { focusPinnedTmuxSidebar } from "./services/pinned-sidebar-tmux"
import {
  createCodexAgentCommand,
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
import { LiveDiffProjectPicker } from "./ui/LiveDiffProjectPicker"
import { TERMINAL_ACTIONS, TerminalActions, terminalActionKey } from "./ui/TerminalActions"
import { TerminalDialog, type TerminalDialogKind } from "./ui/TerminalDialog"
import { liveDiffCoversSplitPane, TerminalPanes } from "./ui/TerminalPanes"
import { TerminalShortcutAnimation } from "./ui/TerminalShortcut"
import { TerminalSidebar } from "./ui/TerminalSidebar"
import { TerminalSplitDialog } from "./ui/TerminalSplitDialog"

const RESERVED_TERMINAL_FOLDERS: TerminalFolder[] = [
  { id: DEFAULT_FOLDER, name: DEFAULT_FOLDER_NAME },
  { id: TUIMINAL_TMUX_FOLDER, name: "tmux" },
  { id: EXTERNAL_FOLDER, name: EXTERNAL_FOLDER_NAME },
]

type MessageHistoryTarget = {
  sessionId: string
  startedAt: number
  focusRequest: number
}

type LiveDiffTarget = {
  sessionId: string
  agentKey: string
  startedAt: number
  manualDirectories: readonly string[]
  focusRequest: number
}

type SplitRequest = {
  sourceSessionId: string
  sectionId: string
  folderId: string
  down: boolean
}

function messageHistoryForSession(
  session: TerminalSession,
  target: MessageHistoryTarget | undefined,
  messages: ReadonlyMap<string, readonly AgentMessageHistoryEntry[]>,
) {
  if (!target || target.sessionId !== session.id || target.startedAt !== session.startedAt)
    return undefined
  return { messages: messages.get(session.id) ?? [], focusRequest: target.focusRequest }
}

function liveDiffCoversActiveSplit(
  sessions: readonly TerminalSession[],
  availableWidth: number,
  availableHeight: number,
  sidebarWidth: number,
) {
  if (sessions.length !== MAX_TERMINALS_PER_SECTION) return false
  return liveDiffCoversSplitPane({
    availableWidth,
    availableHeight,
    sidebarWidth,
    splitDown: sessions.some((session) => session.row === 1),
  })
}

export function FreeTerminal({
  active,
  externalSidebarHost = false,
  onOpenSettings,
  onSelectTool,
  onQuit,
  onMasterKeyActiveChange,
}: {
  active: boolean
  externalSidebarHost?: boolean
  onOpenSettings?: () => void
  onSelectTool?: (tool: "database" | "git" | "runner" | "http" | "terminal") => void
  onQuit?: () => void
  onMasterKeyActiveChange?: (active: boolean) => void
}) {
  const { notify } = useNotifications()
  const renderer = useRenderer()
  const terminalPaletteSequence = useTerminalPalette()
  const dimensions = useTerminalDimensions()
  const sidebarWidth = Math.max(16, Math.min(32, Math.floor(dimensions.width * 0.22)))
  const workspaceRef = useRef<BoxRenderable | null>(null)
  const terminal = useTerminalSessions(active)
  const {
    sessions,
    agentMessages,
    sessionsRef,
    dismissedTmuxPanes,
    activeSessionId,
    activeSessionRef,
    agentOutputs,
    processHandles,
    activateSession,
    focusTerminal,
    updateSession,
    moveSession,
    launchCommand,
    closeSession,
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
  const [splitRequest, setSplitRequest] = useState<SplitRequest | null>(null)
  const splitRequestRef = useRef<SplitRequest | null>(null)
  const [liveDiffTargets, setLiveDiffTargets] = useState<ReadonlyMap<string, LiveDiffTarget>>(
    () => new Map(),
  )
  const [messageHistoryTargets, setMessageHistoryTargets] = useState<
    ReadonlyMap<string, MessageHistoryTarget>
  >(() => new Map())
  const [liveDiffProjectPicker, setLiveDiffProjectPicker] = useState<{
    sessionId: string
    projects: readonly LiveDiffProject[]
    loading: boolean
    error: string
  } | null>(null)
  const liveDiffProjectSearch = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const sidebarOwner = useRef({})
  const activateFocusTargetRef = useRef<(target: TerminalFocusTargetKey) => void>(() => undefined)
  const runActionRef = useRef<(key: string) => void>(() => undefined)
  const resumeCodexThreadRef = useRef<(threadId: string) => void>(() => undefined)
  const handledTargetRevision = useRef(0)
  const sidebarPinned = useSyncExternalStore(
    subscribeTerminalSidebar,
    terminalSidebarPinnedSnapshot,
    terminalSidebarPinnedSnapshot,
  )
  const tmuxHostSidebar = useSyncExternalStore(
    subscribeTerminalSidebar,
    terminalSidebarTmuxHostSnapshot,
    terminalSidebarTmuxHostSnapshot,
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
  const splitAgents = useMemo(
    () =>
      orderedRunningAgents(sessions).filter(
        (session) =>
          session.id !== activeSession?.id && session.sectionId !== activeSession?.sectionId,
      ),
    [activeSession?.id, activeSession?.sectionId, sessions],
  )
  const focusTargets = useMemo(() => {
    const targets: TerminalFocusTargetKey[] = [TERMINAL_SIDEBAR_FOCUS_TARGET]
    if (!activeSession) return targets
    const activeSectionSessions = sessions.filter(
      (session) => session.sectionId === activeSession.sectionId,
    )
    const liveDiffCoversTerminal = liveDiffCoversActiveSplit(
      activeSectionSessions,
      dimensions.width,
      dimensions.height,
      sidebarWidth,
    )
    for (const session of sessions) {
      if (session.sectionId !== activeSession.sectionId) continue
      const liveDiffTarget = liveDiffTargets.get(session.id)
      const liveDiffVisible =
        liveDiffTarget?.startedAt === session.startedAt &&
        (!session.agent || liveDiffTarget.agentKey === session.agent.key)
      const liveDiffCoversSession = liveDiffCoversTerminal && liveDiffVisible
      if (!liveDiffCoversSession) targets.push(terminalFocusTargetKey("terminal", session.id))
      if (
        !liveDiffCoversSession &&
        messageHistoryForSession(session, messageHistoryTargets.get(session.id), agentMessages)
      )
        targets.push(terminalFocusTargetKey("history", session.id))
      if (liveDiffVisible) targets.push(terminalFocusTargetKey("live-diff", session.id))
    }
    return targets
  }, [
    activeSession,
    agentMessages,
    dimensions.height,
    dimensions.width,
    liveDiffTargets,
    messageHistoryTargets,
    sessions,
    sidebarWidth,
  ])
  const virtualFocusTargets = useMemo(
    () =>
      tmuxHostSidebar
        ? [
            {
              key: TERMINAL_SIDEBAR_FOCUS_TARGET,
              left: -sidebarWidth,
              top: 0,
              width: sidebarWidth,
              height: Math.max(1, dimensions.height),
            },
          ]
        : [],
    [dimensions.height, sidebarWidth, tmuxHostSidebar],
  )
  const {
    busyRef: boxFocusBusyRef,
    focus: focusBox,
    open: openBoxFocus,
    rememberOrigin: rememberBoxFocusOrigin,
    selectedTarget: selectedBoxFocusTarget,
  } = useTerminalFocusSelection({
    active,
    activeSessionId,
    targets: focusTargets,
    workspaceRef,
    focusTerminal,
    onActivateRef: activateFocusTargetRef,
    virtualTargets: virtualFocusTargets,
  })
  useEffect(() => {
    onMasterKeyActiveChange?.(leaderActive)
    return () => {
      if (leaderActive) onMasterKeyActiveChange?.(false)
    }
  }, [leaderActive, onMasterKeyActiveChange])
  useEffect(() => {
    setLiveDiffTargets((current) => {
      let changed = false
      const next = new Map(current)
      for (const [sessionId, target] of current) {
        const owner = sessions.find((session) => session.id === sessionId)
        if (
          owner &&
          owner.startedAt === target.startedAt &&
          (!owner.agent || owner.agent.key === target.agentKey)
        )
          continue
        next.delete(sessionId)
        changed = true
      }
      return changed ? next : current
    })
  }, [sessions])
  useEffect(() => {
    setMessageHistoryTargets((current) => {
      let changed = false
      const next = new Map(current)
      for (const [sessionId, target] of current) {
        const owner = sessions.find((session) => session.id === sessionId)
        if (owner?.startedAt === target.startedAt && owner.agentIntegration === "codex-app-server")
          continue
        next.delete(sessionId)
        changed = true
      }
      return changed ? next : current
    })
  }, [sessions])
  const section = sections.find((section) => section.id === activeSession?.sectionId)
  const hasSplitRoom = Boolean(section && section.panes.length < MAX_TERMINALS_PER_SECTION)
  const canCreateSplitTerminal = sessions.length < MAX_SESSIONS
  const canSplit = hasSplitRoom && (canCreateSplitTerminal || splitAgents.length > 0)
  const sidebarHeight = dimensions.height - 1
  const recentThreads = useSyncExternalStore(
    subscribeCodexResumeThreads,
    codexResumeThreadsSnapshot,
    codexResumeThreadsSnapshot,
  )
  useEffect(() => {
    if (!active || process.env.TUIMINAL_TERMINAL_CODEX_RESUME === "0") return
    const controller = new AbortController()
    void refreshCodexResumeThreads(FREE_TERMINAL_WORKING_DIRECTORY, controller.signal).catch(
      () => undefined,
    )
    return () => controller.abort()
  }, [active])
  const appearanceKey = [getLanguage(), COLORS.canvas, COLORS.border, COLORS.terminal].join(
    "\u0000",
  )
  const seenAgents = useRef<ReadonlySet<string>>(new Set())
  seenAgents.current = useMemo(
    () =>
      new Set(
        active && !dialog && !splitRequest && !leaderActive && !selectedBoxFocusTarget
          ? sessions
              .filter((session) => session.sectionId === activeSession?.sectionId)
              .map((session) => session.id)
          : [],
      ),
    [
      active,
      activeSession?.sectionId,
      dialog,
      leaderActive,
      selectedBoxFocusTarget,
      sessions,
      splitRequest,
    ],
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
    rememberBoxFocusOrigin()
    leaderRef.current = true
    setLeaderActive(true)
  }, [rememberBoxFocusOrigin, restoreFocus])
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
  const closeSplitDialog = (restore = true) => {
    splitRequestRef.current = null
    setSplitRequest(null)
    if (restore) restoreFocus()
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
  const resumeCodexThread = (threadId: string) => {
    if (sessions.length >= MAX_SESSIONS) {
      setNotice("O limite de terminais foi atingido.")
      return
    }
    setLeader(false)
    launchSection(createCodexAgentCommand(threadId))
  }
  resumeCodexThreadRef.current = resumeCodexThread
  const requestSplit = (down: boolean) => {
    if (!activeSession || !canSplit) {
      setNotice("Esta seção já possui dois terminais.")
      return
    }
    const request = {
      sourceSessionId: activeSession.id,
      sectionId: activeSession.sectionId,
      folderId: activeSession.folderId,
      down,
    }
    splitRequestRef.current = request
    setSplitRequest(request)
  }
  const splitPlacement = (request: SplitRequest) => ({
    sectionId: request.sectionId,
    folderId: request.folderId,
    row: (request.down ? 1 : 0) as 0 | 1,
    column: (request.down ? 0 : 1) as 0 | 1,
  })
  const currentSplitRequest = () => {
    const request = splitRequestRef.current
    const current = sessionsRef.current
    const source = current.find((session) => session.id === request?.sourceSessionId)
    if (
      !request ||
      source?.sectionId !== request.sectionId ||
      current.filter((session) => session.sectionId === request.sectionId).length >=
        MAX_TERMINALS_PER_SECTION
    ) {
      closeSplitDialog()
      return null
    }
    return request
  }
  const createSplitTerminal = () => {
    const request = currentSplitRequest()
    if (!request || sessionsRef.current.length >= MAX_SESSIONS) return
    closeSplitDialog(false)
    launchCommand(createShellTerminalCommand(), splitPlacement(request))
  }
  const placeSplitAgent = (id: string) => {
    const request = currentSplitRequest()
    if (
      !request ||
      !orderedRunningAgents(sessionsRef.current).some(
        (session) =>
          session.id === id &&
          session.id !== request.sourceSessionId &&
          session.sectionId !== request.sectionId,
      )
    )
      return
    closeSplitDialog(false)
    moveSession(id, splitPlacement(request))
  }
  const disabled = (key: string) => {
    if (["v", "h"].includes(key)) return !canSplit
    if (key === "s") return activeSession?.agentIntegration !== "codex-app-server"
    if (["n", "a"].includes(key)) return sessions.length >= MAX_SESSIONS
    if (key.startsWith("alt+")) return !onSelectTool
    if (key === ",") return !onOpenSettings
    if (key === "q") return !onQuit
    if (key === "d")
      return !(
        (activeSession?.status === "running" && activeSession.agent) ||
        (activeSessionId && liveDiffTargets.has(activeSessionId))
      )
    return ["x", "e", "m"].includes(key) && !activeSession
  }
  const toggleLiveDiff = () => {
    if (!activeSessionId) return
    if (liveDiffTargets.has(activeSessionId)) {
      setLiveDiffTargets((current) => {
        const target = current.get(activeSessionId)
        if (!target) return current
        const next = new Map(current)
        next.set(activeSessionId, { ...target, focusRequest: target.focusRequest + 1 })
        return next
      })
      return
    }
    const session = activeSession
    const agent = session?.agent
    if (!session || !agent) return
    setLiveDiffTargets((current) => {
      const next = new Map(current)
      next.set(session.id, {
        sessionId: session.id,
        agentKey: agent.key,
        startedAt: session.startedAt,
        manualDirectories: [],
        focusRequest: 1,
      })
      return next
    })
  }
  const toggleMessageHistory = () => {
    if (!activeSessionId) return
    if (messageHistoryTargets.has(activeSessionId)) {
      setMessageHistoryTargets((current) => {
        const target = current.get(activeSessionId)
        if (!target) return current
        const next = new Map(current)
        next.set(activeSessionId, { ...target, focusRequest: target.focusRequest + 1 })
        return next
      })
      return
    }
    if (activeSession?.agentIntegration !== "codex-app-server") return
    setMessageHistoryTargets((current) => {
      const next = new Map(current)
      next.set(activeSession.id, {
        sessionId: activeSession.id,
        startedAt: activeSession.startedAt,
        focusRequest: 1,
      })
      return next
    })
  }
  activateFocusTargetRef.current = (target) => {
    const { kind, sessionId } = parseTerminalFocusTargetKey(target)
    if (kind === "sidebar") {
      requestTerminalSidebarFocus()
      void focusPinnedTmuxSidebar()
      return
    }
    selectSession(sessionId)
    if (kind === "history")
      setMessageHistoryTargets((current) => {
        const target = current.get(sessionId)
        if (!target) return current
        const next = new Map(current)
        next.set(sessionId, { ...target, focusRequest: target.focusRequest + 1 })
        return next
      })
    else if (kind === "live-diff")
      setLiveDiffTargets((current) => {
        const target = current.get(sessionId)
        if (!target) return current
        const next = new Map(current)
        next.set(sessionId, { ...target, focusRequest: target.focusRequest + 1 })
        return next
      })
  }
  const runFocusAction = (key: string, invokedFromLeader: boolean) => {
    if (key !== "m") return false
    openBoxFocus(invokedFromLeader)
    return true
  }
  const runAction = (key: string) => {
    if (disabled(key) || !TERMINAL_ACTIONS.some((action) => action.key === key)) return
    const invokedFromLeader = leaderRef.current
    setLeader(false)
    if (runFocusAction(key, invokedFromLeader)) return
    if (!["e", "l", ",", "q", "m"].includes(key) && !key.startsWith("alt+")) restoreFocus()
    switch (key) {
      case "n":
        launchSection()
        break
      case "a":
        launchSection(createCodexAgentCommand())
        break
      case "v":
        requestSplit(false)
        break
      case "h":
        requestSplit(true)
        break
      case "s":
        toggleMessageHistory()
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
      setLiveDiffTargets((current) => {
        if (!current.has(id)) return current
        const next = new Map(current)
        next.delete(id)
        return next
      })
      focusTerminal(id)
    },
    [focusTerminal],
  )
  const closeMessageHistory = useCallback(
    (id: string) => {
      setMessageHistoryTargets((current) => {
        if (!current.has(id)) return current
        const next = new Map(current)
        next.delete(id)
        return next
      })
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
      setLiveDiffTargets((current) => {
        const target = current.get(id)
        if (!target || target.manualDirectories.includes(path)) return current
        const next = new Map(current)
        next.set(id, {
          ...target,
          manualDirectories: [...target.manualDirectories, path],
        })
        return next
      })
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
      splitRequestRef.current = null
      setSplitRequest(null)
      liveDiffProjectSearch.current?.abort()
      setLiveDiffProjectPicker(null)
    } else if (
      dialogRef.current ||
      splitRequestRef.current ||
      liveDiffProjectPicker ||
      leaderRef.current ||
      boxFocusBusyRef.current
    )
      return
    else if (activeSessionId) focusTerminal(activeSessionId)
    else workspaceRef.current?.focus()
  }, [active, activeSessionId, boxFocusBusyRef, focusTerminal, liveDiffProjectPicker])

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
      recentThreads,
      masterKeyActive: leaderActive,
      focusSelection: selectedBoxFocusTarget
        ? { selectedTarget: selectedBoxFocusTarget, onFocus: focusBox }
        : undefined,
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
      recentThreads,
      openSidebarTerminal,
      openSidebarCommand,
      focusBox,
      selectFolderInSidebar,
      selectSession,
      selectedBoxFocusTarget,
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
    if ("focusTarget" in target) {
      handledTargetRevision.current = requestedTargetRevision
      focusBox(target.focusTarget)
      return
    }
    if ("action" in target) {
      handledTargetRevision.current = requestedTargetRevision
      runActionRef.current(target.action)
      return
    }
    if ("resumeThreadId" in target) {
      handledTargetRevision.current = requestedTargetRevision
      resumeCodexThreadRef.current(target.resumeThreadId)
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
    focusBox,
    notify,
    toggleFolder,
  ])

  const handleMasterKey = (key: KeyEvent) => {
    const configuredKey = getUiSettings().terminalMasterKey
    if (!matchesTerminalMasterKey(key, configuredKey)) return false
    key.preventDefault()
    key.stopPropagation()
    if (leaderRef.current) {
      processHandles.current
        .get(activeSessionRef.current ?? "")
        ?.write(terminalMasterKeyBytes(configuredKey))
      setLeader(false)
      restoreFocus()
    } else {
      rememberBoxFocusOrigin()
      setLeader(true)
    }
    return true
  }

  const handleLeaderKey = (key: KeyEvent) => {
    if (!leaderRef.current) return false
    if (renderer.currentFocusedRenderable?.id === "terminal-action-search") return true
    if (key.name === "/" || key.sequence === "/" || key.raw === "/") {
      key.preventDefault()
      key.stopPropagation()
      renderer.root.findDescendantById("terminal-action-search")?.focus()
      return true
    }
    if (
      ["up", "down", "left", "right", "enter", "return"].includes(key.name) ||
      ["j", "k"].includes(key.name.toLowerCase())
    )
      return true
    key.preventDefault()
    key.stopPropagation()
    const action = terminalActionKey(key)
    if (action?.startsWith("alt+")) {
      runAction(action)
      return true
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
      return true
    }
    if (action) runAction(action)
    return true
  }

  useKeyboard((key) => {
    if (
      !active ||
      dialogRef.current ||
      splitRequestRef.current ||
      liveDiffProjectPicker ||
      key.defaultPrevented
    )
      return
    if (handleMasterKey(key)) return
    handleLeaderKey(key)
  })

  return (
    <TerminalShortcutAnimation active={active}>
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
              focusSelection={
                selectedBoxFocusTarget
                  ? { selectedTarget: selectedBoxFocusTarget, onFocus: focusBox }
                  : undefined
              }
              focusRequest={focusRequest}
              onSelectFolder={selectFolderInSidebar}
              onToggleFolder={toggleFolder}
              onActivate={selectSession}
              onActions={toggleSidebarActions}
              onNew={openSidebarTerminal}
              onCommand={sessions.length < MAX_SESSIONS ? openSidebarCommand : undefined}
            />
          )}
          <TerminalPanes
            sessions={sessions}
            activeSession={activeSession}
            activeSessionId={activeSessionId}
            toolActive={active}
            appearanceKey={appearanceKey}
            paletteSequence={terminalPaletteSequence}
            availableWidth={dimensions.width}
            availableHeight={dimensions.height}
            sidebarWidth={sidebarWidth}
            liveDiffTargets={liveDiffTargets}
            messageHistoryTargets={messageHistoryTargets}
            agentMessages={agentMessages}
            selectedFocusTarget={selectedBoxFocusTarget}
            onNewTerminal={launchSection}
            onNewCodex={openCodexTerminal}
            onActivate={selectSession}
            onReady={terminalReady}
            onGone={terminalGone}
            onInput={terminalInput}
            onResize={terminalResize}
            onCloseLiveDiff={closeLiveDiff}
            onAddLiveDiffProject={addLiveDiffProject}
            onCloseMessageHistory={closeMessageHistory}
            onReturnMessageHistoryTerminal={focusTerminal}
            onFocusTarget={focusBox}
          />
        </box>
        {leaderActive && (
          <TerminalActions
            width={dimensions.width}
            height={dimensions.height}
            recentThreads={recentThreads}
            onAction={runAction}
            onSelectThread={resumeCodexThread}
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
        {splitRequest && (
          <TerminalSplitDialog
            down={splitRequest.down}
            agents={splitAgents}
            canCreateTerminal={canCreateSplitTerminal}
            onCreateTerminal={createSplitTerminal}
            onSelectAgent={placeSplitAgent}
            onClose={closeSplitDialog}
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
    </TerminalShortcutAnimation>
  )
}
