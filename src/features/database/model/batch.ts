import type { DatabaseTableMutation } from "./types"

export type DatabaseBatchExportFormat = "csv" | "tsv" | "json"

export type DatabaseBatchSelectedRow = {
  id: string
  data: Record<string, unknown>
  rowKey: Record<string, unknown> | null
}

export function jsonValue(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Uint8Array) {
    return { type: "binary", base64: Buffer.from(value).toString("base64") }
  }
  return value
}

export function stableValue(value: unknown): string {
  if (value === undefined) return "undefined"
  return JSON.stringify(value, jsonValue)
}

export function databaseBatchRowIdentity(
  rowKey: Record<string, unknown> | null,
  fallbackId: string,
) {
  if (!rowKey || !Object.keys(rowKey).length) return `local:${fallbackId}`
  const entries = Object.entries(rowKey)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, value]) => [field, stableValue(value)])
  return `key:${JSON.stringify(entries)}`
}

export function databaseBatchUpdateMutations(
  rows: DatabaseBatchSelectedRow[],
  field: string,
  value: unknown,
): Array<{ row: DatabaseBatchSelectedRow; mutation: DatabaseTableMutation }> {
  return rows.flatMap((row) =>
    row.rowKey && Object.keys(row.rowKey).length
      ? [{ row, mutation: { kind: "update", rowKey: row.rowKey, values: { [field]: value } } }]
      : [],
  )
}

export function databaseBatchDeleteMutations(
  rows: DatabaseBatchSelectedRow[],
): Array<{ row: DatabaseBatchSelectedRow; mutation: DatabaseTableMutation }> {
  return rows.flatMap((row) =>
    row.rowKey && Object.keys(row.rowKey).length
      ? [{ row, mutation: { kind: "delete", rowKey: row.rowKey } }]
      : [],
  )
}

export function toggleDatabaseBatchRow(
  selected: DatabaseBatchSelectedRow[],
  row: DatabaseBatchSelectedRow,
) {
  const exists = selected.some((candidate) => candidate.id === row.id)
  if (exists) return selected.filter((candidate) => candidate.id !== row.id)
  return [...selected, row]
}

export function toggleDatabaseBatchPage(
  selected: DatabaseBatchSelectedRow[],
  pageRows: DatabaseBatchSelectedRow[],
) {
  if (!pageRows.length) return selected
  const pageIds = new Set(pageRows.map((row) => row.id))
  const selectedIds = new Set(selected.map((row) => row.id))
  const allSelected = pageRows.every((row) => selectedIds.has(row.id))
  if (allSelected) return selected.filter((row) => !pageIds.has(row.id))
  const outsidePage = selected.filter((row) => !pageIds.has(row.id))
  return [...outsidePage, ...pageRows]
}

export function delimitedValue(value: unknown, delimiter: string) {
  if (value === null || value === undefined) return ""
  let text: string
  if (value instanceof Uint8Array) {
    text = `base64:${Buffer.from(value).toString("base64")}`
  } else if (typeof value === "object") {
    text = JSON.stringify(value, jsonValue)
  } else {
    text = String(value)
  }
  if (text.includes(delimiter) || /["\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export function serializeDatabaseBatchRows(
  rows: DatabaseBatchSelectedRow[],
  columns: string[],
  format: DatabaseBatchExportFormat,
) {
  if (format === "json") {
    const output = rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column, row.data[column] ?? null])),
    )
    return `${JSON.stringify(output, jsonValue, 2)}\n`
  }
  const delimiter = format === "csv" ? "," : "\t"
  const lines = [
    columns.map((column) => delimitedValue(column, delimiter)).join(delimiter),
    ...rows.map((row) =>
      columns.map((column) => delimitedValue(row.data[column], delimiter)).join(delimiter),
    ),
  ]
  return `${lines.join("\n")}\n`
}
