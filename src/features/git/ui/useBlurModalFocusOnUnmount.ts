import type { BoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useEffect, type RefObject } from "react"

export function useBlurModalFocusOnUnmount(dialogRef: RefObject<BoxRenderable | null>) {
  const renderer = useRenderer()
  useEffect(
    () => () => {
      for (let focused = renderer.currentFocusedRenderable; focused; focused = focused.parent) {
        if (focused !== dialogRef.current) continue
        renderer.currentFocusedRenderable?.blur()
        break
      }
    },
    [dialogRef, renderer],
  )
}
