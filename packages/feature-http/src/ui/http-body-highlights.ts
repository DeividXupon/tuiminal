import type { SimpleHighlight, TextareaRenderable } from "@opentui/core"
import { displayWidth } from "@xupon/tuiminal-core/i18n/index"
import { createUiSyntaxStyle } from "@xupon/tuiminal-core/ui/syntax-style"

export const HTTP_BODY_SYNTAX = createUiSyntaxStyle()
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function displayColumns(line: string, tabWidth: number) {
  const columns = new Array<number>(line.length + 1)
  let column = 0
  for (const { segment, index } of graphemes.segment(line)) {
    for (let i = index; i < index + segment.length; i++) columns[i] = column
    column += segment === "\t" ? tabWidth - (column % tabWidth) : displayWidth(segment)
  }
  columns[line.length] = column
  return columns
}

export function applyHttpBodyHighlights(
  editor: TextareaRenderable,
  source: string,
  highlights: SimpleHighlight[],
) {
  editor.editBuffer.clearAllHighlights()
  const spans = [...highlights].sort((a, b) => a[0] - b[0])
  let offset = 0
  let first = 0
  const lines = source.split("\n")
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row] ?? ""
    const end = offset + line.length
    while (first < spans.length && (spans[first]?.[1] ?? 0) <= offset) first++
    highlightLine(editor, row, line, offset, spans, first)
    offset = end + 1
  }
  editor.requestRender()
}

function highlightLine(
  editor: TextareaRenderable,
  row: number,
  line: string,
  offset: number,
  spans: SimpleHighlight[],
  first: number,
) {
  const columns = displayColumns(line, editor.editBuffer.getTabWidth())
  for (let i = first; i < spans.length; i++) {
    const span = spans[i]
    if (!span || span[0] >= offset + line.length) break
    const [from, to, group] = span
    const property = group === "string.special.key"
    const styleId = HTTP_BODY_SYNTAX.getStyleId(
      property ? "property" : (group.split(".")[0] ?? group),
    )
    const start = columns[Math.max(0, from - offset)] ?? 0
    const end = columns[Math.min(line.length, to - offset)] ?? 0
    if (styleId === null || end <= start) continue
    editor.editBuffer.addHighlight(row, {
      start,
      end,
      styleId,
      priority: property ? 40 : 20 + group.split(".").length,
    })
  }
}
