import { CliRenderEvents, type ScrollBoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { type RefObject, useEffect, useRef } from "react"

/** Load the next detail page when navigation or scrolling reaches the current page's end. */
export function usePreviewPagination({
  scroll,
  pageKey,
  enabled,
  loading,
  selectedIndex,
  itemCount,
  onLoadMore,
}: {
  scroll: RefObject<ScrollBoxRenderable | null>
  /** Item identity, tab, connection and cursor; null when there are no more pages. */
  pageKey: string | null
  enabled: boolean
  loading: boolean
  selectedIndex: number
  itemCount: number
  onLoadMore: () => void
}) {
  const renderer = useRenderer()
  const attempted = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || loading || !pageKey) return
    let disposed = false
    let queued = false
    const check = () => {
      const view = scroll.current
      if (!view || view.viewport.height <= 0) return
      const lastItem = itemCount > 0 && selectedIndex >= itemCount - 1
      const bottom = view.scrollTop + view.viewport.height >= view.scrollHeight
      if (!lastItem && !bottom) {
        attempted.current = null
        return
      }
      if (queued || attempted.current === pageKey) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if (disposed) return
        attempted.current = pageKey
        onLoadMore()
      })
    }
    renderer.on(CliRenderEvents.FRAME, check)
    return () => {
      disposed = true
      renderer.off(CliRenderEvents.FRAME, check)
    }
  }, [enabled, itemCount, loading, onLoadMore, pageKey, renderer, scroll, selectedIndex])
}
