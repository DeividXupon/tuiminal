import type { DatabaseColumn, DatabaseTable } from "./types"

const SQL_IDENTIFIER = String.raw`(?:\`(?:\`\`|[^\`])+\`|"(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*)`
const SINGLE_TABLE_FROM = new RegExp(
  String.raw`\bFROM\s+(${SQL_IDENTIFIER})(?:\s*\.\s*(${SQL_IDENTIFIER}))?`,
  "i",
)

function sqlWithoutValuesOrComments(sql: string) {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, " ")
    .replace(/'(?:''|\\.|[^'])*'/g, "''")
    .replace(/--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g, " ")
}

function unquoteSqlIdentifier(identifier: string) {
  if (identifier.startsWith("`") && identifier.endsWith("`")) {
    return identifier.slice(1, -1).replaceAll("``", "`")
  }
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1).replaceAll('""', '"')
  }
  return identifier
}

export function databaseEditableQueryTable(
  sql: string,
  tables: DatabaseTable[],
): DatabaseTable | null {
  const normalized = sqlWithoutValuesOrComments(sql)
  if (!/^\s*SELECT\b/i.test(normalized)) return null
  if (/\b(WITH|JOIN|UNION|INTERSECT|EXCEPT)\b/i.test(normalized)) return null
  if ([...normalized.matchAll(/\bFROM\b/gi)].length !== 1) return null

  const relation = normalized.match(SINGLE_TABLE_FROM)
  if (!relation) return null
  const first = unquoteSqlIdentifier(relation[1] ?? "")
  const second = relation[2] ? unquoteSqlIdentifier(relation[2]) : ""
  const schema = second ? first : null
  const tableName = second || first
  if (!tableName) return null

  const relationEnd = (relation.index ?? 0) + relation[0].length
  const relationTail = normalized.slice(relationEnd)
  const beforeClause =
    relationTail.split(/\b(?:WHERE|GROUP|HAVING|ORDER|LIMIT|OFFSET|FETCH|FOR|WINDOW)\b/i, 1)[0] ??
    ""
  if (beforeClause.includes(",") || beforeClause.includes("(")) return null

  const matches = tables.filter(
    (table) =>
      table.name.toLocaleLowerCase() === tableName.toLocaleLowerCase() &&
      (!schema || table.schema.toLocaleLowerCase() === schema.toLocaleLowerCase()),
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
