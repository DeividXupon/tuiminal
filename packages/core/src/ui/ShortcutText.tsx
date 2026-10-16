import type { TextProps } from "@opentui/react"
import { useMemo } from "react"
import { translateUi } from "../i18n/index"
import { type ShortcutAnimation, shortcutContent } from "./shortcut-content"

type ShortcutTextProps = Omit<TextProps, "content" | "children"> & {
  content: string
  highlight?: boolean
  shortcutColor?: string | undefined
  shortcutAnimation?: ShortcutAnimation | undefined
  /** Exact bracket tokens drawn in the action-key purple, such as the Master Key. */
  actionKeys?: readonly string[] | undefined
}

/** One native text node: keeps hit areas, wrapping and inherited label colors. */
export function ShortcutText({
  content,
  highlight = true,
  shortcutColor,
  shortcutAnimation,
  actionKeys,
  ...props
}: ShortcutTextProps) {
  const translated = translateUi(content)
  // Keyed by content so a new array literal for the same keys does not restyle the text.
  const actionKeyList = actionKeys?.join("\0") ?? ""
  const styled = useMemo(() => {
    const keys = actionKeyList ? actionKeyList.split("\0") : []
    return shortcutColor !== undefined
      ? shortcutContent(translated, shortcutColor, shortcutAnimation, keys)
      : highlight
        ? shortcutContent(translated, undefined, shortcutAnimation, keys)
        : translated
  }, [translated, highlight, shortcutColor, shortcutAnimation, actionKeyList])
  return <text {...props} content={styled} />
}
