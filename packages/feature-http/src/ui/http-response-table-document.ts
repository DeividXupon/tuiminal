import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { ColorPalette } from "@xupon/tuiminal-core/settings/theme"
import { findHttpTextMatches, sanitizeTerminalText } from "../model/response"
import type { HttpResponseTable, HttpTableCell } from "./http-response-table-types"

const MAX_TABLE_CHARACTERS = 50_000
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function normalizedCell(value: string) {
  return sanitizeTerminalText(value.slice(0, MAX_TABLE_CHARACTERS))
    .replaceAll("\t", "    ")
    .replaceAll("\r", "")
}

function wrapCell(value: string, width: number) {
  const text = normalizedCell(value)
  const lines: string[] = []
  let line = "",
    used = 0,
    breakAt = 0
  for (const { segment } of graphemes.segment(text)) {
    if (segment === "\n") {
      lines.push(line)
      line = ""
      used = 0
      breakAt = 0
      continue
    }
    const size = displayWidth(segment)
    if (used + size > width) {
      const split = breakAt || line.length
      lines.push(line.slice(0, split))
      line = line.slice(split)
      used = displayWidth(line)
      breakAt = 0
    }
    line += segment
    used += size
    if (segment === " " || segment === "-" || segment === "/") breakAt = line.length
  }
  lines.push(line)
  return lines
}

function responsiveTable(table: HttpResponseTable, width: number): HttpResponseTable {
  if (width >= 60 || table.columns.length <= 2) return table
  return {
    ...table,
    columns: [translateUi("CAMPO"), translateUi("VALOR")],
    weights: [1, 1],
    rows: table.rows.flatMap((row, index) =>
      row.map((value, column) => [
        {
          text: `${column === 0 ? `${index + 1} · ` : ""}${table.columns[column] ?? ""}`,
          tone: "http" as const,
        },
        value,
      ]),
    ),
  }
}

function columnWidths(table: HttpResponseTable, width: number) {
  const available = width - table.columns.length * 3 - 1
  const weights = table.weights ?? table.columns.map(() => 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
  const widths = weights.map((weight, index) =>
    weight === 0
      ? Math.max(4, String(table.rows.length).length, displayWidth(table.columns[index] ?? ""))
      : Math.max(3, Math.floor((available * weight) / total)),
  )
  let remaining = available - widths.reduce((sum, value) => sum + value, 0)
  for (let index = widths.length - 1; remaining < 0 && index >= 0; index--) {
    const size = widths[index] ?? 3
    const change = Math.min(size - 3, -remaining)
    widths[index] = size - change
    remaining += change
  }
  widths[widths.length - 1] = (widths.at(-1) ?? 3) + Math.max(0, remaining)
  return widths
}

type TableSearchCell = {
  text: string
  firstLine: number
  offsets: number[]
  visibleLines: number
  copyLine: string
}

function searchCell(
  text: string,
  lines: string[],
  firstLine: number,
  copyLine: string,
): TableSearchCell {
  let offset = 0
  const normalized = normalizedCell(text)
  const offsets = lines.map((line) => {
    const start = offset
    offset += line.length
    if (normalized[offset] === "\n") offset++
    return start
  })
  return { text: normalized, firstLine, offsets, visibleLines: 0, copyLine }
}

export function findHttpResponseTableMatches(
  table: { searchCells: TableSearchCell[] },
  query: string,
) {
  return table.searchCells
    .flatMap((cell) =>
      findHttpTextMatches(cell.text, query).flatMap((match) => {
        const row = cell.offsets.findLastIndex((offset) => offset <= match.start)
        return row < cell.visibleLines
          ? [{ ...match, line: cell.firstLine + row, copyLine: cell.copyLine }]
          : []
      }),
    )
    .sort((left, right) => left.line - right.line)
}

function tableLineParts(
  cells: HttpTableCell[],
  values: string[][],
  widths: number[],
  line: number,
  palette: ColorPalette,
  header: boolean,
) {
  const parts = [{ text: "│", fg: palette.border }]
  for (let column = 0; column < widths.length; column++) {
    const value = values[column]?.[line] ?? ""
    const padding = Math.max(0, (widths[column] ?? 3) - displayWidth(value))
    parts.push({
      text: ` ${value}${" ".repeat(padding)} `,
      fg: header ? palette.http : palette[cells[column]?.tone ?? "text"],
    })
    parts.push({ text: "│", fg: palette.border })
  }
  return parts
}

/** One bounded native text document, rather than a React node for every table cell. */
export function buildHttpResponseTableDocument(
  source: HttpResponseTable,
  viewportWidth: number,
  palette: ColorPalette,
) {
  const width = Math.max(18, Math.floor(viewportWidth))
  const table = responsiveTable(source, width)
  const widths = columnWidths(table, width)
  const chunks: TextChunk[] = []
  const lines: string[] = []
  const searchCells: TableSearchCell[] = []
  let characters = 0,
    limited = false
  const colors = new Map<string, RGBA>()
  const color = (value: string) => {
    let result = colors.get(value)
    if (!result) {
      result = RGBA.fromHex(value)
      colors.set(value, result)
    }
    return result
  }
  const append = (parts: { text: string; fg: string }[], background: string) => {
    const plain = parts.map((part) => part.text).join("")
    if (characters + plain.length + 1 > MAX_TABLE_CHARACTERS - 256) {
      limited = true
      return false
    }
    if (lines.length) chunks.push({ __isChunk: true, text: "\n" })
    for (const part of parts)
      chunks.push({ __isChunk: true, text: part.text, fg: color(part.fg), bg: color(background) })
    lines.push(plain)
    characters += plain.length + 1
    return true
  }
  const renderRow = (cells: HttpTableCell[], index: number, header = false) => {
    const values = cells.map((value, column) => wrapCell(value.text, widths[column] ?? 3))
    const height = Math.max(1, ...values.map((value) => value.length))
    const copyLine = cells
      .filter((_, column) => table.weights?.[column] !== 0)
      .map((cell) => cell.text)
      .join("\t")
    const searchable = header
      ? []
      : cells.flatMap((cell, column) =>
          table.weights?.[column] === 0
            ? []
            : [searchCell(cell.text, values[column] ?? [], lines.length + 1, copyLine)],
        )
    searchCells.push(...searchable)
    const background = header
      ? palette.panelRaised
      : index % 2 === 0
        ? palette.canvas
        : palette.panelAlt
    for (let line = 0; line < height; line++) {
      const parts = tableLineParts(cells, values, widths, line, palette, header)
      if (!append(parts, background)) return false
      for (const cell of searchable) cell.visibleLines = line + 1
    }
    return true
  }
  const rule = (left: string, separator: string, right: string) =>
    append(
      [
        {
          text: left + widths.map((size) => "─".repeat(size + 2)).join(separator) + right,
          fg: palette.border,
        },
      ],
      palette.canvas,
    )
  rule("┌", "┬", "┐")
  renderRow(
    table.columns.map((text) => ({ text })),
    0,
    true,
  )
  rule("├", "┼", "┤")
  for (let index = 0; index < table.rows.length; index++) {
    const row = table.rows[index]
    if (row && !renderRow(row, index)) break
  }
  rule("└", "┴", "┘")
  const note = limited
    ? translateUi("EXIBIÇÃO LIMITADA · Copiar preserva todos os dados desta aba.")
    : table.rows.length
      ? table.note
      : table.empty
  if (note) {
    // Reserve a small footer even when a large response reaches the display budget.
    for (const text of wrapCell(note, width)) {
      if (lines.length) chunks.push({ __isChunk: true, text: "\n" })
      chunks.push({
        __isChunk: true,
        text,
        fg: color(limited ? palette.warning : palette.muted),
        bg: color(palette.canvas),
      })
      lines.push(text)
    }
  }
  return {
    searchCells,
    styled: new StyledText(chunks),
    plain: lines.join("\n"),
    height: lines.length,
    width,
    limited,
  }
}
