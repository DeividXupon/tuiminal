import { type CodeRenderable, type OptimizedBuffer, RGBA } from "@opentui/core"
import {
  blendTextColor,
  type TextShimmerAnimation,
  textShimmerIntensity,
} from "@xupon/tuiminal-core/ui/text-shimmer"
import { TERMINAL_SHIMMER_FRAME_COUNT, TERMINAL_SHIMMER_FRAME_MS } from "./terminal-shimmer"

export const LIVE_DIFF_SHIMMER_FRAME_MS = TERMINAL_SHIMMER_FRAME_MS
export const LIVE_DIFF_SHIMMER_FRAME_COUNT = TERMINAL_SHIMMER_FRAME_COUNT
export const LIVE_DIFF_SHIMMER_MS = LIVE_DIFF_SHIMMER_FRAME_MS * LIVE_DIFF_SHIMMER_FRAME_COUNT

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

type CapturedSpan = ReturnType<OptimizedBuffer["getSpanLines"]>[number]["spans"][number]
type ShimmerCode = Pick<CodeRenderable, "lineInfo" | "scrollY" | "screenX" | "screenY" | "width">

function paintShimmerSpan(
  buffer: OptimizedBuffer,
  span: CapturedSpan,
  startX: number,
  y: number,
  codeX: number,
  codeWidth: number,
  animation: TextShimmerAnimation,
  shine: RGBA,
) {
  let x = startX
  for (const { segment } of graphemes.segment(span.text)) {
    const width = Bun.stringWidth(segment)
    if (width < 1) continue
    const position = x - codeX + (width - 1) / 2
    const intensity = textShimmerIntensity(position, codeWidth, animation)
    if (x >= codeX && x + width <= codeX + codeWidth && segment.trim() && intensity > 0) {
      buffer.drawText(
        segment,
        x,
        y,
        blendTextColor(span.fg, shine, intensity),
        span.bg,
        span.attributes,
      )
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
  animation: TextShimmerAnimation,
  shine: RGBA,
) {
  let x = 0
  for (const span of spans) {
    const end = x + span.width
    if (end > codeX && x < codeX + codeWidth)
      paintShimmerSpan(buffer, span, x, y, codeX, codeWidth, animation, shine)
    x = end
  }
}

/** Repaint only the glyphs crossed by the light band, keeping syntax and backgrounds elsewhere. */
export function drawLiveDiffTextShimmer(
  buffer: OptimizedBuffer,
  code: ShimmerCode,
  lines: ReadonlySet<number>,
  animation: TextShimmerAnimation,
) {
  const sources = code.lineInfo.lineSources
  const first = Math.max(0, code.scrollY - code.screenY)
  const last = Math.min(sources.length, code.scrollY + buffer.height - code.screenY)
  if (first >= last) return

  const shine = RGBA.fromHex(animation.shineColor)
  const visibleLines = Array.from({ length: last - first }, (_, offset) => first + offset).filter(
    (row) => lines.has(sources[row] ?? -1),
  )
  if (!visibleLines.length) return

  const screen = buffer.getSpanLines()
  for (const row of visibleLines) {
    const y = code.screenY + row - code.scrollY
    const captured = screen[y]
    if (!captured) continue
    paintShimmerRow(buffer, captured.spans, y, code.screenX, code.width, animation, shine)
  }
}
