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
import { useAgentResumeThreads } from "./hooks/use-agent-resume-threads"
import { useAutomaticTmuxMirrors } from "./hooks/use-automatic-tmux-mirrors"
import { useExternalTerminals } from "./hooks/use-external-terminals"
import { usePinnedTmuxSidebars } from "./hooks/use-pinned-tmux-sidebars"
import { useWorkspaceRemoteCodexCompatibilityFlow } from "./hooks/use-remote-codex-compatibility-flow"
import { useRemoteProjectAutoSync } from "./hooks/use-remote-project-auto-sync"
import { useRemoteProjectSync } from "./hooks/use-remote-project-sync"
import { useTerminalContexts } from "./hooks/use-terminal-contexts"
import { useTerminalFocusSelection } from "./hooks/use-terminal-focus-selection"
import { useTerminalPalette } from "./hooks/use-terminal-palette"
import { useTerminalSessions } from "./hooks/use-terminal-sessions"
import { useTerminalWorkspaceFocusTargets } from "./hooks/use-terminal-workspace-focus-targets"
import type { AgentProviderId } from "./model/agent-provider"
import type { AgentResumeThread } from "./model/agent-resume-thread"
import {
  parseTerminalFocusTargetKey,
  TERMINAL_SIDEBAR_FOCUS_TARGET,
  type TerminalFocusTargetKey,
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
import type { RemoteProjectSyncReview } from "./model/remote-project-sync"
import {
  agentSessionHasCapability,
  cleanTerminalName,
  DEFAULT_FOLDER,
  DEFAULT_FOLDER_NAME,
  EXTERNAL_FOLDER,
  EXTERNAL_FOLDER_NAME,
  type TermAgentsCommand,
  MAX_SESSIONS,
  MAX_TERMINALS_PER_SECTION,
  orderedRunningAgents,
  type RemoteServerSetupRequest,
  type TerminalFolder,
  type TerminalSession,
  terminalSections,
  visibleTerminalShortcutTargets,
} from "./model/sessions"
import { type TmuxPaneInfo, TUIMINAL_TMUX_FOLDER } from "./model/tmux"
import type {
  MessageHistoryTarget,
  SplitRequest,
} from "./rendering/terminal-workspace-presentation"
import { tmuxAgentNotice } from "./rendering/tmux-agent-notice"
import { resolveAgentResumeCommand } from "./services/agent-resume-command"
import { discoverLiveDiffProjects, type LiveDiffProject } from "./services/live-diff-projects"
import { focusPinnedTmuxSidebar } from "./services/pinned-sidebar-tmux"
import {
  pathExists,
  RemoteProjectSyncCollisionError,
  remoteProjectSyncDestination,
} from "./services/remote-project-sync"
import { listSshConfigProfiles } from "./services/ssh-config"
import {
  createTermAgentsCommand,
  createRemoteServerSetupCommand,
  createShellTerminalCommand,
  TERM_AGENTS_WORKING_DIRECTORY,
} from "./services/terminal"
import {
  loadTerminalWorkspaceState,
  saveTerminalWorkspaceState,
  type TerminalWorkspaceState,
  terminalWorkspaceAssignmentKey,
} from "./services/terminal-workspace-state"
import { discoverTmuxWorkspace } from "./services/tmux-agents"
import { createTmuxMirrorCommand } from "./services/tmux-mirror-command"
import { TerminalTutorialDemo } from "./tutorial/TerminalTutorialDemo"
import { isTerminalTutorialTarget } from "./tutorial/TerminalTutorialVisualState"
import { AgentLaunchDialog, type AgentLaunchStep } from "./ui/AgentLaunchDialog"
import { LiveDiffProjectPicker } from "./ui/LiveDiffProjectPicker"
import { RemoteCodexCompatibilityPrompt } from "./ui/RemoteCodexCompatibilityPrompt"
import { RemoteProjectSyncFlow, type RemoteProjectSyncFlowState } from "./ui/RemoteProjectSyncFlow"
import { TERMINAL_ACTIONS, TerminalActions, terminalActionKey } from "./ui/TerminalActions"
import { TerminalDialog, type TerminalDialogKind } from "./ui/TerminalDialog"
import { TerminalPanes } from "./ui/TerminalPanes"
import { TerminalShortcutAnimation } from "./ui/TerminalShortcut"
import { TerminalSidebar } from "./ui/TerminalSidebar"
import { TerminalSplitDialog } from "./ui/TerminalSplitDialog"

const RESERVED_TERMINAL_FOLDERS: TerminalFolder[] = [
  { id: DEFAULT_FOLDER, name: DEFAULT_FOLDER_NAME },
  { id: TUIMINAL_TMUX_FOLDER, name: "tmux" },
  { id: EXTERNAL_FOLDER, name: EXTERNAL_FOLDER_NAME },
]

function terminalLeaderNavigationKey(key: KeyEvent, agentTabsActive: boolean) {
  if (["up", "down", "left", "right", "tab", "enter", "return"].includes(key.name)) return true
  if (key.ctrl || key.meta || key.option || key.shift || key.super) return false
  const name = key.name.toLowerCase()
  return ["h", "j", "k", "l"].includes(name) || (agentTabsActive && ["z", "v"].includes(name))
}

type LiveDiffTarget = {
  sessionId: string
  agentKey: string
  startedAt: number
  manualDirectories: readonly string[]
  focusRequest: number
}

export function TermAgents({
  active,
  externalSidebarHost = false,
  onOpenSettings,
  onSelectTool,
  onQuit,
  onMasterKeyActiveChange,
  remoteSetupRequest,
  onRemoteSetupRequestHandled,
  tutorial = null,
}: {
  active: boolean
  externalSidebarHost?: boolean
  onOpenSettings?: () => void
  onSelectTool?: (tool: "database" | "git" | "runner" | "http" | "terminal") => void
  onQuit?: () => void
  onMasterKeyActiveChange?: (active: boolean) => void
  remoteSetupRequest?: RemoteServerSetupRequest | null
  onRemoteSetupRequestHandled?: (id: number) => void
  /** While set, the simulated tour paints over the live workspace, which stays mounted. */
  tutorial?: { targetId: string | null } | null
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
    loadTerminalWorkspaceState(TERM_AGENTS_WORKING_DIRECTORY),
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
  const [agentLaunchStep, setAgentLaunchStep] = useState<AgentLaunchStep | null>(null)
  const [projectSyncFlow, setProjectSyncFlow] = useState<RemoteProjectSyncFlowState | null>(null)
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
  const resumeAgentThreadRef = useRef<(thread: AgentResumeThread) => void>(() => undefined)
  const handledTargetRevision = useRef(0)
  const handledRemoteSetupRequest = useRef(0)
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
  const visibleSessions = useMemo(
    () =>
      activeSession
        ? sessions.filter((session) => session.sectionId === activeSession.sectionId)
        : [],
    [activeSession, sessions],
  )
  const projectSync = useRemoteProjectSync(visibleSessions, sessions, {
    onAutomaticFailure(session, error) {
      notify({
        source: `terminal-project-sync:${session.id}`,
        kind: "error",
        title: translateUi("Falha na sincronização automática"),
        message:
          error instanceof Error
            ? translateUi(error.message)
            : translateUi("Não foi possível sincronizar."),
      })
    },
  })
  useRemoteProjectAutoSync(sessions, projectSync.requestAutomatic)
  const terminalContexts = useTerminalContexts(
    active,
    activeSession?.sectionId ?? null,
    activeSession?.startedAt ?? null,
    sessionsRef,
    processHandles,
  )
  const splitAgents = useMemo(
    () =>
      orderedRunningAgents(sessions).filter(
        (session) =>
          session.id !== activeSession?.id && session.sectionId !== activeSession?.sectionId,
      ),
    [activeSession?.id, activeSession?.sectionId, sessions],
  )
  const focusTargets = useTerminalWorkspaceFocusTargets({
    sessions,
    activeSession,
    liveDiffTargets,
    messageHistoryTargets,
    messages: agentMessages,
    availableWidth: dimensions.width,
    availableHeight: dimensions.height,
    sidebarWidth,
  })
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
        if (
          owner?.startedAt === target.startedAt &&
          agentSessionHasCapability(owner, "message-history")
        )
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
  const {
    recentThreads,
    activeRemoteProfileId,
    pagination: resumePagination,
    loadMoreThreads,
    refreshRemoteThreads,
  } = useAgentResumeThreads(active)
  const appearanceKey = [getLanguage(), COLORS.canvas, COLORS.border, COLORS.terminal].join(
    "\u0000",
  )
  const seenAgents = useRef<ReadonlySet<string>>(new Set())
  seenAgents.current = useMemo(
    () =>
      new Set(
        active &&
          !dialog &&
          !splitRequest &&
          !agentLaunchStep &&
          !leaderActive &&
          !selectedBoxFocusTarget
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
      agentLaunchStep,
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
      workspaceStateRef.current = saveTerminalWorkspaceState(TERM_AGENTS_WORKING_DIRECTORY, next)
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
    refreshRemoteThreads()
    leaderRef.current = true
    setLeaderActive(true)
  }, [refreshRemoteThreads, rememberBoxFocusOrigin, restoreFocus])
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
  const launchSection = useCallback(
    (command: TermAgentsCommand = createShellTerminalCommand()) => {
      sequence.current += 1
      const id = launchCommand(command, {
        sectionId: `section-${sequence.current}`,
        row: 0,
        column: 0,
        folderId: DEFAULT_FOLDER,
      })
      setSelectedFolder(DEFAULT_FOLDER)
      return id
    },
    [launchCommand],
  )
  const remoteCodexCompatibility = useWorkspaceRemoteCodexCompatibilityFlow({
    sessions,
    launchCommand,
    launchOriginal: launchSection,
    closeSession,
    updateSession,
    setNotice,
    agentLaunchOpen: Boolean(agentLaunchStep),
    setAgentLaunchStep,
    setSelectedFolder,
    restoreFocus,
    leaderRef,
    setLeaderActive,
  })
  useEffect(() => {
    if (!remoteSetupRequest || handledRemoteSetupRequest.current === remoteSetupRequest.id) return
    handledRemoteSetupRequest.current = remoteSetupRequest.id
    const existing = sessionsRef.current.find(
      (session) =>
        (session.status === "starting" || session.status === "running") &&
        session.remoteSetup?.profile.id === remoteSetupRequest.profile.id &&
        session.remoteSetup.profile.host === remoteSetupRequest.profile.host,
    )
    if (existing) selectSession(existing.id)
    else launchSection(createRemoteServerSetupCommand(remoteSetupRequest.profile))
    onRemoteSetupRequestHandled?.(remoteSetupRequest.id)
  }, [launchSection, onRemoteSetupRequestHandled, remoteSetupRequest, selectSession, sessionsRef])
  const resumeAgentThread = async (thread: AgentResumeThread) => {
    if (sessions.length >= MAX_SESSIONS) {
      setNotice("O limite de terminais foi atingido.")
      return
    }
    setLeader(false)
    const configured = getUiSettings().terminalRemoteCodexProfiles
    const remoteId = thread.remoteProfileId
    const profiles =
      remoteId && !configured.some((profile) => profile.id === remoteId)
        ? await listSshConfigProfiles().catch(() => [])
        : configured
    const { command, error } = resolveAgentResumeCommand(thread, profiles)
    if (error) {
      setNotice(error)
      return
    }
    if (command) launchSection(command)
  }
  resumeAgentThreadRef.current = resumeAgentThread
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
  const projectSyncDisabled = () => {
    if (
      !activeSession?.agentLaunch?.remote ||
      !agentSessionHasCapability(activeSession, "project-sync")
    )
      return true
    const status = projectSync.statuses.get(activeSession.id)
    return (
      status?.kind === "checking" || status?.kind === "syncing" || status?.kind === "cancelling"
    )
  }
  const disabled = (key: string) => {
    if (["c", "shift+h"].includes(key)) return !canSplit
    if (key === "s") return !agentSessionHasCapability(activeSession, "message-history")
    if (key === "r") return projectSyncDisabled()
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
    if (!activeSession || !agentSessionHasCapability(activeSession, "message-history")) return
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
  const closeProjectSyncFlow = () => {
    if (projectSyncFlow?.kind === "progress") {
      const owner = sessions.find((session) => session.id === projectSyncFlow.sessionId)
      if (owner) projectSync.cancel(owner)
      return
    }
    if (projectSyncFlow?.kind === "preview") {
      const owner = sessions.find((session) => session.id === projectSyncFlow.sessionId)
      if (owner) projectSync.cancel(owner)
    }
    setProjectSyncFlow(null)
    restoreFocus()
  }
  const runProjectSync = (
    session: TerminalSession,
    localPath?: string,
    review?: RemoteProjectSyncReview,
  ) => {
    const destination = review?.localPath ?? localPath ?? projectSync.mappingFor(session)?.localPath
    if (destination)
      setProjectSyncFlow({ kind: "progress", sessionId: session.id, localPath: destination })
    void projectSync
      .synchronize(session, localPath, {
        ...(review ? { review } : {}),
      })
      .then((mapping) => {
        if (!mapping) return
        setProjectSyncFlow(null)
        queueMicrotask(restoreFocus)
        notify({
          source: `terminal-project-sync:${session.id}`,
          kind: "success",
          title: translateUi("Projeto sincronizado"),
          message: mapping.localPath,
        })
      })
      .catch((error) => {
        if (error instanceof RemoteProjectSyncCollisionError)
          setProjectSyncFlow({ kind: "browse", sessionId: session.id })
        else {
          setProjectSyncFlow(null)
          queueMicrotask(restoreFocus)
        }
        if (!(error instanceof Error && error.message === "Operação cancelada."))
          notify({
            source: `terminal-project-sync:${session.id}`,
            kind: "error",
            title: translateUi("Falha na sincronização"),
            message:
              error instanceof Error
                ? translateUi(error.message)
                : translateUi("Não foi possível sincronizar."),
          })
      })
  }
  const requestProjectSync = (session: TerminalSession) => {
    const mapping = projectSync.mappingFor(session)
    if (!mapping) {
      setProjectSyncFlow({ kind: "browse", sessionId: session.id })
      return
    }
    setProjectSyncFlow({ kind: "progress", sessionId: session.id, localPath: mapping.localPath })
    void projectSync
      .inspect(session)
      .then((review) => {
        if (!review) return
        if (activeSessionRef.current !== session.id) {
          projectSync.cancel(session)
          setProjectSyncFlow(null)
          return
        }
        if (!review.changeCount) {
          setProjectSyncFlow(null)
          queueMicrotask(restoreFocus)
          notify({
            source: `terminal-project-sync:${session.id}`,
            kind: "info",
            title: translateUi("Projeto já sincronizado"),
            message: translateUi("Nenhum arquivo pendente."),
          })
          return
        }
        setProjectSyncFlow({ kind: "preview", sessionId: session.id, review })
      })
      .catch((error) => {
        setProjectSyncFlow(null)
        queueMicrotask(restoreFocus)
        if (!(error instanceof Error && error.message === "Operação cancelada."))
          notify({
            source: `terminal-project-sync:${session.id}`,
            kind: "error",
            title: translateUi("Falha na sincronização"),
            message:
              error instanceof Error
                ? translateUi(error.message)
                : translateUi("Não foi possível verificar o projeto."),
          })
      })
  }
  const pageProjectSyncReview = (session: TerminalSession, offset: number) => {
    void projectSync.page(session, offset).then((page) => {
      if (!page) return
      setProjectSyncFlow((current) =>
        current?.kind === "preview" && current.sessionId === session.id
          ? { kind: "preview", sessionId: session.id, review: { ...current.review, ...page } }
          : current,
      )
    })
  }
  const toggleAutomaticProjectSync = (session: TerminalSession) => {
    try {
      projectSync.toggleAutomatic(session)
    } catch (error) {
      notify({
        source: `terminal-project-sync:${session.id}`,
        kind: "error",
        title: translateUi("Falha na sincronização automática"),
        message:
          error instanceof Error
            ? translateUi(error.message)
            : translateUi("Não foi possível salvar a preferência de sincronização automática."),
      })
    }
  }
  const chooseProjectSyncParent = async (session: TerminalSession, parent: string) => {
    const remote = session.agentLaunch?.remote
    if (!remote) return
    const localPath = remoteProjectSyncDestination(parent, remote.workingDirectory)
    if (await pathExists(localPath)) {
      notify({
        source: `terminal-project-sync:${session.id}`,
        kind: "warning",
        title: translateUi("Pasta de sincronização ocupada"),
        message: translateUi(
          "Escolha outra pasta; o Tuiminal não substitui uma pasta desconhecida.",
        ),
      })
      return
    }
    setProjectSyncFlow({ kind: "destination", sessionId: session.id, localPath })
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
    if (!["e", "shift+l", ",", "q", "m"].includes(key) && !key.startsWith("alt+")) restoreFocus()
    switch (key) {
      case "n":
        launchSection()
        break
      case "a":
        {
          setAgentLaunchStep({ kind: "providers" })
        }
        break
      case "c":
        requestSplit(false)
        break
      case "shift+h":
        requestSplit(true)
        break
      case "s":
        toggleMessageHistory()
        break
      case "r":
        if (activeSession) requestProjectSync(activeSession)
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
      case "shift+l":
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
  const openSidebarTerminal = useCallback(() => launchSection(), [launchSection])
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
      if (session?.agentLaunch?.remote) return
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
      launchSection(createTermAgentsCommand(value))
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
      if (projectSyncFlow) {
        const owner = sessionsRef.current.find(
          (session) => session.id === projectSyncFlow.sessionId,
        )
        if (owner) projectSync.cancel(owner)
      }
      leaderRef.current = false
      setLeaderActive(false)
      dialogRef.current = null
      setDialog(null)
      splitRequestRef.current = null
      setSplitRequest(null)
      setAgentLaunchStep(null)
      setProjectSyncFlow(null)
      liveDiffProjectSearch.current?.abort()
      setLiveDiffProjectPicker(null)
    } else if (
      dialogRef.current ||
      splitRequestRef.current ||
      agentLaunchStep ||
      projectSyncFlow ||
      liveDiffProjectPicker ||
      remoteCodexCompatibility.prompt ||
      leaderRef.current ||
      boxFocusBusyRef.current
    )
      return
    else if (activeSessionId) focusTerminal(activeSessionId)
    else workspaceRef.current?.focus()
  }, [
    active,
    activeSessionId,
    boxFocusBusyRef,
    focusTerminal,
    liveDiffProjectPicker,
    agentLaunchStep,
    projectSyncFlow,
    projectSync.cancel,
    remoteCodexCompatibility.prompt,
    sessionsRef,
  ])

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
      activeRemoteProfileId,
      resumePagination,
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
      onLoadMoreResume: (providerId: AgentProviderId) => void loadMoreThreads(providerId),
    }),
    [
      activeSessionId,
      activeRemoteProfileId,
      collapsedFolderIds,
      leaderActive,
      masterKey,
      recentThreads,
      resumePagination,
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
      loadMoreThreads,
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
    if ("loadMoreResumeProvider" in target) {
      handledTargetRevision.current = requestedTargetRevision
      void loadMoreThreads(target.loadMoreResumeProvider)
      return
    }
    if ("resumeThreadId" in target) {
      handledTargetRevision.current = requestedTargetRevision
      const thread = recentThreads.find(
        (candidate) =>
          candidate.id === target.resumeThreadId &&
          (candidate.providerId ?? "codex") === (target.providerId ?? "codex") &&
          candidate.remoteProfileId === target.remoteProfileId,
      )
      if (thread) resumeAgentThreadRef.current(thread)
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
    recentThreads,
    sessions,
    sidebarSessions,
    selectSession,
    launchCommand,
    loadMoreThreads,
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
      terminalLeaderNavigationKey(
        key,
        Boolean(renderer.root.findDescendantById("terminal-agent-panel-active")),
      )
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
      agentLaunchStep ||
      projectSyncFlow ||
      liveDiffProjectPicker ||
      remoteCodexCompatibility.prompt ||
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
            contexts={terminalContexts}
            syncStatuses={projectSync.statuses}
            masterKey={masterKey}
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
            onRetryRemoteCodex={(flowId) => void remoteCodexCompatibility.retry(flowId)}
            onFocusTarget={focusBox}
          />
        </box>
        {leaderActive && (
          <TerminalActions
            width={dimensions.width}
            height={dimensions.height}
            recentThreads={recentThreads}
            activeRemoteProfileId={activeRemoteProfileId}
            resumePagination={resumePagination}
            onLoadMoreThreads={(providerId) => void loadMoreThreads(providerId)}
            onAction={runAction}
            onSelectThread={resumeAgentThread}
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
        {agentLaunchStep && (
          <AgentLaunchDialog
            step={agentLaunchStep}
            onStep={setAgentLaunchStep}
            sessions={sessions}
            inactive={Boolean(remoteCodexCompatibility.prompt)}
            onCancelLaunch={closeSession}
            onCompatibility={remoteCodexCompatibility.showCompatibility}
            onLaunch={launchSection}
            onClose={() => {
              setAgentLaunchStep(null)
              restoreFocus()
            }}
          />
        )}
        <RemoteCodexCompatibilityPrompt flow={remoteCodexCompatibility} />
        {liveDiffProjectPicker && (
          <LiveDiffProjectPicker
            projects={liveDiffProjectPicker.projects}
            loading={liveDiffProjectPicker.loading}
            error={liveDiffProjectPicker.error}
            onSelect={selectLiveDiffProject}
            onClose={closeLiveDiffProjectPicker}
          />
        )}
        <RemoteProjectSyncFlow
          flow={projectSyncFlow}
          sessions={sessions}
          statuses={projectSync.statuses}
          automaticFor={projectSync.automaticFor}
          onToggleAutomatic={toggleAutomaticProjectSync}
          onSelectParent={(owner, parent) => void chooseProjectSyncParent(owner, parent)}
          onSync={runProjectSync}
          onPage={pageProjectSyncReview}
          onClose={closeProjectSyncFlow}
        />
        {tutorial && isTerminalTutorialTarget(tutorial.targetId) && (
          <TerminalTutorialDemo activeTargetId={tutorial.targetId} />
        )}
      </box>
    </TerminalShortcutAnimation>
  )
}
