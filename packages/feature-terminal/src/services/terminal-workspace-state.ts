import { createHash } from "node:crypto"
import { readFileSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { atomicWriteFileSync, currentFileHash } from "@xupon/tuiminal-core/storage/atomic-file"
import { DEFAULT_FOLDER, EXTERNAL_FOLDER, type TerminalFolder } from "../model/sessions"
import { TUIMINAL_TMUX_FOLDER, type TmuxPaneTarget } from "../model/tmux"

const MAX_ASSIGNMENTS = 512
const RESERVED_FOLDERS = new Set([DEFAULT_FOLDER, TUIMINAL_TMUX_FOLDER, EXTERNAL_FOLDER])

export type TerminalWorkspaceState = {
  folders: TerminalFolder[]
  assignments: Record<string, string>
  collapsedFolderIds: string[]
}

type StoredTerminalWorkspaceState = TerminalWorkspaceState & {
  version: 1
  project: string
}

export const EMPTY_TERMINAL_WORKSPACE_STATE: TerminalWorkspaceState = {
  folders: [],
  assignments: {},
  collapsedFolderIds: [],
}

function workspaceRoot(project: string) {
  const root = resolve(project)
  try {
    return realpathSync.native(root)
  } catch {
    return root
  }
}

export function terminalWorkspaceStateDirectory(environment: NodeJS.ProcessEnv = process.env) {
  const dataHome = environment.XDG_DATA_HOME?.trim()
  const platformHome = process.platform === "win32" ? environment.LOCALAPPDATA?.trim() : undefined
  const base =
    (dataHome && isAbsolute(dataHome) ? dataHome : undefined) ??
    (platformHome && isAbsolute(platformHome) ? platformHome : undefined) ??
    join(homedir(), ".local", "share")
  return join(base, "tuiminal", "terminal")
}

export function terminalWorkspaceStatePath(
  project: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const root = workspaceRoot(project)
  const projectHash = createHash("sha256").update(root).digest("hex").slice(0, 24)
  return join(terminalWorkspaceStateDirectory(environment), projectHash, "workspace.json")
}

function normalizeAssignments(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const assignments: Record<string, string> = {}
  let count = 0
  for (const [key, folderId] of Object.entries(value)) {
    if (
      !key ||
      key.length > 2048 ||
      typeof folderId !== "string" ||
      !RESERVED_FOLDERS.has(folderId)
    )
      continue
    assignments[key] = folderId
    if (++count === MAX_ASSIGNMENTS) break
  }
  return assignments
}

function normalizeCollapsedFolderIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((id): id is string => typeof id === "string" && RESERVED_FOLDERS.has(id)),
    ),
  ]
}

export function parseTerminalWorkspaceState(
  source: string,
  project: string,
): TerminalWorkspaceState {
  const parsed = JSON.parse(source) as Partial<StoredTerminalWorkspaceState>
  if (parsed.version !== 1 || parsed.project !== workspaceRoot(project))
    return EMPTY_TERMINAL_WORKSPACE_STATE
  return {
    folders: [],
    assignments: normalizeAssignments(parsed.assignments),
    collapsedFolderIds: normalizeCollapsedFolderIds(parsed.collapsedFolderIds),
  }
}

export function loadTerminalWorkspaceState(
  project: string,
  environment: NodeJS.ProcessEnv = process.env,
): TerminalWorkspaceState {
  if (environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return EMPTY_TERMINAL_WORKSPACE_STATE
  try {
    return parseTerminalWorkspaceState(
      readFileSync(terminalWorkspaceStatePath(project, environment), "utf8"),
      project,
    )
  } catch {
    return EMPTY_TERMINAL_WORKSPACE_STATE
  }
}

function mergeTerminalWorkspaceState(
  current: TerminalWorkspaceState,
  next: TerminalWorkspaceState,
) {
  const assignmentEntries = new Map(Object.entries(current.assignments))
  for (const [key, folderId] of Object.entries(next.assignments)) {
    assignmentEntries.delete(key)
    assignmentEntries.set(key, folderId)
  }
  const assignments = normalizeAssignments(
    Object.fromEntries([...assignmentEntries].slice(-MAX_ASSIGNMENTS)),
  )
  const collapsedFolderIds = normalizeCollapsedFolderIds(next.collapsedFolderIds)
  return { folders: [], assignments, collapsedFolderIds }
}

export function saveTerminalWorkspaceState(
  project: string,
  state: TerminalWorkspaceState,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return state
  const path = terminalWorkspaceStatePath(project, environment)
  for (let attempt = 0; attempt < 2; attempt++) {
    const expectedHash = currentFileHash(path)
    const current = loadTerminalWorkspaceState(project, environment)
    const merged = mergeTerminalWorkspaceState(current, state)
    const stored: StoredTerminalWorkspaceState = {
      version: 1,
      project: workspaceRoot(project),
      ...merged,
    }
    try {
      atomicWriteFileSync(path, `${JSON.stringify(stored, null, 2)}\n`, {
        expectedHash,
        mode: 0o600,
      })
      return merged
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
  return state
}

export function terminalWorkspaceAssignmentKey(target: TmuxPaneTarget) {
  const ownedId = target.persistentId ?? target.windowName
  if (target.ownedByTuiminal && ownedId) return JSON.stringify(["owned", target.socket, ownedId])
  return JSON.stringify([
    "tmux",
    target.socket,
    target.sessionId,
    target.windowId ?? "",
    target.paneId,
  ])
}
