import type { SyntaxStyle, TextareaRenderable } from "@opentui/core"
import stringWidth from "string-width"

import { getSqlHighlightSpans, type SqlDialect, type SqlHighlightGroup } from "../model/sql-lexer"
export type { SqlHighlightGroup, SqlHighlightSpan } from "../model/sql-lexer"
export {
  getSqlHighlightSpans,
  SQL_KEYWORDS,
  sqlEditorLineCount,
  sqlEditorGutterWidth,
} from "../model/sql-lexer"

export function applySqlSyntaxHighlights(
  editor: TextareaRenderable,
  syntaxStyle: SyntaxStyle,
  dialect?: SqlDialect,
) {
  const styleIds = new Map<SqlHighlightGroup, number>()
  for (const group of [
    "comment",
    "constant",
    "function",
    "keyword",
    "number",
    "operator",
    "property",
    "punctuation",
    "string",
    "type",
  ] as const) {
    const styleId = syntaxStyle.getStyleId(group)
    if (styleId !== null) styleIds.set(group, styleId)
  }

  editor.editBuffer.clearAllHighlights()
  const sql = editor.plainText
  const lines = sql.split("\n")
  const tabWidth = editor.editBuffer.getTabWidth()
  const displayColumns = lines.map((line) => {
    const columns = Array<number>(line.length + 1).fill(0)
    let column = 0
    let offset = 0
    for (const character of line) {
      columns[offset] = column
      if (character === "\t") {
        column += tabWidth - (column % tabWidth)
      } else {
        column += stringWidth(character)
      }
      offset += character.length
      columns[offset] = column
    }
    return columns
  })
  for (const span of getSqlHighlightSpans(sql, dialect)) {
    const styleId = styleIds.get(span.group)
    if (styleId === undefined) continue
    const columns = displayColumns[span.line] ?? [0]
    editor.editBuffer.addHighlight(span.line, {
      start: columns[span.start] ?? 0,
      end: columns[span.end] ?? 0,
      styleId,
      priority: 20,
    })
  }
  editor.requestRender()
}
