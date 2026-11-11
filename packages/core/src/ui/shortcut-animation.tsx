import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from "react"
import { COLORS } from "../settings/theme"
import { TEXT_SHIMMER_FRAME_COUNT, TEXT_SHIMMER_FRAME_MS } from "./text-shimmer"
import { useWorkspaceVisibility } from "./workspace-repaint"

const ShortcutAnimationActive = createContext(true)
const listeners = new Set<() => void>()
let frame = 0
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  timer ??= setInterval(() => {
    frame = (frame + 1) % TEXT_SHIMMER_FRAME_COUNT
    for (const notify of listeners) notify()
  }, TEXT_SHIMMER_FRAME_MS)
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    clearInterval(timer)
    timer = undefined
    frame = 0
  }
}

const snapshot = () => frame
const inactiveSnapshot = () => null
const subscribeInactive = () => () => undefined

/** One shared clock, subscribed only by visible animated UI text. */
export function useShortcutAnimation(active = true) {
  const enabled = useContext(ShortcutAnimationActive)
  const visible = useWorkspaceVisibility()
  const animate = active && enabled && visible && process.env.TUIMINAL_TEST_STATIC_LOADERS !== "1"
  const current = useSyncExternalStore(
    animate ? subscribe : subscribeInactive,
    animate ? snapshot : inactiveSnapshot,
    inactiveSnapshot,
  )
  const shineColor = COLORS.text
  // biome-ignore lint/correctness/useExhaustiveDependencies: COLORS is mutated when the palette changes; retain the color captured by this render.
  return useMemo(
    () =>
      current === null
        ? undefined
        : { frame: current, frameCount: TEXT_SHIMMER_FRAME_COUNT, shineColor },
    [current, shineColor],
  )
}

export function ShortcutAnimationBoundary({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  const parentActive = useContext(ShortcutAnimationActive)
  return (
    <ShortcutAnimationActive value={parentActive && active}>{children}</ShortcutAnimationActive>
  )
}
