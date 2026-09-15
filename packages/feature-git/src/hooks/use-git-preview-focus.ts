import { type BoxRenderable, RenderableEvents, type ScrollBoxRenderable } from "@opentui/core"
import { useCallback, useRef } from "react"
import { scrollGitDiffHorizontally } from "../rendering/diff-scroll"

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
