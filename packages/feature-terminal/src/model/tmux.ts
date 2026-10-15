/** Targets retain server-scoped immutable IDs. */
export type TmuxSessionTarget = {
  socket: string
  sessionId: string
  name: string
  windowId?: string
}

export type TmuxTerminalKind = "shell" | "custom"

export type TmuxPaneTarget = TmuxSessionTarget & {
  paneId: string
  /** Display name reported by tmux when it is available. */
  windowName?: string
  /** Stable ID stored on a Tuiminal-owned window across automatic renames. */
  persistentId?: string
  /** Pane belongs to the persistent tmux server managed by Tuiminal. */
  ownedByTuiminal?: boolean
  /** Original Tuiminal command kind, persisted on owned tmux windows. */
  terminalKind?: TmuxTerminalKind
}

export type TmuxPaneInfo = TmuxPaneTarget & {
  windowId: string
  windowIndex: number
  windowName: string
  paneIndex: number
  command: string
  panePid: number | null
  cwd: string
  paneTitle?: string
  sidebar?: boolean
  startCommand?: string
}

export const TUIMINAL_TMUX_SERVER = "tuiminal"
export const TUIMINAL_TMUX_SESSION = "tuiminal"
export const TUIMINAL_TMUX_FOLDER = "tmux"
export const TMUX_SIDEBAR_OPTION = "@tuiminal_sidebar"
export const TMUX_SIDEBAR_MUTATION_OPTION = "@tuiminal_sidebar_mutation"
export const TMUX_TERMINAL_ID_OPTION = "@tuiminal_terminal_id"
export const TMUX_TERMINAL_KIND_OPTION = "@tuiminal_terminal_kind"

export const TMUX_PANE_FORMAT = `#{socket_path}\t#{session_id}\t#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_current_command}\t#{pane_pid}\t#{${TMUX_SIDEBAR_OPTION}}\t#{=1024:pane_start_command}\t#{=512:pane_title}\t#{${TMUX_TERMINAL_ID_OPTION}}\tterminal-kind=#{${TMUX_TERMINAL_KIND_OPTION}}\t#{pane_current_path}`

function validTmuxPaneFields(fields: string[]) {
  const [socket, sessionId, name, windowId, window, , paneId, pane] = fields
  return Boolean(
    socket?.startsWith("/") &&
      /^\$\d+$/.test(sessionId ?? "") &&
      name &&
      /^@\d+$/.test(windowId ?? "") &&
      /^%\d+$/.test(paneId ?? "") &&
      /^\d+$/.test(window ?? "") &&
      /^\d+$/.test(pane ?? ""),
  )
}

function tmuxPaneMetadata(fields: string[]) {
  const terminalKindField = fields[14]
  const extendedWithTerminalKind = terminalKindField?.startsWith("terminal-kind=") ?? false
  const extendedWithPersistentId = extendedWithTerminalKind || fields.length >= 15
  const extended = fields.length >= 14
  const terminalKindValue = extendedWithTerminalKind
    ? terminalKindField?.slice("terminal-kind=".length)
    : ""
  const terminalKind: TmuxTerminalKind | undefined =
    terminalKindValue === "shell" || terminalKindValue === "custom" ? terminalKindValue : undefined
  return {
    sidebar: extended ? fields[10] : "",
    startCommand: extended ? fields[11] : "",
    paneTitle: extended ? fields[12] : "",
    persistentId: extendedWithPersistentId ? fields[13] : "",
    terminalKind,
    path: fields.slice(
      extendedWithTerminalKind ? 15 : extendedWithPersistentId ? 14 : extended ? 13 : 10,
    ),
  }
}

function parseTmuxPaneLine(line: string): TmuxPaneInfo | null {
  const fields = line.split("\t")
  if (!validTmuxPaneFields(fields)) return null
  const [socket, sessionId, name, windowId, window, windowName, paneId, pane, command, pid] = fields
  const { sidebar, startCommand, paneTitle, persistentId, terminalKind, path } =
    tmuxPaneMetadata(fields)
  const panePid = Number(pid)
  return {
    socket: socket ?? "",
    sessionId: sessionId ?? "",
    name: name ?? "",
    windowId: windowId ?? "",
    windowIndex: Number(window),
    windowName: windowName ?? "",
    paneId: paneId ?? "",
    paneIndex: Number(pane),
    command: command ?? "",
    panePid: Number.isSafeInteger(panePid) && panePid > 0 ? panePid : null,
    ...(paneTitle ? { paneTitle } : {}),
    ...(persistentId ? { persistentId } : {}),
    ...(terminalKind ? { terminalKind } : {}),
    ...(sidebar === "1" ? { sidebar: true } : {}),
    ...(startCommand ? { startCommand } : {}),
    cwd: path.join("\t"),
  }
}

export function parseTmuxPanes(output: string): TmuxPaneInfo[] {
  return output
    .trimEnd()
    .split("\n")
    .map(parseTmuxPaneLine)
    .filter((pane): pane is TmuxPaneInfo => pane !== null)
}

export function supportsTmux(version: string) {
  const match = /^tmux\s+(\d+)\.(\d+)/.exec(version.trim())
  return Boolean(
    match && (Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 2)),
  )
}

export function tmuxPaneKey(target: TmuxPaneTarget) {
  return `${target.socket}\0${target.paneId}`
}

export function tmuxPaneLabel(target: TmuxPaneInfo) {
  return `${target.name}:${target.windowIndex}.${target.paneIndex} · ${target.windowName} · ${target.command} ${target.paneId}`
}

/** tmux parses trailing semicolons even when argv bypasses the system shell. */
export function tmuxLiteralArgument(value: string) {
  return value.endsWith(";") ? `${value.slice(0, -1)}\\;` : value
}
