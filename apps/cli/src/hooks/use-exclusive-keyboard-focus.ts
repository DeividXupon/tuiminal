import type { Renderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useLayoutEffect } from "react"

/** Release native input handlers even when a roving control stopped being focusable. */
export function useExclusiveKeyboardFocus() {
  const renderer = useRenderer()
  useLayoutEffect(() => {
    const releasePrevious = (current: Renderable | null, previous: Renderable | null) => {
      if (!current || !previous || current === previous || !previous.focused || previous.focusable)
        return
      // OpenTUI 0.5.9 blur() skips non-focusable nodes. Tuiparts can remove a
      // tab's focusability before transferring focus, leaving its native key
      // and paste handlers attached. Temporarily allow the normal blur cleanup.
      const focusable = previous.focusable
      previous.focusable = true
      try {
        previous.blur()
      } finally {
        previous.focusable = focusable
      }
    }
    renderer.on("focused_renderable", releasePrevious)
    return () => {
      renderer.off("focused_renderable", releasePrevious)
    }
  }, [renderer])
}
