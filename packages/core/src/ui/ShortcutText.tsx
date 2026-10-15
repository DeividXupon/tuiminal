import type { TextProps } from "@opentui/react"
import { useMemo } from "react"
import { translateUi } from "../i18n/index"
import { type ShortcutAnimation, shortcutContent } from "./shortcut-content"

type ShortcutTextProps = Omit<TextProps, "content" | "children"> & {
  content: string
  highlight?: boolean
  shortcutColor?: string | undefined
  shortcutAnimation?: ShortcutAnimation | undefined
}

/** One native text node: keeps hit areas, wrapping and inherited label colors. */
export function ShortcutText({
  content,
  highlight = true,
  shortcutColor,
  shortcutAnimation,
  ...props
}: ShortcutTextProps) {
  const translated = translateUi(content)
  const styled = useMemo(
    () =>
      shortcutColor !== undefined
        ? shortcutContent(translated, shortcutColor, shortcutAnimation)
        : highlight
          ? shortcutContent(translated, undefined, shortcutAnimation)
          : translated,
    [translated, highlight, shortcutColor, shortcutAnimation],
  )
  return <text {...props} content={styled} />
}
