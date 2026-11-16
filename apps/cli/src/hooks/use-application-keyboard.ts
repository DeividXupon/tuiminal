import type { KeyEvent } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useEffect, useEffectEvent } from "react"

/** Resolve global ownership before feature handlers can change focus or consume the key. */
export function useApplicationKeyboard(handler: (key: KeyEvent) => void) {
  const renderer = useRenderer()
  const onKey = useEffectEvent(handler)
  useEffect(() => {
    renderer.keyInput.prependListener("keypress", onKey)
    return () => {
      renderer.keyInput.off("keypress", onKey)
    }
  }, [renderer])
}
