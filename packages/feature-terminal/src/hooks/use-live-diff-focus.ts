import type { BoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"

export function useLiveDiffFocus(panel: { current: BoxRenderable | null }, focusRequest: number) {
  const previous = useRef(0)
  useEffect(() => {
    if (focusRequest === previous.current) return
    previous.current = focusRequest
    queueMicrotask(() => panel.current?.focus())
  }, [focusRequest, panel])
}
