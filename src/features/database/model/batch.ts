import type { DatabaseTableMutation } from "./types"

export type DatabaseBatchExportFormat = "csv" | "tsv" | "json"

export type DatabaseBatchSelectedRow = {
  id: string
  data: Record<string, unknown>
  rowKey: Record<string, unknown> | null
}

type DatabaseBatchShortcutKey = {
  name: string
  sequence?: string
  raw?: string
  ctrl?: boolean
  meta?: boolean
  option?: boolean
  shift?: boolean
}

export function databaseBatchSweepShortcut(key: DatabaseBatchShortcutKey) {
  if (key.ctrl) return false
  const values = [key.name, key.sequence, key.raw]
  return (
    (key.name === "space" && Boolean(key.option || key.meta)) ||
    values.includes("\u00a0") ||
    values.includes("\u001b ")
  )
}

export function databaseBatchRangeDirection(keyName: string): -1 | 1 | null {
  if (keyName === "up" || keyName === "k") return -1
  if (keyName === "down" || keyName === "j") return 1
  return null
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

export function selectDatabaseBatchRow(
  selected: DatabaseBatchSelectedRow[],
  row: DatabaseBatchSelectedRow,
) {
  if (selected.some((candidate) => candidate.id === row.id)) return selected
  return [...selected, row]
}

export function databaseBatchRange(
  rows: DatabaseBatchSelectedRow[],
  anchorIndex: number,
  currentIndex: number,
) {
  if (!rows.length) return []
  const lastIndex = rows.length - 1
  const anchor = Math.max(0, Math.min(lastIndex, anchorIndex))
  const current = Math.max(0, Math.min(lastIndex, currentIndex))
  return rows.slice(Math.min(anchor, current), Math.max(anchor, current) + 1)
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
