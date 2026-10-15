import { useTerminalFolders } from "./hooks/use-terminal-folders"
import { useTerminalWorkspaceKeyboard } from "./hooks/use-terminal-workspace-keyboard"
import { useTerminalSidebarBridge } from "./hooks/use-terminal-sidebar-bridge"
import { useTerminalProjectSyncFlow } from "./hooks/use-terminal-project-sync-flow"
import { useTerminalCompanions } from "./hooks/use-terminal-companions"
import type { BoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { getLanguage, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import { COLORS, getUiSettings } from "@xupon/tuiminal-core/settings/theme"
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
  requestTerminalSidebarFocus,
  subscribeTerminalSidebar,
  terminalSidebarFocusRevision,
  terminalSidebarPinnedSnapshot,
  terminalSidebarRequestRevision,
  terminalSidebarTmuxHostSnapshot,
  toggleTerminalSidebarPinned,
} from "./model/pinned-sidebar"
import {
  agentSessionHasCapability,
  cleanTerminalName,
  DEFAULT_FOLDER,
  EXTERNAL_FOLDER,
  type TermAgentsCommand,
  MAX_SESSIONS,
  MAX_TERMINALS_PER_SECTION,
  orderedRunningAgents,
  type RemoteServerSetupRequest,
  terminalSections,
  visibleTerminalShortcutTargets,
} from "./model/sessions"
import type { SplitRequest } from "./rendering/terminal-workspace-presentation"
import { tmuxAgentNotice } from "./rendering/tmux-agent-notice"
import { resolveAgentResumeCommand } from "./services/agent-resume-command"
import { focusPinnedTmuxSidebar } from "./services/pinned-sidebar-tmux"
import { listSshConfigProfiles } from "./services/ssh-config"
import {
  createTermAgentsCommand,
  createRemoteServerSetupCommand,
  createShellTerminalCommand,
} from "./services/terminal"
import { TerminalTutorialDemo } from "./tutorial/TerminalTutorialDemo"
import { isTerminalTutorialTarget } from "./tutorial/TerminalTutorialVisualState"
import { AgentLaunchDialog, type AgentLaunchStep } from "./ui/AgentLaunchDialog"
import { LiveDiffProjectPicker } from "./ui/LiveDiffProjectPicker"
import { RemoteCodexCompatibilityPrompt } from "./ui/RemoteCodexCompatibilityPrompt"
import { RemoteProjectSyncFlow } from "./ui/RemoteProjectSyncFlow"
import { TERMINAL_ACTIONS, TerminalActions } from "./ui/TerminalActions"
import { TerminalDialog, type TerminalDialogKind } from "./ui/TerminalDialog"
import { TerminalPanes } from "./ui/TerminalPanes"
import { TerminalShortcutAnimation } from "./ui/TerminalShortcut"
import { TerminalSidebar } from "./ui/TerminalSidebar"
import { TerminalSplitDialog } from "./ui/TerminalSplitDialog"

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
  const {
    liveDiffTargets,
    setLiveDiffTargets,
    messageHistoryTargets,
    setMessageHistoryTargets,
    liveDiffProjectPicker,
    setLiveDiffProjectPicker,
    liveDiffProjectSearch,
    toggleLiveDiff,
    toggleMessageHistory,
    closeLiveDiff,
    closeMessageHistory,
    addLiveDiffProject,
    closeLiveDiffProjectPicker,
    selectLiveDiffProject,
  } = useTerminalCompanions(terminal)
  const externalSessions = useExternalTerminals()
  const sidebarSessions = useMemo(
    () => [...sessions, ...externalSessions],
    [externalSessions, sessions],
  )
  const {
    folders,
    collapsedFolderIds,
    selectedFolder,
    setSelectedFolder,
    toggleFolder,
    folderForTmuxPane,
  } = useTerminalFolders(sessions)
  const [leaderActive, setLeaderActive] = useState(false)
  const leaderRef = useRef(false)
  const [dialog, setDialog] = useState<TerminalDialogKind | null>(null)
  const dialogRef = useRef<TerminalDialogKind | null>(null)
  const [splitRequest, setSplitRequest] = useState<SplitRequest | null>(null)
  const splitRequestRef = useRef<SplitRequest | null>(null)
  const [agentLaunchStep, setAgentLaunchStep] = useState<AgentLaunchStep | null>(null)
  const sequence = useRef(0)
  const activateFocusTargetRef = useRef<(target: TerminalFocusTargetKey) => void>(() => undefined)
  const runActionRef = useRef<(key: string) => void>(() => undefined)
  const resumeAgentThreadRef = useRef<(thread: AgentResumeThread) => void>(() => undefined)
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
    [collapsedFolderIds, folders, sidebarSessions],
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
  useAutomaticTmuxMirrors(sessionsRef, dismissedTmuxPanes, launchCommand, folderForTmuxPane)
  usePinnedTmuxSidebars(sidebarPinned, sidebarWidth, masterKey)

  const selectFolderInSidebar = useCallback(
    (id: string) => {
      setSelectedFolder(id)
      workspaceRef.current?.focus()
    },
    [setSelectedFolder],
  )

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
    [activateSession, externalSessions, notify, sessionsRef, setNotice, setSelectedFolder],
  )
  const restoreFocus = useCallback(() => {
    if (activeSessionRef.current) focusTerminal(activeSessionRef.current)
    else queueMicrotask(() => workspaceRef.current?.focus())
  }, [activeSessionRef, focusTerminal])
  const {
    projectSyncFlow,
    setProjectSyncFlow,
    closeProjectSyncFlow,
    runProjectSync,
    requestProjectSync,
    pageProjectSyncReview,
    toggleAutomaticProjectSync,
    chooseProjectSyncParent,
  } = useTerminalProjectSyncFlow({ sessions, activeSessionRef, projectSync, restoreFocus })
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
    [launchCommand, setSelectedFolder],
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
    setLiveDiffProjectPicker,
    setProjectSyncFlow,
    liveDiffProjectSearch,
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
      folders,
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
  useTerminalSidebarBridge({
    sidebarView,
    requestedTargetRevision,
    focusBox,
    runActionRef,
    loadMoreThreads,
    recentThreads,
    resumeAgentThreadRef,
    folders,
    setSelectedFolder,
    toggleFolder,
    sidebarSessions,
    selectSession,
    sessions,
    sequence,
    launchCommand,
    folderForTmuxPane,
  })
  useTerminalWorkspaceKeyboard({
    leaderRef,
    processHandles,
    activeSessionRef,
    setLeader,
    restoreFocus,
    rememberBoxFocusOrigin,
    runAction,
    masterKeyTargets,
    selectSession,
    isBlocked: () =>
      Boolean(
        !active ||
          dialogRef.current ||
          splitRequestRef.current ||
          agentLaunchStep ||
          projectSyncFlow ||
          liveDiffProjectPicker ||
          remoteCodexCompatibility.prompt,
      ),
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
