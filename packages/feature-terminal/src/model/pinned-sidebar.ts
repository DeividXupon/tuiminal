import type { TerminalFolder, TerminalSession } from "./sessions"

type PinnedTerminalMasterKey =
  | "Ctrl+B"
  | "Ctrl+A"
  | "Ctrl+Space"
  | "Ctrl+F"
  | "Ctrl+G"
  | "Ctrl+N"
  | "Ctrl+P"
  | "Ctrl+T"

export type PinnedTerminalTarget = {
  socket: string
  paneId: string
}

export type PinnedTerminalSelection =
  | PinnedTerminalTarget
  | { sessionId: string }
  | { folderId: string }
  | { action: string }

export type PinnedTerminalSidebarView = {
  sessions: TerminalSession[]
  folders: TerminalFolder[]
  selectedFolder: string
  activeSessionId: string | null
  width: number
  height: number
  masterKey: PinnedTerminalMasterKey
  onSelectFolder: (id: string) => void
  onActivate: (id: string) => void
  onActions: () => void
  onNew: () => void
  onFolder: () => void
}

export type PinnedTerminalSidebarReplica = Pick<
  PinnedTerminalSidebarView,
  "sessions" | "folders" | "selectedFolder" | "activeSessionId" | "masterKey"
> & { theme: Record<string, string>; language: string }

export type PinnedTerminalSidebarSnapshot = {
  pinned: boolean
  view: PinnedTerminalSidebarView | null
  requestedTarget: PinnedTerminalSelection | null
  requestRevision: number
  focusRevision: number
  tmuxHostSidebar: boolean
}

let snapshot: PinnedTerminalSidebarSnapshot = {
  pinned: false,
  view: null,
  requestedTarget: null,
  requestRevision: 0,
  focusRevision: 0,
  tmuxHostSidebar: false,
}
let viewOwner: object | null = null
const listeners = new Set<() => void>()

function publish(next: PinnedTerminalSidebarSnapshot) {
  if (Object.is(next, snapshot)) return
  snapshot = next
  for (const listener of listeners) listener()
}

export function terminalSidebarSnapshot() {
  return snapshot
}

export function terminalSidebarPinnedSnapshot() {
  return snapshot.pinned
}

export function terminalSidebarRequestRevision() {
  return snapshot.requestRevision
}

export function terminalSidebarFocusRevision() {
  return snapshot.focusRevision
}

export function subscribeTerminalSidebar(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setTerminalSidebarPinned(pinned: boolean) {
  if (snapshot.pinned !== pinned) publish({ ...snapshot, pinned })
}

export function toggleTerminalSidebarPinned() {
  setTerminalSidebarPinned(!snapshot.pinned)
}

export function setTmuxHostSidebar(active: boolean) {
  if (snapshot.tmuxHostSidebar !== active) publish({ ...snapshot, tmuxHostSidebar: active })
}

export function publishTerminalSidebar(owner: object, view: PinnedTerminalSidebarView) {
  viewOwner = owner
  publish({ ...snapshot, view })
}

export function clearTerminalSidebar(owner: object) {
  if (viewOwner !== owner) return
  viewOwner = null
  publish({ ...snapshot, view: null })
}

export function requestPinnedTerminalTarget(target: PinnedTerminalSelection) {
  publish({
    ...snapshot,
    requestedTarget: target,
    requestRevision: snapshot.requestRevision + 1,
  })
}

export function requestTerminalSidebarFocus() {
  publish({ ...snapshot, focusRevision: snapshot.focusRevision + 1 })
}

export function terminalSidebarReplica(
  theme: Record<string, string> = {},
  language = "pt-BR",
): PinnedTerminalSidebarReplica | null {
  const view = snapshot.view
  if (!view) return null
  return {
    sessions: view.sessions,
    folders: view.folders,
    selectedFolder: view.selectedFolder,
    activeSessionId: view.activeSessionId,
    masterKey: view.masterKey,
    theme,
    language,
  }
}

export function resetPinnedTerminalSidebarForTests() {
  viewOwner = null
  publish({
    pinned: false,
    view: null,
    requestedTarget: null,
    requestRevision: 0,
    focusRevision: 0,
    tmuxHostSidebar: false,
  })
}
