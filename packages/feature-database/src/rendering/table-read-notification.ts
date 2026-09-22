import { displayWidth, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { NotificationMessageChunk } from "@xupon/tuiminal-core/notifications/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { getSqlHighlightSpans, type SqlDialect, type SqlHighlightGroup } from "../model/sql-lexer"

function sqlPreview(sql: string, lineWidth: number) {
  const lines = sql.split("\n")
  const from = lines.find((line) => line.startsWith("FROM ")) ?? "FROM ?"
  const limit = lines.find((line) => /^LIMIT \d+ OFFSET \d+$/.test(line)) ?? ""
  const clauses = [
    lines.some((line) => line.startsWith("WHERE ")) ? "WHERE …" : "",
    lines.some((line) => line.startsWith("ORDER BY ")) ? "ORDER BY …" : "",
  ]
    .filter(Boolean)
    .join(" ")
  const availableClauses = Math.max(0, lineWidth - displayWidth(limit) - 1)
  const visibleClauses = truncateDisplay(clauses, availableClauses)
  const lastLine = visibleClauses ? `${visibleClauses} ${limit}` : limit
  return `${truncateDisplay(`SELECT … ${from}`, lineWidth)}\n${truncateDisplay(lastLine, lineWidth)}`
}

function sqlGroupColor(group: SqlHighlightGroup) {
  if (group === "keyword" || group === "function") return COLORS.database
  if (group === "number" || group === "constant" || group === "type") return COLORS.warning
  if (group === "string" || group === "property") return COLORS.success
  if (group === "operator") return COLORS.database
  if (group === "comment" || group === "punctuation") return COLORS.muted
  return undefined
}

function highlightedChunks(message: string, dialect: SqlDialect): NotificationMessageChunk[] {
  const lines = message.split("\n")
  const lineOffsets: number[] = []
  let offset = 0
  for (const line of lines) {
    lineOffsets.push(offset)
    offset += line.length + 1
  }
  const chunks: NotificationMessageChunk[] = []
  let cursor = 0
  for (const span of getSqlHighlightSpans(message, dialect)) {
    const start = (lineOffsets[span.line] ?? 0) + span.start
    const end = (lineOffsets[span.line] ?? 0) + span.end
    if (start < cursor) continue
    if (start > cursor) chunks.push({ text: message.slice(cursor, start) })
    const color = sqlGroupColor(span.group)
    chunks.push({ text: message.slice(start, end), ...(color ? { color } : {}) })
    cursor = end
  }
  if (cursor < message.length) chunks.push({ text: message.slice(cursor) })
  return chunks
}

export function tableReadNotification(sql: string, dialect: SqlDialect, lineWidth: number) {
  const message = sqlPreview(sql, Math.max(18, Math.floor(lineWidth)))
  return { message, messageChunks: highlightedChunks(message, dialect) }
}
