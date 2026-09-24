import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import { BRAND_COLOR } from "./brand"
import { blendTextColor, type TextShimmerAnimation, textShimmerIntensity } from "./text-shimmer"

const brandShortcutColor = RGBA.fromHex(BRAND_COLOR)
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

export type ShortcutAnimation = TextShimmerAnimation

function animatedShortcutChunks(
  content: string,
  color: RGBA,
  animation: ShortcutAnimation,
): TextChunk[] {
  const segments = [...graphemes.segment(content)].map(({ segment }) => segment)
  const shine = RGBA.fromHex(animation.shineColor)
  return segments.map((text, index) => ({
    __isChunk: true,
    text,
    fg: blendTextColor(color, shine, textShimmerIntensity(index, segments.length, animation)),
  }))
}

function shortcutChunks(content: string, color: RGBA, animation?: ShortcutAnimation) {
  return animation
    ? animatedShortcutChunks(content, color, animation)
    : [{ __isChunk: true as const, text: content, fg: color }]
}

/** Use only for UI hints; never apply to logs, commands, SQL or user data. */
export function shortcutContent(
  content: string,
  color = BRAND_COLOR,
  animation?: ShortcutAnimation,
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
      chunks.push(...shortcutChunks(match[0], shortcutColor, animation))
    }
    offset = match.index + match[0].length
  }
  if (!chunks.length) return content
  if (offset < content.length) chunks.push({ __isChunk: true, text: content.slice(offset) })
  return new StyledText(chunks)
}
