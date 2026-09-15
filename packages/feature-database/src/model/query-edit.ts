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
      (relation.nameQuoted
        ? table.name === relation.name
        : table.name.toLocaleLowerCase() === relation.name.toLocaleLowerCase()) &&
      (!relation.schema ||
        (relation.schemaQuoted
          ? table.schema === relation.schema
          : table.schema.toLocaleLowerCase() === relation.schema.toLocaleLowerCase())),
  )
  return matches.length === 1 ? (matches[0] ?? null) : null
}

export function databaseQueryResultMatchesTable(
  resultColumns: string[],
  tableColumns: DatabaseColumn[],
) {
  return (
    resultColumns.length > 0 &&
    new Set(resultColumns).size === resultColumns.length &&
    resultColumns.every(
      (field) => tableColumns.filter((column) => column.field === field).length === 1,
    )
  )
}

export function databaseQueryTableWriteBlockReason(
  canWrite: boolean,
  table: DatabaseTable | null,
  columns: DatabaseColumn[] | null,
  resultColumns: string[],
) {
  if (!canWrite) return "Conexão em somente leitura. Use [C] > [E] e habilite LEITURA + ESCRITA."
  if (!table) return "A edição exige um SELECT simples de uma única tabela."
  if (table.type !== "table") return "Views e resultados derivados são somente leitura."
  if (!columns) return "Carregando a estrutura da tabela…"
  if (!databaseQueryResultMatchesTable(resultColumns, columns))
    return "Views e resultados derivados são somente leitura."
  return null
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
