import {
  type BoxRenderable,
  type CliRenderer,
  RenderableEvents,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { useCallback, useEffect, useEffectEvent, useRef } from "react"
import { useRenderer } from "@opentui/react"
import type { GitFocusPane, NarrowGitPane, ViewMode } from "../model/view"
import { scrollGitDiffHorizontally } from "../rendering/diff-scroll"
import { gitFileTreeRowId } from "../ui/base/GitFileTree"

/** Pane chrome must release the command input without overriding a clicked control. */
export function focusGitPaneFromMouse(renderer: CliRenderer, targetId: string) {
  const focused = renderer.currentFocusedRenderable
  if (focused?.id !== "git-command-input") return
  focused.blur()
  renderer.root.findDescendantById(targetId)?.focus()
}

export function useGitDiffAutoFocus(
  enabled: boolean,
  documentCount: number,
  focusDiff: () => void,
  blocked: boolean,
) {
  const focusIfAvailable = useEffectEvent(() => {
    if (!blocked) focusDiff()
  })
  useEffect(() => {
    if (!enabled || !documentCount) return
    const timeout = setTimeout(focusIfAvailable, 0)
    return () => clearTimeout(timeout)
  }, [documentCount, enabled])
}

export function useGitPaneFocus({
  view,
  narrowGit,
  selectedTreeIndex,
  setFocusedPane,
  setNarrowPane,
  focusDiff,
  focusHistory,
}: {
  view: ViewMode
  narrowGit: boolean
  selectedTreeIndex: number
  setFocusedPane: (pane: GitFocusPane) => void
  setNarrowPane: (pane: NarrowGitPane) => void
  focusDiff: () => void
  focusHistory: () => void
}) {
  const renderer = useRenderer()
  return useCallback(
    (pane: GitFocusPane) => {
      setFocusedPane(pane)
      if (narrowGit) setNarrowPane(pane === "files" ? "files" : "preview")
      setTimeout(() => {
        if (pane === "files") {
          renderer.root
            .findDescendantById(gitFileTreeRowId("git-file-list", selectedTreeIndex))
            ?.focus()
        } else if (pane === "preview") {
          if (view === "log" || view === "graph") focusHistory()
          else focusDiff()
        } else {
          renderer.root.findDescendantById("git-command-input")?.focus()
          return
        }
        // Empty panes must still release the input's keyboard ownership.
        const focused = renderer.currentFocusedRenderable
        if (focused?.id === "git-command-input") focused.blur()
      }, 0)
    },
    [
      focusDiff,
      focusHistory,
      narrowGit,
      renderer,
      selectedTreeIndex,
      setFocusedPane,
      setNarrowPane,
      view,
    ],
  )
}

function replaceFocusListener<T extends BoxRenderable | ScrollBoxRenderable>(
  ref: { current: T | null },
  next: T | null,
  onFocus: () => void,
) {
  if (ref.current === next) return
  ref.current?.off(RenderableEvents.FOCUSED, onFocus)
  ref.current = next
  next?.on(RenderableEvents.FOCUSED, onFocus)
}

export function useGitPreviewFocus(onFocus: () => void) {
  const diffScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const historyPanelRef = useRef<BoxRenderable | null>(null)
  const setDiffScrollRef = useCallback(
    (next: ScrollBoxRenderable | null) => replaceFocusListener(diffScrollRef, next, onFocus),
    [onFocus],
  )
  const setHistoryPanelRef = useCallback(
    (next: BoxRenderable | null) => replaceFocusListener(historyPanelRef, next, onFocus),
    [onFocus],
  )
  const focusDiff = useCallback(() => diffScrollRef.current?.focus(), [])
  const focusHistory = useCallback(() => historyPanelRef.current?.focus(), [])
  const scrollDiff = useCallback((offset: number) => {
    const scrollbox = diffScrollRef.current
    if (scrollbox) scrollbox.scrollTo({ x: scrollbox.scrollLeft, y: offset })
  }, [])
  const scrollDiffHorizontally = useCallback((delta: number) => {
    scrollGitDiffHorizontally(diffScrollRef.current, delta)
  }, [])
  return {
    setDiffScrollRef,
    setHistoryPanelRef,
    focusDiff,
    focusHistory,
    scrollDiff,
    scrollDiffHorizontally,
  }
}
