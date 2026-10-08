import { isLanguage, setLanguage } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { detectAgentTitle } from "../model/agent-screen"
import { agentTaskTitle } from "../model/agent-task-title"
import type { PinnedTerminalSidebarReplica } from "../model/pinned-sidebar"
import { DEFAULT_FOLDER, type TerminalSession } from "../model/sessions"
import { type TmuxPaneInfo, TUIMINAL_TMUX_FOLDER } from "../model/tmux"
import { requestPinnedSidebarSnapshot } from "../services/pinned-sidebar-control"
import { discoverTmuxWorkspace } from "../services/tmux-agents"

export type DiscoveredRows = Awaited<ReturnType<typeof discoverTmuxWorkspace>>["panes"]

export async function readSidebarContent(
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

export function applyReplicaAppearance(replica: PinnedTerminalSidebarReplica) {
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

export function sessionForPane(
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
