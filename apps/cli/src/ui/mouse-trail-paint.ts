import { type OptimizedBuffer, RGBA, TextAttributes } from "@opentui/core"
import type { TrailCell } from "./mouse-trail"

export type MousePoint = { x: number; y: number }

/** A filled cell cursor, preserving the native glyph and its full display width. */
export function paintMouseBlock(buffer: OptimizedBuffer, point: MousePoint, color: RGBA) {
  const { x, y } = point
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return
  const { char, fg, bg, attributes } = buffer.buffers
  const rowStart = y * buffer.width
  let start = rowStart + x
  // OpenTUI marks continuation cells with both high bits (see getSpanLines).
  // Include the entire glyph even when the mouse is over its trailing cell.
  while (start > rowStart && (char[start] ?? 0) >>> 30 === 3) start--
  let end = start + 1
  while (end < rowStart + buffer.width && (char[end] ?? 0) >>> 30 === 3) end++
  // Keep the covered text readable even on inverse or unusually bright surfaces.
  const inkLevel = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722 > 0.5 ? 0 : 1
  const ink = RGBA.fromValues(inkLevel, inkLevel, inkLevel)
  for (let index = start; index < end; index++) {
    const offset = index * 4
    const style = attributes[index] ?? 0
    fg.set(ink.buffer, offset)
    bg.set(color.buffer, offset)
    attributes[index] = style & ~TextAttributes.INVERSE
  }
}

/** Paint only empty cells, keeping text, wide glyphs, attributes and backgrounds intact. */
export function paintMouseTrail(buffer: OptimizedBuffer, cells: TrailCell[], color: RGBA) {
  const { char, bg, attributes } = buffer.buffers
  for (const cell of cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= buffer.width || cell.y >= buffer.height) continue
    const index = cell.y * buffer.width + cell.x
    if (char[index] !== 32 || attributes[index] !== 0) continue
    const background = RGBA.fromArray(bg.subarray(index * 4, index * 4 + 4))
    const foreground = RGBA.fromValues(
      background.r + (color.r - background.r) * cell.strength,
      background.g + (color.g - background.g) * cell.strength,
      background.b + (color.b - background.b) * cell.strength,
    )
    buffer.setCell(cell.x, cell.y, cell.glyph, foreground, background)
  }
}
