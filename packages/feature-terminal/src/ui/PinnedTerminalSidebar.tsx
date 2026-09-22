import { useEffect, useRef, useSyncExternalStore } from "react"
import { subscribeTerminalSidebar, terminalSidebarSnapshot } from "../model/pinned-sidebar"
import { TerminalSidebar } from "./TerminalSidebar"

export function PinnedTerminalSidebar({
  active = true,
  height,
  onOpenTerminal,
}: {
  active?: boolean
  height: number
  onOpenTerminal: () => void
}) {
  const snapshot = useSyncExternalStore(
    subscribeTerminalSidebar,
    terminalSidebarSnapshot,
    terminalSidebarSnapshot,
  )
  const openedRevision = useRef(snapshot.requestRevision)
  useEffect(() => {
    if (snapshot.requestRevision === openedRevision.current) return
    openedRevision.current = snapshot.requestRevision
    onOpenTerminal()
  }, [snapshot.requestRevision, onOpenTerminal])
  const view = snapshot.view
  if (!snapshot.pinned || snapshot.tmuxHostSidebar || !view) return null
  const open = (action: () => void) => {
    onOpenTerminal()
    action()
  }
  return (
    <TerminalSidebar
      active={active}
      sessions={view.sessions}
      folders={view.folders}
      collapsedFolderIds={view.collapsedFolderIds}
      selectedFolder={view.selectedFolder}
      activeSessionId={view.activeSessionId}
      width={view.width}
      height={height}
      masterKey={view.masterKey}
      focusRequest={snapshot.focusRevision}
      onSelectFolder={(id) => open(() => view.onSelectFolder(id))}
      onToggleFolder={(id) => open(() => view.onToggleFolder(id))}
      onActivate={(id) => open(() => view.onActivate(id))}
      onActions={() => open(view.onActions)}
      onMasterKey={() => open(view.onActions)}
      onNew={() => open(view.onNew)}
    />
  )
}
