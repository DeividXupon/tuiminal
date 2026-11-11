import { SyntaxStyle, type TextareaRenderable } from "@opentui/core"
import { displayWidth } from "@xupon/tuiminal-core/i18n/index"

export const HTTP_VARIABLE_COLOR = "#7dd3fc"
const reference = 0x48545450
const fallbackStyle = SyntaxStyle.create()
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
export type HttpVariableToken = { name: string; row: number; start: number; end: number }

export function httpVariableTokens(source: string, tabWidth = 4): HttpVariableToken[] {
  const tokens: HttpVariableToken[] = []
  for (const [row, line] of source.slice(0, 50_000).split("\n").entries()) {
    if (!line.includes("{{")) continue
    const columns = new Map<number, number>()
    let column = 0
    for (const { segment, index } of graphemes.segment(line)) {
      columns.set(index, column)
      column += segment === "\t" ? tabWidth - (column % tabWidth) : displayWidth(segment)
    }
    columns.set(line.length, column)
    for (const match of line.matchAll(/\{\{\s*([A-Za-z_$][\w$.-]*)\s*\}\}/g)) {
      tokens.push({
        name: match[1] ?? "",
        row,
        start: columns.get(match.index) ?? 0,
        end: columns.get(match.index + match[0].length) ?? 0,
      })
    }
  }
  return tokens
}
export function applyHttpVariableHighlights(editor: TextareaRenderable, source: string) {
  const style = editor.syntaxStyle ?? fallbackStyle
  if (!editor.syntaxStyle) editor.syntaxStyle = style
  const styleId = style.registerStyle("http-variable-reference", { fg: HTTP_VARIABLE_COLOR })
  const tokens = httpVariableTokens(source, editor.editBuffer.getTabWidth())
  editor.editBuffer.removeHighlightsByRef(reference)
  for (const token of tokens)
    editor.editBuffer.addHighlight(token.row, {
      start: token.start,
      end: token.end,
      styleId,
      priority: 100,
      hlRef: reference,
    })
  editor.requestRender()
  return tokens
}
export function clearHttpVariableHighlights(editor: TextareaRenderable) {
  if (!editor.isDestroyed) editor.editBuffer.removeHighlightsByRef(reference)
}
export function variableAt(tokens: HttpVariableToken[], row: number, column: number) {
  return tokens.find((token) => token.row === row && token.start <= column && column < token.end)
}
export function mouseVariable(
  editor: TextareaRenderable,
  tokens: HttpVariableToken[],
  x: number,
  y: number,
) {
  const viewport = editor.editorView.getViewport()
  const line = y - editor.screenY + viewport.offsetY
  const info = editor.lineInfo
  const row = info.lineSources[line]
  if (row === undefined || x < editor.screenX || x >= editor.screenX + editor.width) return
  const column = (info.lineStartCols[line] ?? 0) + viewport.offsetX + x - editor.screenX
  return variableAt(tokens, row, column)
}
