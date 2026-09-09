import { type SqlToken, sqlIdentifier, sqlKeyword, sqlTokens } from "./sql-tokens"
import type { DatabaseColumn, DatabaseDriver, DatabaseTable } from "./types"

const RESULT_TRANSFORMS = new Set([
  "WITH",
  "JOIN",
  "UNION",
  "INTERSECT",
  "EXCEPT",
  "INTO",
  "DISTINCT",
  "GROUP",
  "HAVING",
  "WINDOW",
  "OVER",
])
const TAIL_CLAUSES = new Set(["WHERE", "ORDER", "LIMIT", "OFFSET", "FETCH", "FOR"])
const LITERAL_WORDS =
  /^(NULL|TRUE|FALSE|DEFAULT|CURRENT_\w+|LOCALTIME|LOCALTIMESTAMP|USER|SESSION_USER|SYSTEM_USER)$/i

function isTail(token: SqlToken | undefined) {
  return token?.kind === "word" && TAIL_CLAUSES.has(token.value.toUpperCase())
}

function relationParts(tokens: SqlToken[], driver: DatabaseDriver) {
  const first = sqlIdentifier(tokens[0], driver)
  if (!first) return null
  const qualified = tokens[1]?.value === "."
  const second = qualified ? sqlIdentifier(tokens[2], driver) : null
  if (qualified && !second) return null
  let end = qualified ? 3 : 1
  let alias: string | null = null
  if (tokens[end] && !isTail(tokens[end])) {
    if (sqlKeyword(tokens[end], "AS")) end += 1
    alias = sqlIdentifier(tokens[end], driver)
    if (!alias) return null
    end += 1
  }
  if (tokens[end] && !isTail(tokens[end])) return null
  return { schema: second ? first : null, name: second ?? first, alias }
}

function directProjection(tokens: SqlToken[], qualifier: string, driver: DatabaseDriver) {
  let cursor = 0
  if (tokens[1]?.value === ".") {
    if (sqlIdentifier(tokens[0], driver) !== qualifier) return null
    cursor = 2
  }
  const source = tokens[cursor]
  if (source?.kind === "word" && LITERAL_WORDS.test(source.value)) return null
  const field = source?.value === "*" ? "*" : sqlIdentifier(source, driver)
  if (!field) return null
  cursor += 1
  if (sqlKeyword(tokens[cursor], "AS")) cursor += 1
  if (tokens[cursor]) {
    if (field === "*" || sqlIdentifier(tokens[cursor], driver) !== field) return null
    cursor += 1
  }
  return cursor === tokens.length ? field : null
}

function directProjections(tokens: SqlToken[], qualifier: string, driver: DatabaseDriver) {
  const projections: SqlToken[][] = [[]]
  for (const token of tokens) {
    if (token.value === "," && token.kind === "symbol") projections.push([])
    else projections.at(-1)?.push(token)
  }
  const fields = projections.map((projection) => directProjection(projection, qualifier, driver))
  if (fields.includes(null) || new Set(fields).size !== fields.length) return false
  return fields.length === 1 || !fields.includes("*")
}

export function databaseEditableQueryTable(
  sql: string,
  tables: DatabaseTable[],
  driver: DatabaseDriver = "postgres",
): DatabaseTable | null {
  const tokens = sqlTokens(sql, driver)
  if (!tokens || !sqlKeyword(tokens[0], "SELECT")) return null
  if (tokens.at(-1)?.value === ";") tokens.pop()
  if (tokens.some((token) => token.kind === "symbol" && token.value === ";")) return null
  const words = tokens
    .filter((token) => token.kind === "word")
    .map((token) => token.value.toUpperCase())
  if (words.some((word) => RESULT_TRANSFORMS.has(word))) return null
  if (words.filter((word) => word === "SELECT").length !== 1) return null
  if (words.filter((word) => word === "FROM").length !== 1) return null
  const from = tokens.findIndex((token) => sqlKeyword(token, "FROM"))
  const relation = relationParts(tokens.slice(from + 1), driver)
  if (
    !relation ||
    !directProjections(tokens.slice(1, from), relation.alias ?? relation.name, driver)
  )
    return null
  const matches = tables.filter(
    (table) =>
      table.name === relation.name && (!relation.schema || table.schema === relation.schema),
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
