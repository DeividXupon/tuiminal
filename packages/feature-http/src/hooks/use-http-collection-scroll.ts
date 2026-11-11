import { CliRenderEvents, type ScrollBoxRenderable } from "@opentui/core"
import { useEffect } from "react"
import { useRenderer } from "@opentui/react"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import { collectionFocusIndex } from "../ui/HttpCollectionDraft"
import type { HttpCollectionAction } from "./use-http-collection-management"

export function useHttpCollectionScroll({
  scrollRef,
  pending,
  rows,
  selection,
  destination,
  inlineCollection,
  workspaceSelected,
}: {
  scrollRef: { current: ScrollBoxRenderable | null }
  pending: { action: HttpCollectionAction; row: HttpCollectionTreeRow | null } | null
  rows: HttpCollectionTreeRow[]
  selection: string | null
  destination: "postman" | "tuiminal"
  inlineCollection: boolean
  workspaceSelected: boolean
}) {
  const renderer = useRenderer()
  useEffect(() => {
    if (!pending || pending.action === "delete") return
    const reveal = () => {
      const scroll = scrollRef.current
      const input = scroll?.findDescendantById("http-collection-name-input")
      if (!scroll || !input?.focused || !input.width) return
      const top = scroll.viewport.screenY
      const bottom = top + scroll.viewport.height
      if (input.screenY < top) scroll.scrollBy(input.screenY - top)
      else if (input.screenY + input.height > bottom)
        scroll.scrollBy(input.screenY + input.height - bottom)
    }
    renderer.on(CliRenderEvents.FRAME, reveal)
    return () => {
      renderer.off(CliRenderEvents.FRAME, reveal)
    }
  }, [pending, renderer, scrollRef])
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    if (workspaceSelected || inlineCollection) {
      scroll.scrollTo(0)
      return
    }
    const index = collectionFocusIndex(pending, rows, selection)
    if (index < 0) return
    const formLines = collectionFormLines(pending?.action, destination, inlineCollection)
    const line = 3 + formLines + index
    const visible = Math.max(1, scroll.viewport.height)
    if (line < scroll.scrollTop) scroll.scrollTo(line)
    else if (line >= scroll.scrollTop + visible) scroll.scrollTo(line - visible + 1)
  }, [destination, pending, rows, scrollRef, selection, inlineCollection, workspaceSelected])
}

function collectionFormLines(
  action: HttpCollectionAction | undefined,
  destination: "postman" | "tuiminal",
  inline: boolean,
) {
  if (action === "create-collection" && !inline) return destination === "postman" ? 5 : 4
  return 0
}
