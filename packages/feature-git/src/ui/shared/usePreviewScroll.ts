import type { ScrollBoxRenderable } from "@opentui/core"
import { type RefObject, useEffect, useRef } from "react"

/** Keyboard paging starts at the viewport reached by selection or mouse scrolling. */
export function usePreviewScroll(
  scroll: RefObject<ScrollBoxRenderable | null>,
  offset: number,
  page: string,
) {
  const previous = useRef({ page, offset: 0 })
  useEffect(() => {
    if (previous.current.page === page) scroll.current?.scrollBy(offset - previous.current.offset)
    else scroll.current?.scrollTo({ x: 0, y: offset })
    previous.current = { page, offset }
  }, [offset, page, scroll])
}
