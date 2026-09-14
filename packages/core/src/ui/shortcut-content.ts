import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import { BRAND_COLOR } from "./brand"

const shortcutColor = RGBA.fromHex(BRAND_COLOR)

/** Use only for UI hints; never apply to logs, commands, SQL or user data. */
export function shortcutContent(content: string): string | StyledText {
  if (!content.includes("[")) return content
  const chunks: TextChunk[] = []
  let offset = 0
  // Also recognize the literal bracket keys: [[] and []].
  for (const match of content.matchAll(/\[(?:\[|\]|[^[\]\r\n]+)\]/g)) {
    if (match.index > offset) {
      chunks.push({ __isChunk: true, text: content.slice(offset, match.index) })
    }
    const directional = match[0].match(/^\[([AFZV])([←→])\]$/)
    if (directional) {
      chunks.push({ __isChunk: true, text: `[${directional[1]}`, fg: shortcutColor })
      chunks.push({ __isChunk: true, text: `${directional[2]}]` })
    } else {
      chunks.push({ __isChunk: true, text: match[0], fg: shortcutColor })
    }
    offset = match.index + match[0].length
  }
  if (!chunks.length) return content
  if (offset < content.length) chunks.push({ __isChunk: true, text: content.slice(offset) })
  return new StyledText(chunks)
}
