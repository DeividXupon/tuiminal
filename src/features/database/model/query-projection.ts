import type { DatabaseDriver } from "./types"

type SqlToken = {
  kind: "word" | "identifier" | "literal" | "symbol"
  value: string
  doubleQuoted?: boolean
}

type QueryRelation = { schema: string | null; name: string; alias: string | null }

const WORD = /^[A-Za-z_][A-Za-z0-9_$]*/
const QUOTED = /^(?:"(?:""|[^"\\])*"|`(?:``|[^`\\])*`|\[[^\]\\]*\]|'(?:''|[^'\\])*')/
const DERIVED_KEYWORDS = new Set([
  "WITH",
  "JOIN",
  "UNION",
  "INTERSECT",
  "EXCEPT",
  "DISTINCT",
  "GROUP",
  "HAVING",
  "WINDOW",
])
const CLAUSE_KEYWORDS = new Set(["WHERE", "ORDER", "LIMIT", "OFFSET", "FETCH", "FOR"])
const VALUE_KEYWORDS = new Set([
  "NULL",
  "TRUE",
  "FALSE",
  "USER",
  "CURRENT_USER",
  "SESSION_USER",
  "SYSTEM_USER",
  "CURRENT_ROLE",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "CURRENT_CATALOG",
  "CURRENT_SCHEMA",
  "LOCALTIME",
  "LOCALTIMESTAMP",
])

function blockCommentEnd(sql: string, start: number) {
  for (let index = start + 2; index < sql.length - 1; index += 1) {
    // PostgreSQL nests comments, but MySQL/SQLite do not. Reject that ambiguity.
    if (sql.startsWith("/*", index)) return -1
    if (sql.startsWith("*/", index)) return index + 2
  }
  return -1
}

function ignoredPrefixLength(sql: string) {
  const whitespace = sql.match(/^\s+/)?.[0]
  if (whitespace) return whitespace.length
  if (sql.startsWith("--")) {
    if (sql.length > 2 && !/\s/.test(sql[2] ?? "")) return -1
    const end = sql.indexOf("\n")
    return end < 0 ? sql.length : end + 1
  }
  if (sql.startsWith("/*")) {
    if (/^\/\*(?:!|M!)/i.test(sql)) return -1
    return blockCommentEnd(sql, 0)
  }
  return 0
}

function quotedToken(raw: string): SqlToken {
  if (raw.startsWith("'")) return { kind: "literal", value: raw }
  const quote = raw[0] ?? ""
  return {
    kind: "identifier",
    value: raw.slice(1, -1).replaceAll(quote + quote, quote),
    doubleQuoted: quote === '"',
  }
}

// This is a conservative provenance check, not a general SQL parser. Unknown or
// dialect-dependent syntax must never turn an expression into a writable column.
function queryTokens(sql: string): SqlToken[] | null {
  const tokens: SqlToken[] = []
  for (let index = 0; index < sql.length; ) {
    const rest = sql.slice(index)
    const ignored = ignoredPrefixLength(rest)
    if (ignored < 0) return null
    if (ignored) {
      index += ignored
      continue
    }
    const token = nextQueryToken(rest)
    if (!token) return null
    tokens.push(token.token)
    index += token.length
  }
  if (tokens.at(-1)?.value === ";") tokens.pop()
  return tokens.some((token) => token.kind === "symbol" && token.value === ";") ? null : tokens
}

function nextQueryToken(sql: string) {
  const quoted = sql.match(QUOTED)?.[0]
  if (quoted) return { token: quotedToken(quoted), length: quoted.length }
  if (/^["`[']/.test(sql)) return null
  const dollar = sql.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
  if (dollar) {
    const end = sql.indexOf(dollar, dollar.length)
    if (end < 0) return null
    return { token: { kind: "literal" as const, value: "" }, length: end + dollar.length }
  }
  const word = sql.match(WORD)?.[0]
  if (word) return { token: { kind: "word" as const, value: word }, length: word.length }
  return { token: { kind: "symbol" as const, value: sql[0] ?? "" }, length: 1 }
}

function keyword(token: SqlToken | undefined, word: string) {
  return token?.kind === "word" && token.value.toUpperCase() === word
}

function identifier(token: SqlToken | undefined) {
  return token?.kind === "identifier" || token?.kind === "word"
}

function symbol(token: SqlToken | undefined, value: string) {
  return token?.kind === "symbol" && token.value === value
}

function queryRelation(tokens: SqlToken[]): QueryRelation | null {
  if (!identifier(tokens[0])) return null
  let index = 1
  let schema: string | null = null
  let name = tokens[0]?.value ?? ""
  if (symbol(tokens[index], ".")) {
    if (!identifier(tokens[index + 1])) return null
    schema = name
    name = tokens[index + 1]?.value ?? ""
    index += 2
  }
  if (keyword(tokens[index], "AS")) {
    index += 1
    if (!identifier(tokens[index])) return null
  }
  const alias = tokens[index]?.value ?? null
  if (alias !== null) {
    if (!identifier(tokens[index])) return null
    index += 1
  }
  return index === tokens.length ? { schema, name, alias } : null
}

function directProjectionQualifier(parts: string[], relation: QueryRelation) {
  if (parts.length === 1) {
    return parts[0]?.toLowerCase() === (relation.alias ?? relation.name).toLowerCase()
  }
  if (parts.length === 2) {
    return (
      !relation.alias &&
      Boolean(relation.schema) &&
      parts[0]?.toLowerCase() === relation.schema?.toLowerCase() &&
      parts[1]?.toLowerCase() === relation.name.toLowerCase()
    )
  }
  return parts.length === 0
}

function directProjection(tokens: SqlToken[], relation: QueryRelation, driver?: DatabaseDriver) {
  // MySQL treats unqualified double quotes as strings unless ANSI_QUOTES is set.
  // A qualified reference cannot be a string, and quoting a column alias is safe.
  if (
    driver !== "postgres" &&
    driver !== "sqlite" &&
    tokens[0]?.doubleQuoted &&
    !symbol(tokens[1], ".")
  )
    return false
  const parts: string[] = []
  let index = 0
  while (identifier(tokens[index])) {
    const token = tokens[index]
    if (token?.kind === "word" && VALUE_KEYWORDS.has(token.value.toUpperCase())) return false
    parts.push(token?.value ?? "")
    index += 1
    if (!symbol(tokens[index], ".")) break
    index += 1
    if (!identifier(tokens[index]) && !symbol(tokens[index], "*")) return false
  }
  if (symbol(tokens[index], "*")) {
    parts.push("*")
    index += 1
  }
  const field = parts.pop()
  if (!field) return false
  if (!directProjectionQualifier(parts, relation)) return false
  if (keyword(tokens[index], "AS")) {
    index += 1
    if (!identifier(tokens[index])) return false
  }
  if (identifier(tokens[index]) && field !== "*" && tokens[index]?.value === field) index += 1
  return index === tokens.length
}

export function directQueryRelation(sql: string, driver?: DatabaseDriver): QueryRelation | null {
  const tokens = queryTokens(sql)
  if (!tokens || !keyword(tokens[0], "SELECT")) return null
  if (
    tokens.some((token) => token.kind === "word" && DERIVED_KEYWORDS.has(token.value.toUpperCase()))
  )
    return null
  if (tokens.filter((token) => keyword(token, "SELECT")).length !== 1) return null
  if (tokens.filter((token) => keyword(token, "FROM")).length !== 1) return null
  const from = tokens.findIndex((token) => keyword(token, "FROM"))
  const clause = tokens.findIndex(
    (token, index) =>
      index > from && token.kind === "word" && CLAUSE_KEYWORDS.has(token.value.toUpperCase()),
  )
  const relation = queryRelation(tokens.slice(from + 1, clause < 0 ? undefined : clause))
  if (!relation) return null
  let start = keyword(tokens[1], "ALL") ? 2 : 1
  for (let index = start; index <= from; index += 1) {
    if (index !== from && !symbol(tokens[index], ",")) continue
    if (!directProjection(tokens.slice(start, index), relation, driver)) return null
    start = index + 1
  }
  return relation
}
