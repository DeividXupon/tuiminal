import type { DatabaseColumn, DatabaseDriver, DatabaseTable } from "./types"

import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { getSqlHighlightSpans, SQL_KEYWORDS } from "./sql-lexer"

export type SqlCompletionKind = "column" | "function" | "keyword" | "table"

export type SqlCompletionItem = {
  id: string
  label: string
  insertText: string
  detail: string
  kind: SqlCompletionKind
  score: number
}

export type SqlCompletionContext = {
  items: SqlCompletionItem[]
  replaceStart: number
  replaceEnd: number
  metadataTables: DatabaseTable[]
}

type SqlAutocompleteOptions = {
  sql: string
  cursorOffset: number
  driver: DatabaseDriver
  tables: DatabaseTable[]
  columnsByTable: ReadonlyMap<string, DatabaseColumn[]>
  selectedTable?: DatabaseTable | null
  force?: boolean
}

const KEYWORD_SET = new Set<string>(SQL_KEYWORDS)
const SQL_FUNCTIONS = [
  "AVG",
  "CAST",
  "COALESCE",
  "CONCAT",
  "COUNT",
  "DATE",
  "JSON_EXTRACT",
  "LENGTH",
  "LOWER",
  "MAX",
  "MIN",
  "NOW",
  "NULLIF",
  "REPLACE",
  "ROUND",
  "SUBSTR",
  "SUM",
  "TRIM",
  "UPPER",
] as const
const IDENTIFIER =
  '(?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|' + "\\[(?:[^\\]]|\\]\\])*\\]|[\\p{L}_][\\p{L}\\p{N}_$]*)"
const RELATION_PATTERN = new RegExp(
  String.raw`\b(?:FROM|JOIN|UPDATE|INTO)\s+(${IDENTIFIER}(?:\s*\.\s*${IDENTIFIER})?)`,
  "giu",
)
const ALIAS_PATTERN = new RegExp(String.raw`^\s+(?:AS\s+)?(${IDENTIFIER})`, "iu")
const WORD_AT_CURSOR = /[\p{L}\p{N}_$]*$/u
const QUALIFIED_AT_CURSOR = /([\p{L}_][\p{L}\p{N}_$]*)\.([\p{L}\p{N}_$]*)$/u

export function sqlAutocompleteTableKey(table: DatabaseTable) {
  return `${table.schema}\u0000${table.name}`
}

function unquoteIdentifier(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('""', '"')
  }
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.slice(1, -1).replaceAll("``", "`")
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).replaceAll("]]", "]")
  }
  return trimmed
}

function identifierParts(value: string) {
  return value
    .split(/\s*\.\s*/)
    .map(unquoteIdentifier)
    .filter(Boolean)
}

function sameIdentifier(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0
}

function findTable(
  tables: DatabaseTable[],
  identifier: string,
  selectedTable?: DatabaseTable | null,
) {
  const parts = identifierParts(identifier)
  const name = parts.at(-1)
  if (!name) return null
  const schema = parts.length > 1 ? parts.at(-2) : null
  const matches = tables.filter(
    (table) =>
      sameIdentifier(table.name, name) && (!schema || sameIdentifier(table.schema, schema)),
  )
  if (matches.length === 1) return matches[0] ?? null
  if (
    selectedTable &&
    matches.some(
      (table) => sqlAutocompleteTableKey(table) === sqlAutocompleteTableKey(selectedTable),
    )
  ) {
    return selectedTable
  }
  return (
    matches.find((table) => table.schema === "public" || table.schema === "main") ??
    matches[0] ??
    null
  )
}

function referencedTables(
  sql: string,
  tables: DatabaseTable[],
  selectedTable?: DatabaseTable | null,
) {
  const refs = new Map<string, DatabaseTable>()
  for (const match of sql.matchAll(RELATION_PATTERN)) {
    const relation = match[1]
    if (!relation) continue
    const table = findTable(tables, relation, selectedTable)
    if (!table) continue
    refs.set(table.name.toLocaleLowerCase(), table)
    refs.set(`${table.schema}.${table.name}`.toLocaleLowerCase(), table)
    const tailStart = (match.index ?? 0) + match[0].length
    const aliasMatch = sql.slice(tailStart).match(ALIAS_PATTERN)
    const alias = aliasMatch?.[1] ? unquoteIdentifier(aliasMatch[1]) : ""
    if (alias && !KEYWORD_SET.has(alias.toUpperCase())) {
      refs.set(alias.toLocaleLowerCase(), table)
    }
  }
  return refs
}

function quoteIdentifier(value: string, driver: DatabaseDriver) {
  if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value) && !KEYWORD_SET.has(value.toUpperCase())) {
    return value
  }
  return driver === "mysql" || driver === "mcp-mysql"
    ? `\`${value.replaceAll("`", "``")}\``
    : `"${value.replaceAll('"', '""')}"`
}

function matchScore(candidate: string, prefix: string) {
  if (!prefix) return 0
  const normalizedCandidate = candidate.toLocaleLowerCase()
  const normalizedPrefix = prefix.toLocaleLowerCase()
  if (normalizedCandidate === normalizedPrefix) return -20
  if (normalizedCandidate.startsWith(normalizedPrefix)) return 0
  const includedAt = normalizedCandidate.indexOf(normalizedPrefix)
  if (includedAt >= 0) return 30 + includedAt

  let prefixIndex = 0
  for (const character of normalizedCandidate) {
    if (character === normalizedPrefix[prefixIndex]) prefixIndex += 1
    if (prefixIndex === normalizedPrefix.length) return 70
  }
  return Number.POSITIVE_INFINITY
}

function ignoredAtCursor(sql: string, cursorOffset: number, driver: DatabaseDriver) {
  const before = sql.slice(0, cursorOffset)
  const lines = before.split("\n")
  const line = Math.max(0, lines.length - 1)
  const column = lines.at(-1)?.length ?? 0
  const character = Math.max(0, column - 1)
  return getSqlHighlightSpans(sql, driver).some(
    (span) =>
      span.line === line &&
      character >= span.start &&
      character < span.end &&
      (span.group === "comment" || span.group === "string"),
  )
}

function completionContextKind(beforePrefix: string) {
  if (/\b(?:FROM|JOIN|UPDATE|INTO|TABLE)\s*$/i.test(beforePrefix)) return "table"
  if (/\b(?:SELECT|WHERE|ON|SET|ORDER\s+BY|GROUP\s+BY|HAVING|RETURNING)\s*$/i.test(beforePrefix))
    return "column"
  return "mixed"
}

export function getSqlCompletionContext({
  sql,
  cursorOffset,
  driver,
  tables,
  columnsByTable,
  selectedTable,
  force = false,
}: SqlAutocompleteOptions): SqlCompletionContext | null {
  const cursor = Math.max(0, Math.min(sql.length, cursorOffset))
  const before = sql.slice(0, cursor)
  const qualified = before.match(QUALIFIED_AT_CURSOR)
  const word = before.match(WORD_AT_CURSOR)?.[0] ?? ""
  const prefix = qualified?.[2] ?? word
  const replaceStart = cursor - prefix.length
  const refs = referencedTables(sql, tables, selectedTable)
  const metadataTables = new Map<string, DatabaseTable>()
  for (const table of refs.values()) metadataTables.set(sqlAutocompleteTableKey(table), table)
  if (selectedTable) metadataTables.set(sqlAutocompleteTableKey(selectedTable), selectedTable)

  const qualifier = qualified?.[1]
  let qualifiedTable: DatabaseTable | null = null
  if (qualifier) {
    qualifiedTable =
      refs.get(qualifier.toLocaleLowerCase()) ?? findTable(tables, qualifier, selectedTable)
    if (qualifiedTable) {
      metadataTables.set(sqlAutocompleteTableKey(qualifiedTable), qualifiedTable)
    }
  }

  const emptyContext: SqlCompletionContext = {
    items: [],
    replaceStart,
    replaceEnd: cursor,
    metadataTables: [...metadataTables.values()],
  }
  if (ignoredAtCursor(sql, cursor, driver)) return emptyContext
  if (!force && !qualified && prefix.length < 1) return emptyContext

  const candidates: SqlCompletionItem[] = []
  const contextKind = completionContextKind(before.slice(0, replaceStart))
  const duplicateTableNames = new Map<string, number>()
  for (const table of tables) {
    const key = table.name.toLocaleLowerCase()
    duplicateTableNames.set(key, (duplicateTableNames.get(key) ?? 0) + 1)
  }

  const addTable = (table: DatabaseTable, nameOnly = false) => {
    const score = matchScore(table.name, prefix)
    if (!Number.isFinite(score)) return
    const needsSchema =
      !nameOnly && (duplicateTableNames.get(table.name.toLocaleLowerCase()) ?? 0) > 1
    const insertText = needsSchema
      ? `${quoteIdentifier(table.schema, driver)}.${quoteIdentifier(table.name, driver)}`
      : quoteIdentifier(table.name, driver)
    candidates.push({
      id: `table:${sqlAutocompleteTableKey(table)}`,
      label: table.name,
      insertText,
      detail: `${translateUi(table.type === "view" ? "view" : "tabela")} · ${table.schema}`,
      kind: "table",
      score: score + (contextKind === "table" ? -50 : 15),
    })
  }

  const addColumns = (table: DatabaseTable) => {
    for (const column of columnsByTable.get(sqlAutocompleteTableKey(table)) ?? []) {
      const score = matchScore(column.field, prefix)
      if (!Number.isFinite(score)) continue
      candidates.push({
        id: `column:${sqlAutocompleteTableKey(table)}:${column.field}`,
        label: column.field,
        insertText: quoteIdentifier(column.field, driver),
        detail: `${column.type || translateUi("coluna")} · ${table.name}`,
        kind: "column",
        score: score + (contextKind === "column" || qualified ? -45 : 5),
      })
    }
  }

  if (qualifier) {
    if (qualifiedTable) {
      addColumns(qualifiedTable)
    } else {
      const schemaTables = tables.filter((table) => sameIdentifier(table.schema, qualifier))
      for (const table of schemaTables) addTable(table, true)
    }
  } else {
    const columnTables = new Map<string, DatabaseTable>()
    for (const table of refs.values()) columnTables.set(sqlAutocompleteTableKey(table), table)
    if (selectedTable) columnTables.set(sqlAutocompleteTableKey(selectedTable), selectedTable)
    for (const table of columnTables.values()) addColumns(table)
    for (const table of tables) addTable(table)
    for (const sqlFunction of SQL_FUNCTIONS) {
      const score = matchScore(sqlFunction, prefix)
      if (!Number.isFinite(score)) continue
      candidates.push({
        id: `function:${sqlFunction}`,
        label: sqlFunction,
        insertText: sqlFunction,
        detail: translateUi("função SQL"),
        kind: "function",
        score: score + (contextKind === "column" ? -5 : 5),
      })
    }
    for (const keyword of SQL_KEYWORDS) {
      const score = matchScore(keyword, prefix)
      if (!Number.isFinite(score)) continue
      candidates.push({
        id: `keyword:${keyword}`,
        label: keyword,
        insertText: keyword,
        detail: translateUi("palavra-chave SQL"),
        kind: "keyword",
        score: score + (contextKind === "mixed" ? 0 : 10),
      })
    }
  }

  candidates.sort(
    (left, right) => left.score - right.score || left.label.localeCompare(right.label),
  )
  return {
    ...emptyContext,
    items: candidates.slice(0, 60),
  }
}
