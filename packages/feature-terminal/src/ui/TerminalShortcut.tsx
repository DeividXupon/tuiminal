import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton, type InlineButtonProps } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  TERMINAL_SHIMMER_FRAME_COUNT,
  TERMINAL_SHIMMER_FRAME_MS,
} from "../rendering/terminal-shimmer"

export const TERMINAL_SHORTCUT_FRAME_MS = TERMINAL_SHIMMER_FRAME_MS
export const TERMINAL_SHORTCUT_FRAME_COUNT = TERMINAL_SHIMMER_FRAME_COUNT

const TerminalShortcutFrame = createContext<number | null>(null)

export function TerminalShortcutAnimation({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  const [frame, setFrame] = useState<number | null>(null)
  const staticLoaders = process.env.TUIMINAL_TEST_STATIC_LOADERS === "1"
  useEffect(() => {
    if (!active || staticLoaders) {
      setFrame(null)
      return
    }
    setFrame(0)
    const timer = setInterval(
      () => setFrame((current) => ((current ?? 0) + 1) % TERMINAL_SHORTCUT_FRAME_COUNT),
      TERMINAL_SHORTCUT_FRAME_MS,
    )
    return () => clearInterval(timer)
  }, [active, staticLoaders])
  return <TerminalShortcutFrame value={frame}>{children}</TerminalShortcutFrame>
}

function useShortcutAnimation(shortcutColor: string | undefined) {
  const frame = useContext(TerminalShortcutFrame)
  return useMemo(
    () =>
      frame !== null && (shortcutColor === undefined || shortcutColor === BRAND_COLOR)
        ? {
            frame,
            frameCount: TERMINAL_SHORTCUT_FRAME_COUNT,
            shineColor: COLORS.text,
          }
        : undefined,
    [frame, shortcutColor],
  )
}

type TerminalShortcutTextProps = ComponentProps<typeof ShortcutText>

export function TerminalShortcutText({ shortcutColor, ...props }: TerminalShortcutTextProps) {
  return (
    <ShortcutText
      {...props}
      shortcutColor={shortcutColor}
      shortcutAnimation={useShortcutAnimation(shortcutColor)}
    />
  )
}

export function TerminalInlineButton({ shortcutColor, ...props }: InlineButtonProps) {
  return (
    <InlineButton
      {...props}
      shortcutColor={shortcutColor}
      shortcutAnimation={useShortcutAnimation(shortcutColor)}
    />
  )
}
