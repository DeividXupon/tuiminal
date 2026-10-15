import { CliRenderEvents, type ScrollBoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { type RefObject, useEffect } from "react"

/** Follow selection after layout; leave manual scrolling alone until selection changes. */
export function useActivitySelection(
  scroll: RefObject<ScrollBoxRenderable | null>,
  selection: string | null,
  page: string | undefined,
) {
  const renderer = useRenderer()
  useEffect(() => {
    if (!selection || !page) return
    const reveal = () => scroll.current?.scrollChildIntoView(selection)
    renderer.once(CliRenderEvents.FRAME, reveal)
    return () => {
      renderer.off(CliRenderEvents.FRAME, reveal)
    }
  }, [page, renderer, scroll, selection])
}
