import type { TextProps } from "@opentui/react"
import { useMemo } from "react"
import { translateUi } from "../i18n/index"
import { shortcutContent } from "./shortcut-content"

type ShortcutTextProps = Omit<TextProps, "content" | "children"> & {
  content: string
  highlight?: boolean
}

/** One native text node: keeps hit areas, wrapping and inherited label colors. */
export function ShortcutText({ content, highlight = true, ...props }: ShortcutTextProps) {
  const translated = translateUi(content)
  const styled = useMemo(
    () => (highlight ? shortcutContent(translated) : translated),
    [translated, highlight],
  )
  return <text {...props} content={styled} />
}
