import { createCliRenderer } from "@opentui/core"
import { createRoot, useFocus, useKeyboard, useTerminalDimensions } from "@opentui/react"
import { isLanguage, setLanguage } from "@xupon/tuiminal-core/i18n/index"
import {
  COLORS,
  getUiSettings,
  matchesTerminalMasterKey,
} from "@xupon/tuiminal-core/settings/theme"
import { useCallback, useEffect, useMemo, useState } from "react"
import { detectAgentTitle } from "../model/agent-screen"
import { agentTaskTitle } from "../model/agent-task-title"
import type { PinnedTerminalSidebarReplica } from "../model/pinned-sidebar"
import {
  DEFAULT_FOLDER,
  DEFAULT_FOLDER_NAME,
  EXTERNAL_FOLDER,
  EXTERNAL_FOLDER_NAME,
  MAX_SESSIONS,
  MAX_TERMINALS_PER_SECTION,
  type TerminalSession,
  terminalSections,
} from "../model/sessions"
import { type TmuxPaneInfo, TUIMINAL_TMUX_FOLDER } from "../model/tmux"
import {
  requestPinnedSidebarSnapshot,
  sendPinnedSidebarTarget,
} from "../services/pinned-sidebar-control"
import { waitForPinnedTmuxSidebarFocus } from "../services/pinned-sidebar-focus"
import { selectPinnedTmuxHost, selectPinnedTmuxTarget } from "../services/pinned-sidebar-navigation"
import { waitForPinnedSidebarTerminalReady } from "../services/pinned-sidebar-terminal"
import { discoverTmuxWorkspace } from "../services/tmux-agents"
import { TERMINAL_ACTIONS, TerminalActions } from "../ui/TerminalActions"
import { TerminalSidebar } from "../ui/TerminalSidebar"

type SidebarMode = "app" | "tmux"
type DiscoveredRows = Awaited<ReturnType<typeof discoverTmuxWorkspace>>["panes"]

async function readSidebarContent(
  endpoint: string,
  sourceSocket: string,
  hostPane: string,
  signal: AbortSignal,
) {
  const replica = await requestPinnedSidebarSnapshot(endpoint)
  if (replica) return { replica, rows: null }
  const workspace = await discoverTmuxWorkspace(signal)
  return {
    replica: null,
    rows: workspace.panes.filter(
      ({ pane }) => pane.socket !== sourceSocket || pane.paneId !== hostPane,
    ),
  }
}

function applyReplicaAppearance(replica: PinnedTerminalSidebarReplica) {
  for (const [name, value] of Object.entries(replica.theme)) {
    if (Object.hasOwn(COLORS, name) && typeof value === "string")
      Object.assign(COLORS, { [name]: value })
  }
  if (isLanguage(replica.language)) setLanguage(replica.language)
}

function sidebarSessionId(pane: TmuxPaneInfo) {
  let socketHash = 0
  for (const character of pane.socket)
    socketHash = (socketHash * 31 + character.charCodeAt(0)) >>> 0
  return `sidebar-${socketHash.toString(36)}-${pane.paneId.slice(1)}`
}

function sessionForPane(
  pane: TmuxPaneInfo,
  agent: Awaited<ReturnType<typeof discoverTmuxWorkspace>>["panes"][number]["agent"],
): TerminalSession {
  const id = sidebarSessionId(pane)
  const signal = agent ? detectAgentTitle(agent.profile, pane.paneTitle ?? "") : null
  return {
    id,
    sectionId: id,
    folderId: pane.ownedByTuiminal ? DEFAULT_FOLDER : TUIMINAL_TMUX_FOLDER,
    row: 0,
    column: 0,
    kind: "custom",
    label: pane.command || "tmux",
    shortLabel: "tmux",
    displayCommand: pane.command || "tmux",
    command: [],
    accent: COLORS.terminal,
    workingDirectory: pane.cwd,
    tmux: pane,
    title: agent?.label ?? pane.command ?? "tmux",
    titleMode: "automatic",
    status: "running",
    busy: !/^(?:ba|da|fi|k|z)?sh$|^(?:cmd|powershell|pwsh)(?:\.exe)?$/i.test(pane.command),
    pid: pane.panePid,
    exitCode: null,
    startedAt: 0,
    agent: agent
      ? {
          ...agent,
          state: signal?.state ?? "unknown",
          activity: signal?.activity ?? null,
          taskTitle: agentTaskTitle(agent, pane.paneTitle ?? "") ?? null,
        }
      : null,
    backend: "tmux",
  }
}

function SidebarApp({
  sourceSocket,
  hostPane,
  mode,
  endpoint,
  onExit,
}: {
  sourceSocket: string
  hostPane: string
  mode: SidebarMode
  endpoint: string
  onExit: () => void
}) {
  const dimensions = useTerminalDimensions()
  const [rows, setRows] = useState<DiscoveredRows>([])
  const [replica, setReplica] = useState<PinnedTerminalSidebarReplica | null>(null)
  const [localActiveSessionId, setLocalActiveSessionId] = useState<string | null>(null)
  const [localFolder, setLocalFolder] = useState<string | null>(null)
  const [localCollapsedFolderIds, setLocalCollapsedFolderIds] = useState<string[]>([])
  const [leaderActive, setLeaderActive] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const scan = async () => {
      try {
        const content = await readSidebarContent(
          endpoint,
          sourceSocket,
          hostPane,
          controller.signal,
        )
        if (controller.signal.aborted) return
        setReplica(content.replica)
        if (content.replica) applyReplicaAppearance(content.replica)
        else setRows(content.rows)
      } catch {
        // A transient server or process snapshot failure keeps the previous rows.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void scan(), 1000)
      }
    }
    void scan()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [endpoint, hostPane, sourceSocket])
  const discoveredSessions = useMemo(
    () => rows.map(({ pane, agent }) => sessionForPane(pane, agent)),
    [rows],
  )
  const sessions = replica?.sessions ?? discoveredSessions
  const folders = replica?.folders ?? [
    { id: DEFAULT_FOLDER, name: DEFAULT_FOLDER_NAME },
    { id: TUIMINAL_TMUX_FOLDER, name: "tmux" },
    { id: EXTERNAL_FOLDER, name: EXTERNAL_FOLDER_NAME },
  ]
  const activeSessionId = localActiveSessionId ?? replica?.activeSessionId ?? null
  const selectedFolder = localFolder ?? replica?.selectedFolder ?? DEFAULT_FOLDER
  const collapsedFolderIds = replica?.collapsedFolderIds ?? localCollapsedFolderIds
  const masterKey = replica?.masterKey ?? getUiSettings().terminalMasterKey
  const managedSessions = useMemo(() => sessions.filter((session) => !session.external), [sessions])
  const sections = useMemo(() => terminalSections(managedSessions), [managedSessions])
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const activeSection = sections.find((section) => section.id === activeSession?.sectionId)
  const canSplit = Boolean(
    activeSection &&
      activeSection.panes.length < MAX_TERMINALS_PER_SECTION &&
      managedSessions.length < MAX_SESSIONS,
  )
  const disabled = useCallback(
    (key: string) => {
      if (["v", "s"].includes(key)) return !canSplit
      if (["n", "c", "/"].includes(key)) return managedSessions.length >= MAX_SESSIONS
      if (key === "r" && activeSession?.tmux) return true
      if (["r", "x", "m", "e", "1"].includes(key)) return !activeSession
      return key === "2" && activeSection?.panes.length !== 2
    },
    [activeSection, activeSession, canSplit, managedSessions.length],
  )
  const activate = useCallback(
    async (id: string) => {
      const session = sessions.find((candidate) => candidate.id === id)
      if (!session) return
      const target = session.tmux as TmuxPaneInfo | undefined
      if (
        mode === "tmux" &&
        target?.windowId &&
        (await selectPinnedTmuxTarget(sourceSocket, target))
      ) {
        setLocalActiveSessionId(id)
        setLocalFolder(session.folderId)
        if (replica) await sendPinnedSidebarTarget(endpoint, { sessionId: id })
        return
      }
      const selection = replica
        ? { sessionId: id }
        : target
          ? { socket: target.socket, paneId: target.paneId }
          : null
      if (!selection) return
      const delivered = await sendPinnedSidebarTarget(endpoint, selection)
      if (delivered) await selectPinnedTmuxHost(sourceSocket, hostPane)
      else if (!delivered && mode === "app" && target?.windowId)
        await selectPinnedTmuxTarget(sourceSocket, target)
    },
    [endpoint, hostPane, mode, replica, sessions, sourceSocket],
  )
  const selectFolder = useCallback(
    async (id: string) => {
      setLocalFolder(id)
      if (!replica) {
        setLocalCollapsedFolderIds((current) =>
          current.includes(id) ? current.filter((folderId) => folderId !== id) : [...current, id],
        )
        return
      }
      setReplica((current) =>
        current
          ? {
              ...current,
              collapsedFolderIds: current.collapsedFolderIds.includes(id)
                ? current.collapsedFolderIds.filter((folderId) => folderId !== id)
                : [...current.collapsedFolderIds, id],
            }
          : current,
      )
      // Folding is local sidebar navigation. Keep the helper pane selected;
      // only activating content or an app-only action returns to the host pane.
      await sendPinnedSidebarTarget(endpoint, { folderId: id })
    },
    [endpoint, replica],
  )
  const focusSidebar = useCallback(() => {
    setLeaderActive(false)
    setFocusRequest((current) => current + 1)
  }, [])
  useFocus(focusSidebar)
  useEffect(() => {
    const paneId = process.env.TMUX_PANE
    if (!paneId || !/^%\d+$/.test(paneId)) return
    const controller = new AbortController()
    const listen = async () => {
      while (!controller.signal.aborted) {
        try {
          await waitForPinnedTmuxSidebarFocus(sourceSocket, paneId, controller.signal)
          if (!controller.signal.aborted) focusSidebar()
        } catch {
          if (controller.signal.aborted) return
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }
    }
    void listen()
    return () => controller.abort()
  }, [focusSidebar, sourceSocket])
  const runAction = useCallback(
    async (key: string) => {
      if (key === "escape" || key === "l") {
        focusSidebar()
        return
      }
      if (disabled(key) || !TERMINAL_ACTIONS.some(([action]) => action === key)) return
      setLeaderActive(false)
      const delivered = await sendPinnedSidebarTarget(endpoint, { action: key })
      if (!delivered) {
        setFocusRequest((current) => current + 1)
        return
      }
      if (mode === "app" || ["/", "e", "g"].includes(key))
        await selectPinnedTmuxHost(sourceSocket, hostPane)
      else setFocusRequest((current) => current + 1)
    },
    [disabled, endpoint, focusSidebar, hostPane, mode, sourceSocket],
  )
  useKeyboard((key) => {
    if (key.defaultPrevented) return
    if (matchesTerminalMasterKey(key, masterKey)) {
      key.preventDefault()
      key.stopPropagation()
      if (leaderActive) focusSidebar()
      else setLeaderActive(true)
      return
    }
    if (leaderActive) {
      key.preventDefault()
      key.stopPropagation()
      if (key.name === "escape") focusSidebar()
      else void runAction(key.name)
      return
    }
    if (key.ctrl && key.name === "c") onExit()
    else if (key.name === "q") onExit()
  })
  const actionHeight = leaderActive ? Math.max(3, Math.floor(dimensions.height / 2)) : 0
  return (
    <box style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
      <TerminalSidebar
        active={!leaderActive}
        navigationOnly
        autoFocus
        focusRequest={focusRequest}
        sessions={sessions}
        folders={folders}
        collapsedFolderIds={collapsedFolderIds}
        selectedFolder={selectedFolder}
        activeSessionId={activeSessionId}
        width={Math.max(16, dimensions.width)}
        height={Math.max(1, dimensions.height - actionHeight)}
        masterKey={masterKey}
        onSelectFolder={(id) => void selectFolder(id)}
        onToggleFolder={() => undefined}
        onActivate={(id) => void activate(id)}
        onActions={() => setLeaderActive(true)}
        onMasterKey={() => setLeaderActive(true)}
        onEscape={focusSidebar}
        onNew={() => undefined}
      />
      {leaderActive && (
        <TerminalActions
          width={dimensions.width}
          height={actionHeight}
          onAction={(key) => void runAction(key)}
          disabled={disabled}
        />
      )}
    </box>
  )
}

export async function runTerminalSidebarCli(args: string[]) {
  const [sourceSocket, hostPane, rawMode, endpoint] = args
  if (
    !sourceSocket?.startsWith("/") ||
    !/^%\d+$/.test(hostPane ?? "") ||
    (rawMode !== "app" && rawMode !== "tmux") ||
    !endpoint?.startsWith("/")
  )
    return 2
  const validSourceSocket = sourceSocket!
  const validHostPane = hostPane!
  const validEndpoint = endpoint!
  const mode: SidebarMode = rawMode
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useMouse: true,
    enableMouseMovement: true,
    useKittyKeyboard: { allKeysAsEscapes: true },
  })
  await waitForPinnedSidebarTerminalReady(renderer)
  const result = Promise.withResolvers<number>()
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    try {
      renderer.destroy()
    } finally {
      result.resolve(0)
    }
  }
  process.once("SIGTERM", finish)
  process.once("SIGHUP", finish)
  createRoot(renderer).render(
    <SidebarApp
      sourceSocket={validSourceSocket}
      hostPane={validHostPane}
      mode={mode}
      endpoint={validEndpoint}
      onExit={finish}
    />,
  )
  return result.promise.finally(() => {
    process.off("SIGTERM", finish)
    process.off("SIGHUP", finish)
  })
}
