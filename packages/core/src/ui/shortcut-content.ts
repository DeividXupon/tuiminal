import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import { ACTION_KEY_COLOR, BRAND_COLOR } from "./brand"
import { type TextShimmerAnimation, textShimmerChunks } from "./text-shimmer"

const brandShortcutColor = RGBA.fromHex(BRAND_COLOR)
const actionShortcutColor = RGBA.fromHex(ACTION_KEY_COLOR)

/** `[?]` always opens actions or help; other action keys (the Master Key) are passed in. */
const ACTION_PALETTE_SHORTCUT = "[?]"

export type ShortcutAnimation = TextShimmerAnimation

function animatedShortcutChunks(
  content: string,
  color: RGBA,
  animation: ShortcutAnimation,
): TextChunk[] {
  return textShimmerChunks(content, color, animation)
}

function shortcutChunks(content: string, color: RGBA, animation?: ShortcutAnimation) {
  return animation
    ? animatedShortcutChunks(content, color, animation)
    : [{ __isChunk: true as const, text: content, fg: color }]
}

/**
 * Use only for UI hints; never apply to logs, commands, SQL or user data. With the default
 * hint color, `[?]` and any exact token in `actionKeys` (for example `[Ctrl+B]`) use the
 * action-key purple; an explicit caller color, such as a muted or disabled state, wins.
 */
export function shortcutContent(
  content: string,
  color = BRAND_COLOR,
  animation?: ShortcutAnimation,
  actionKeys: readonly string[] = [],
): string | StyledText {
  if (!content.includes("[")) return content
  const shortcutColor = color === BRAND_COLOR ? brandShortcutColor : RGBA.fromHex(color)
  const chunks: TextChunk[] = []
  let offset = 0
  // Also recognize the literal bracket keys: [[] and []].
  for (const match of content.matchAll(/\[(?:\[|\]|[^[\]\r\n]+)\]/g)) {
    if (match.index > offset) {
      chunks.push({ __isChunk: true, text: content.slice(offset, match.index) })
    }
    const directional = match[0].match(/^\[([AFZV])([←→])\]$/)
    if (directional) {
      chunks.push(...shortcutChunks(`[${directional[1]}`, shortcutColor, animation))
      chunks.push({ __isChunk: true, text: `${directional[2]}]` })
    } else {
      const actionKey =
        color === BRAND_COLOR &&
        (match[0] === ACTION_PALETTE_SHORTCUT || actionKeys.includes(match[0]))
      chunks.push(
        ...shortcutChunks(match[0], actionKey ? actionShortcutColor : shortcutColor, animation),
      )
    }
    offset = match.index + match[0].length
  }
  if (!chunks.length) return content
  if (offset < content.length) chunks.push({ __isChunk: true, text: content.slice(offset) })
  return new StyledText(chunks)
}
