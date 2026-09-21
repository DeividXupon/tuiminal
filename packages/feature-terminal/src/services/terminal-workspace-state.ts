import { createHash } from "node:crypto"
import { readFileSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { atomicWriteFileSync, currentFileHash } from "@xupon/tuiminal-core/storage/atomic-file"
import {
  DEFAULT_FOLDER,
  EXTERNAL_FOLDER,
  cleanTerminalName,
  type TerminalFolder,
} from "../model/sessions"
import { TUIMINAL_TMUX_FOLDER, type TmuxPaneTarget } from "../model/tmux"

const MAX_CUSTOM_FOLDERS = 64
const MAX_ASSIGNMENTS = 512
const RESERVED_FOLDERS = new Set([DEFAULT_FOLDER, TUIMINAL_TMUX_FOLDER, EXTERNAL_FOLDER])

export type TerminalWorkspaceState = {
  folders: TerminalFolder[]
  assignments: Record<string, string>
}

type StoredTerminalWorkspaceState = TerminalWorkspaceState & {
  version: 1
  project: string
}

export const EMPTY_TERMINAL_WORKSPACE_STATE: TerminalWorkspaceState = {
  folders: [],
  assignments: {},
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

function normalizeFolders(value: unknown) {
  if (!Array.isArray(value)) return []
  const folders = new Map<string, TerminalFolder>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue
    const { id, name } = candidate as Record<string, unknown>
    if (
      typeof id !== "string" ||
      !/^folder-[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      RESERVED_FOLDERS.has(id) ||
      typeof name !== "string"
    )
      continue
    const cleanName = cleanTerminalName(name)
    if (
      !cleanName ||
      [...folders.values()].some(
        (folder) => folder.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase(),
      )
    )
      continue
    folders.set(id, { id, name: cleanName })
    if (folders.size === MAX_CUSTOM_FOLDERS) break
  }
  return [...folders.values()]
}

function normalizeAssignments(value: unknown, folders: readonly TerminalFolder[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const knownFolders = new Set([DEFAULT_FOLDER, ...folders.map((folder) => folder.id)])
  const assignments: Record<string, string> = {}
  let count = 0
  for (const [key, folderId] of Object.entries(value)) {
    if (!key || key.length > 2048 || typeof folderId !== "string" || !knownFolders.has(folderId))
      continue
    assignments[key] = folderId
    if (++count === MAX_ASSIGNMENTS) break
  }
  return assignments
}

export function parseTerminalWorkspaceState(
  source: string,
  project: string,
): TerminalWorkspaceState {
  const parsed = JSON.parse(source) as Partial<StoredTerminalWorkspaceState>
  if (parsed.version !== 1 || parsed.project !== workspaceRoot(project))
    return EMPTY_TERMINAL_WORKSPACE_STATE
  const folders = normalizeFolders(parsed.folders)
  return { folders, assignments: normalizeAssignments(parsed.assignments, folders) }
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
  const folderEntries = new Map(current.folders.map((folder) => [folder.id, folder]))
  for (const folder of next.folders) {
    folderEntries.delete(folder.id)
    folderEntries.set(folder.id, folder)
  }
  const folders = normalizeFolders([...folderEntries.values()].slice(-MAX_CUSTOM_FOLDERS))
  const assignmentEntries = new Map(Object.entries(current.assignments))
  for (const [key, folderId] of Object.entries(next.assignments)) {
    assignmentEntries.delete(key)
    assignmentEntries.set(key, folderId)
  }
  const assignments = normalizeAssignments(
    Object.fromEntries([...assignmentEntries].slice(-MAX_ASSIGNMENTS)),
    folders,
  )
  return { folders, assignments }
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
