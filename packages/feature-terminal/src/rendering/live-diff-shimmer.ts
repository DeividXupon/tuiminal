import { type CodeRenderable, type OptimizedBuffer, RGBA } from "@opentui/core"

export const LIVE_DIFF_SHIMMER_MS = 1600
export const LIVE_DIFF_SHIMMER_FRAME_MS = 60

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
const DARK_SHINE = RGBA.fromHex("#ffffff")
const DARK_EDGE = RGBA.fromHex("#9fe7ff")
const LIGHT_SHINE = RGBA.fromHex("#172b56")
const LIGHT_EDGE = RGBA.fromHex("#496dad")

type CapturedSpan = ReturnType<OptimizedBuffer["getSpanLines"]>[number]["spans"][number]
type ShimmerCode = Pick<CodeRenderable, "lineInfo" | "scrollY" | "screenX" | "screenY" | "width">

function paintShimmerSpan(
  buffer: OptimizedBuffer,
  span: CapturedSpan,
  startX: number,
  y: number,
  codeX: number,
  codeWidth: number,
  band: number,
  shine: RGBA,
  edge: RGBA,
) {
  let x = startX
  for (const { segment } of graphemes.segment(span.text)) {
    const width = Bun.stringWidth(segment)
    if (width < 1) continue
    const center = x - codeX + (width - 1) / 2
    const distance = Math.abs(center - band)
    if (x >= codeX && x + width <= codeX + codeWidth && segment.trim() && distance < 3) {
      buffer.drawText(segment, x, y, distance < 1.25 ? shine : edge, span.bg, span.attributes)
    }
    x += width
  }
}

function paintShimmerRow(
  buffer: OptimizedBuffer,
  spans: CapturedSpan[],
  y: number,
  codeX: number,
  codeWidth: number,
  band: number,
  shine: RGBA,
  edge: RGBA,
) {
  let x = 0
  for (const span of spans) {
    const end = x + span.width
    if (end > codeX && x < codeX + codeWidth)
      paintShimmerSpan(buffer, span, x, y, codeX, codeWidth, band, shine, edge)
    x = end
  }
}

/** Repaint only the glyphs crossed by the light band, keeping syntax and backgrounds elsewhere. */
export function drawLiveDiffTextShimmer(
  buffer: OptimizedBuffer,
  code: ShimmerCode,
  lines: ReadonlySet<number>,
  progress: number,
  recentBackground: RGBA,
) {
  const sources = code.lineInfo.lineSources
  const first = Math.max(0, code.scrollY - code.screenY)
  const last = Math.min(sources.length, code.scrollY + buffer.height - code.screenY)
  if (first >= last) return

  const [red, green, blue] = recentBackground.toInts()
  const lightBackground = red + green + blue > 420
  const shine = lightBackground ? LIGHT_SHINE : DARK_SHINE
  const edge = lightBackground ? LIGHT_EDGE : DARK_EDGE
  const band = -3 + Math.max(0, Math.min(1, progress)) * (code.width + 6)
  const visibleLines = Array.from({ length: last - first }, (_, offset) => first + offset).filter(
    (row) => lines.has(sources[row] ?? -1),
  )
  if (!visibleLines.length) return

  const screen = buffer.getSpanLines()
  for (const row of visibleLines) {
    const y = code.screenY + row - code.scrollY
    const captured = screen[y]
    if (!captured) continue
    paintShimmerRow(buffer, captured.spans, y, code.screenX, code.width, band, shine, edge)
  }
}
