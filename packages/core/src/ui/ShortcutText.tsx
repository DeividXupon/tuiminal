import type { TextProps } from "@opentui/react"
import { useMemo } from "react"
import { translateUi } from "../i18n/index"
import { useShortcutAnimation } from "./shortcut-animation"
import { type ShortcutAnimation, shortcutContent } from "./shortcut-content"

export { ShortcutAnimationBoundary, useShortcutAnimation } from "./shortcut-animation"

type ShortcutTextProps = Omit<TextProps, "content" | "children"> & {
  content: string
  highlight?: boolean
  shortcutsMuted?: boolean | undefined
  shortcutColor?: string | undefined
  /** Explicit semantic exception, such as red tab-close shortcuts. */
  shortcutBaseColor?: string | undefined
  shortcutAnimation?: ShortcutAnimation | undefined
  /** Exact bracketed action keys to highlight in purple, such as the Terminal Master Key. */
  actionKeys?: readonly string[] | undefined
}

/** One native text node: keeps hit areas, wrapping and inherited label colors. */
export function ShortcutText({
  content,
  highlight = true,
  shortcutsMuted = false,
  shortcutColor,
  shortcutBaseColor,
  shortcutAnimation,
  actionKeys,
  ...props
}: ShortcutTextProps) {
  const translated = translateUi(content)
  const defaultAnimation = useShortcutAnimation(
    !shortcutsMuted &&
      shortcutAnimation === undefined &&
      (highlight || shortcutColor !== undefined) &&
      translated.includes("["),
  )
  const animation = shortcutAnimation ?? defaultAnimation
  // Keyed by content so a new array literal for the same keys does not restyle the text.
  const actionKeyList = actionKeys?.join("\0") ?? ""
  const styled = useMemo(() => {
    const keys = actionKeyList ? actionKeyList.split("\0") : []
    return shortcutColor !== undefined
      ? shortcutContent(
          translated,
          shortcutColor,
          animation,
          keys,
          shortcutsMuted,
          shortcutBaseColor,
        )
      : highlight
        ? shortcutContent(translated, undefined, animation, keys, shortcutsMuted, shortcutBaseColor)
        : translated
  }, [
    translated,
    highlight,
    shortcutColor,
    shortcutBaseColor,
    animation,
    actionKeyList,
    shortcutsMuted,
  ])
  return <text {...props} content={styled} />
}
