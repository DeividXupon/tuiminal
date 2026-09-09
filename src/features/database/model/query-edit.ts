import type { DatabaseColumn, DatabaseDriver, DatabaseTable } from "./types"
import { directQueryRelation } from "./query-projection"

export function databaseEditableQueryTable(
  sql: string,
  tables: DatabaseTable[],
  driver?: DatabaseDriver,
): DatabaseTable | null {
  const relation = directQueryRelation(sql, driver)
  if (!relation) return null
  const matches = tables.filter(
    (table) =>
      table.name.toLocaleLowerCase() === relation.name.toLocaleLowerCase() &&
      (!relation.schema ||
        table.schema.toLocaleLowerCase() === relation.schema.toLocaleLowerCase()),
  )
  return matches.length === 1 ? (matches[0] ?? null) : null
}

export function databaseQueryResultRowKey(row: Record<string, unknown>, columns: DatabaseColumn[]) {
  const primaryColumns = columns.filter((column) => column.key === "PRI")
  if (!primaryColumns.length) return null
  const entries: Array<[string, unknown]> = []
  for (const column of primaryColumns) {
    const value = row[column.field]
    if (
      !Object.hasOwn(row, column.field) ||
      value === null ||
      value === undefined ||
      value === "<mascarado>" ||
      String(value).startsWith("<binário ")
    ) {
      return null
    }
    entries.push([column.field, value])
  }
  return Object.fromEntries(entries)
}

export function databaseQueryResultColumns(
  resultColumns: string[],
  tableColumns: DatabaseColumn[],
): DatabaseColumn[] {
  return resultColumns.map(
    (field) =>
      tableColumns.find((column) => column.field === field) ?? {
        field,
        type: "resultado",
        nullable: true,
        key: "",
        defaultValue: null,
      },
  )
}
