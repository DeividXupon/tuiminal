import { type InputRenderable, RenderableEvents } from "@opentui/core"
import { useCallback, useRef, useState } from "react"

/**
 * Owns focus for the conditionally mounted log filter. Opening focuses the input
 * once it mounts, and `focused` keeps footer hints in sync with typed keys.
 */
export function useRunnerLogFilter(setOpen: (open: boolean) => void) {
  const inputRef = useRef<InputRenderable | null>(null)
  const focusOnMount = useRef(false)
  const [focused, setFocused] = useState(false)

  const attach = useCallback((input: InputRenderable | null) => {
    inputRef.current = input
    if (!input) return
    const update = () => setFocused(input.focused)
    input.on(RenderableEvents.FOCUSED, update)
    input.on(RenderableEvents.BLURRED, update)
    if (focusOnMount.current) {
      focusOnMount.current = false
      input.focus()
    }
    update()
    return () => {
      input.off(RenderableEvents.FOCUSED, update)
      input.off(RenderableEvents.BLURRED, update)
      if (inputRef.current === input) inputRef.current = null
    }
  }, [])

  const open = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      return
    }
    focusOnMount.current = true
    setOpen(true)
  }, [setOpen])

  return { inputRef, attach, focused, open }
}
