import { useCallback, useEffect, useRef, useState } from "react"
import {
  DEFAULT_FOLDER,
  DEFAULT_FOLDER_NAME,
  EXTERNAL_FOLDER,
  EXTERNAL_FOLDER_NAME,
  type TerminalFolder,
  type TerminalSession,
} from "../model/sessions"
import { type TmuxPaneInfo, TUIMINAL_TMUX_FOLDER } from "../model/tmux"
import { TERM_AGENTS_WORKING_DIRECTORY } from "../services/terminal"
import {
  loadTerminalWorkspaceState,
  saveTerminalWorkspaceState,
  type TerminalWorkspaceState,
  terminalWorkspaceAssignmentKey,
} from "../services/terminal-workspace-state"

const RESERVED_TERMINAL_FOLDERS: TerminalFolder[] = [
  { id: DEFAULT_FOLDER, name: DEFAULT_FOLDER_NAME },
  { id: TUIMINAL_TMUX_FOLDER, name: "tmux" },
  { id: EXTERNAL_FOLDER, name: EXTERNAL_FOLDER_NAME },
]

export function useTerminalFolders(sessions: readonly TerminalSession[]) {
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
  const folderForTmuxPane = useCallback((pane: TmuxPaneInfo) => {
    const defaultFolder = pane.ownedByTuiminal ? DEFAULT_FOLDER : TUIMINAL_TMUX_FOLDER
    const savedFolder = workspaceStateRef.current.assignments[terminalWorkspaceAssignmentKey(pane)]
    return savedFolder && RESERVED_TERMINAL_FOLDERS.some((folder) => folder.id === savedFolder)
      ? savedFolder
      : defaultFolder
  }, [])
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
  return {
    folders,
    collapsedFolderIds,
    selectedFolder,
    setSelectedFolder,
    toggleFolder,
    folderForTmuxPane,
  }
}
