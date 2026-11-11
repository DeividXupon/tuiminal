import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import { COLORS } from "../settings/theme"
import { ACTION_KEY_COLOR, BRAND_COLOR } from "./brand"
import { type TextShimmerAnimation, textShimmerChunks } from "./text-shimmer"

const shortcutColor = RGBA.fromHex(BRAND_COLOR)
const actionShortcutColor = RGBA.fromHex(ACTION_KEY_COLOR)
export type ShortcutAnimation = TextShimmerAnimation

/** UI hints only: logs, code and user data must never pass through this formatter.
 * [?] and explicit action keys use purple; other keys use blue, with a traveling highlight.
 */
export function shortcutContent(
  content: string,
  _color?: string,
  animation?: ShortcutAnimation,
  actionKeys: readonly string[] = [],
  muted = false,
  baseColor?: string,
): string | StyledText {
  if (!content.includes("[")) return content
  const mutedColor = muted ? RGBA.fromHex(COLORS.muted) : undefined
  const base = baseColor === undefined ? shortcutColor : RGBA.fromHex(baseColor)
  const chunks: TextChunk[] = []
  let offset = 0
  // Also recognize the literal bracket keys: [[] and []].
  for (const match of content.matchAll(/\[(?:\[|\]|[^[\]\r\n]+)\]/g)) {
    if (match.index > offset)
      chunks.push({ __isChunk: true, text: content.slice(offset, match.index) })
    const color =
      mutedColor ??
      (match[0] === "[?]" || actionKeys.includes(match[0]) ? actionShortcutColor : base)
    if (animation && !muted) chunks.push(...textShimmerChunks(match[0], color, animation))
    else chunks.push({ __isChunk: true, text: match[0], fg: color })
    offset = match.index + match[0].length
  }
  if (!chunks.length) return content
  if (offset < content.length) chunks.push({ __isChunk: true, text: content.slice(offset) })
  return new StyledText(chunks)
}
