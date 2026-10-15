import { CliRenderEvents, type ScrollBoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useEffect, useRef } from "react"
import { isRunningAgent, type TerminalSession } from "../model/sessions"

/** Reveal navigation after layout without resetting manual scrolling on status updates. */
export function useTerminalSidebarScroll({
  sessions,
  cursorId,
  folderId,
  activeSessionId,
  selectedFolder,
  height,
  collapsedFolderIds,
}: {
  sessions: readonly TerminalSession[]
  cursorId: string | null
  folderId: string | null
  activeSessionId: string | null
  selectedFolder: string
  height: number
  collapsedFolderIds: readonly string[]
}) {
  const cursor = sessions.find((session) => session.id === cursorId)
  const active = sessions.find((session) => session.id === activeSessionId)
  const target = folderId
    ? `terminal-sidebar-folder-${folderId}`
    : cursor && !isRunningAgent(cursor)
      ? `terminal-sidebar-pane-${cursor.id}`
      : !cursor && active && !isRunningAgent(active) && active.folderId === selectedFolder
        ? `terminal-sidebar-pane-${active.id}`
        : null
  const renderer = useRenderer()
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize and folder folding change native row geometry.
  useEffect(() => {
    if (!target) return
    const reveal = () => scroll.current?.scrollChildIntoView(target)
    reveal()
    renderer.once(CliRenderEvents.FRAME, reveal)
    return () => {
      renderer.off(CliRenderEvents.FRAME, reveal)
    }
  }, [renderer, target, height, collapsedFolderIds])
  return scroll
}
