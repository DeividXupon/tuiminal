import type { AgentStatus } from "./agent-state"
import type { TmuxPaneTarget, TmuxTerminalKind } from "./tmux"

export type FreeTerminalKind = TmuxTerminalKind | "codex"
export type FreeTerminalCommand = {
  kind: FreeTerminalKind
  label: string
  shortLabel: string
  displayCommand: string
  command: string[]
  accent: string
  /** Display context for the sidebar; never used to reconstruct a command. */
  workingDirectory?: string
  /** Present for a mirror of an existing tmux pane. */
  tmux?: TmuxPaneTarget
  /** Discovered mirrors are added without moving focus or reopening closed panes. */
  autoMirror?: boolean
  /** Read-only reference to a native terminal owned by another application. */
  external?: { terminalId: string }
  /** A first-party Codex app-server session, not a terminal screen observation. */
  codex?: { prompt: string }
}
export type TerminalSession = FreeTerminalCommand & {
  id: string
  sectionId: string
  folderId: string
  row: 0 | 1
  column: 0 | 1
  title: string
  /** Manual names survive process changes and explicit restarts. */
  titleMode?: "automatic" | "manual"
  status: "starting" | "running" | "exited" | "failed"
  /** A foreground tool is running instead of the interactive shell waiting for input. */
  busy?: boolean
  pid: number | null
  exitCode: number | null
  startedAt: number
  agent: AgentStatus | null
  /** The activity state is authoritative when Tuiminal owns the Codex app-server. */
  agentIntegration?: "codex-app-server"
  backend?: "native" | "tmux" | "external"
}
export type TerminalFolder = { id: string; name: string }
export type TerminalPlacement = Pick<TerminalSession, "sectionId" | "folderId" | "row" | "column">
export const MAX_SESSIONS = 12
export const MAX_TERMINALS_PER_SECTION = 2
export const DEFAULT_FOLDER = "terminal"
export const DEFAULT_FOLDER_NAME = "Tuiminais"
export const EXTERNAL_FOLDER = "others"
export const EXTERNAL_FOLDER_NAME = "Outros"

export function isRunningAgent(session: TerminalSession) {
  return session.status === "running" && session.agent !== null
}

export function normalizeSectionLayout(sessions: TerminalSession[], sectionId: string) {
  const remaining = sessions.filter((session) => session.sectionId === sectionId)
  if (remaining.length !== 1) return sessions
  return sessions.map((session) =>
    session.id === remaining[0]?.id ? { ...session, row: 0 as const, column: 0 as const } : session,
  )
}

export function terminalSections(sessions: readonly TerminalSession[]) {
  const sections = new Map<string, TerminalSession[]>()
  for (const session of sessions) {
    const section = sections.get(session.sectionId) ?? []
    section.push(session)
    sections.set(session.sectionId, section)
  }
  return [...sections].map(([id, panes]) => ({
    id,
    panes,
    folderId: panes[0]!.folderId,
  }))
}

export function numberedTerminalSections(sessions: readonly TerminalSession[]) {
  return terminalSections(sessions.filter((session) => !isRunningAgent(session)))
}

/**
 * Rows reachable through the Master Key, in exactly the order the sidebar paints
 * them. Collapsed folders do not expose their terminal rows, while running agents
 * remain visible in their dedicated list.
 */
export function visibleTerminalShortcutTargets(
  sessions: readonly TerminalSession[],
  folders: readonly TerminalFolder[],
  collapsedFolderIds: readonly string[],
) {
  const collapsedFolders = new Set(collapsedFolderIds)
  const sections = numberedTerminalSections(sessions)
  return [
    ...sessions.filter(isRunningAgent),
    ...folders.flatMap((folder) =>
      collapsedFolders.has(folder.id)
        ? []
        : sections
            .filter((section) => section.folderId === folder.id)
            .flatMap((section) => section.panes),
    ),
  ]
}

export function masterKeyShortcutLabel(index: number) {
  return index < 9 ? `[${index + 1}]` : null
}

export function cleanTerminalName(value: string) {
  const clean = value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, "").trim()
  let name = ""
  let count = 0
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
    clean,
  )) {
    if (count++ === 80) break
    name += segment
  }
  return name
}
