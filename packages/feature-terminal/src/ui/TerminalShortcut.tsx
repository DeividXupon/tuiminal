import { RGBA, StyledText } from "@opentui/core"
import type { TextProps } from "@opentui/react"
import { useShortcutAnimation } from "@xupon/tuiminal-core/ui/ShortcutText"
import { textShimmerChunks } from "@xupon/tuiminal-core/ui/text-shimmer"
import { useMemo } from "react"

export { InlineButton as TerminalInlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
export {
  ShortcutAnimationBoundary as TerminalShortcutAnimation,
  ShortcutText as TerminalShortcutText,
} from "@xupon/tuiminal-core/ui/ShortcutText"
export {
  TEXT_SHIMMER_FRAME_COUNT as TERMINAL_SHORTCUT_FRAME_COUNT,
  TEXT_SHIMMER_FRAME_MS as TERMINAL_SHORTCUT_FRAME_MS,
} from "@xupon/tuiminal-core/ui/text-shimmer"

type TerminalShimmerTextProps = Omit<TextProps, "content" | "children"> & {
  content: string
  color: string
  active?: boolean
}

/** Full-label shimmer for fixed Terminal UI text; user data must not use this component. */
export function TerminalShimmerText({
  content,
  color,
  active = true,
  ...props
}: TerminalShimmerTextProps) {
  const animation = useShortcutAnimation(active)
  const styled = useMemo(
    () =>
      animation
        ? new StyledText(textShimmerChunks(content, RGBA.fromHex(color), animation))
        : content,
    [animation, color, content],
  )
  return <text {...props} content={styled} />
}
