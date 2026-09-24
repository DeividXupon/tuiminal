import { type Renderable, RenderableEvents } from "@opentui/core"
import { type RefObject, useCallback, useSyncExternalStore } from "react"

/** Keeps shortcut affordances synchronized with the renderable that owns keyboard input. */
export function useRenderableFocus<T extends Renderable>(ref: RefObject<T | null>) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const renderable = ref.current
      if (!renderable) return () => undefined
      renderable.on(RenderableEvents.FOCUSED, notify)
      renderable.on(RenderableEvents.BLURRED, notify)
      return () => {
        renderable.off(RenderableEvents.FOCUSED, notify)
        renderable.off(RenderableEvents.BLURRED, notify)
      }
    },
    [ref],
  )
  const focused = useCallback(() => Boolean(ref.current?.focused), [ref])
  return useSyncExternalStore(subscribe, focused, focused)
}
