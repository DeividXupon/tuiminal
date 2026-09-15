import { type SqlToken, sqlIdentifier, sqlKeyword, sqlTokens } from "./sql-tokens"
import type { DatabaseDriver } from "./types"

// A convenience allowlist, not the security boundary: native reads also run in
// READ ONLY transactions / readonly SQLite handles. Unknown routines require RW.
const READ_FUNCTIONS = new Set(
  `
  ABS AVG COUNT SUM TOTAL MIN MAX ROUND CEIL CEILING FLOOR POWER SQRT
  LENGTH OCTET_LENGTH CHAR_LENGTH CHARACTER_LENGTH LOWER UPPER TRIM LTRIM RTRIM
  SUBSTR SUBSTRING REPLACE CONCAT CONCAT_WS COALESCE IFNULL NULLIF CAST CONVERT
  DATE DATETIME TIME STRFTIME JULIANDAY UNIXEPOCH DATE_TRUNC EXTRACT STRPOS POSITION
  JSON_EXTRACT JSON_TYPE JSON_VALID JSON_ARRAY_LENGTH JSON_OBJECT JSON_ARRAY
  JSON_GROUP_ARRAY JSON_AGG ARRAY_AGG STRING_AGG GROUP_CONCAT
  ROW_NUMBER RANK DENSE_RANK LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE
  NOW CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP LOCALTIME LOCALTIMESTAMP
  CURDATE CURTIME DATE_FORMAT IF IIF FORMAT QUOTE_IDENT QUOTE_LITERAL
  SLEEP PG_SLEEP
`
    .trim()
    .split(/\s+/),
)
const PAREN_SYNTAX = new Set([
  "AS",
  "IN",
  "EXISTS",
  "OVER",
  "FILTER",
  "SELECT",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "ON",
  "BY",
  "FROM",
  "HAVING",
  "WHEN",
  "THEN",
  "ELSE",
  "VALUES",
])
const WRITING_WORDS = new Set(
  `
  INSERT UPDATE DELETE MERGE CREATE ALTER DROP TRUNCATE CALL COPY GRANT REVOKE
  VACUUM REINDEX ATTACH DETACH INTO OUTFILE DUMPFILE SET RESET DO EXECUTE
  COMMIT ROLLBACK BEGIN START SAVEPOINT RELEASE LOCK UNLOCK LOAD
`
    .trim()
    .split(/\s+/),
)
const READ_PRAGMAS = new Set(
  `
  DATABASE_LIST COLLATION_LIST COMPILE_OPTIONS FUNCTION_LIST MODULE_LIST PRAGMA_LIST
  TABLE_LIST USER_VERSION SCHEMA_VERSION APPLICATION_ID PAGE_COUNT FREELIST_COUNT
  ENCODING JOURNAL_MODE QUERY_ONLY FOREIGN_KEYS BUSY_TIMEOUT
`
    .trim()
    .split(/\s+/),
)
const READ_PRAGMAS_WITH_ARGUMENT = new Set([
  "TABLE_INFO",
  "TABLE_XINFO",
  "INDEX_INFO",
  "INDEX_XINFO",
  "INDEX_LIST",
  "FOREIGN_KEY_LIST",
  "INTEGRITY_CHECK",
  "QUICK_CHECK",
  "FOREIGN_KEY_CHECK",
])

function readPragma(tokens: SqlToken[], driver: DatabaseDriver) {
  if (driver !== "sqlite") return false
  const start = tokens[2]?.value === "." ? 3 : 1
  const name = sqlIdentifier(tokens[start], driver)?.toUpperCase()
  if (!name) return false
  const tail = tokens.slice(start + 1)
  if (READ_PRAGMAS.has(name)) return tail.length === 0
  if (!READ_PRAGMAS_WITH_ARGUMENT.has(name)) return false
  if (!tail.length) return true
  return (
    tail.length === 3 &&
    tail[0]?.value === "(" &&
    tail[2]?.value === ")" &&
    (tail[1]?.kind === "literal" || Boolean(sqlIdentifier(tail[1], driver)))
  )
}

function isCteColumnList(tokens: SqlToken[], index: number) {
  if (!sqlKeyword(tokens[0], "WITH")) return false
  let depth = 0
  for (const token of tokens.slice(0, index)) {
    if (token.kind === "symbol" && token.value === "(") depth += 1
    if (token.kind === "symbol" && token.value === ")") depth -= 1
    if (depth === 0 && sqlKeyword(token, "SELECT")) return false
  }
  if (depth !== 0) return false
  const before = tokens[index - 1]
  if (!(sqlKeyword(before, "WITH") || sqlKeyword(before, "RECURSIVE") || before?.value === ","))
    return false
  const close = tokens.findIndex((token, position) => position > index && token.value === ")")
  return (
    close > index &&
    sqlKeyword(tokens[close + 1], "AS") &&
    tokens
      .slice(index + 2, close)
      .every((token) => token.kind === "word" || token.kind === "quoted" || token.value === ",")
  )
}

function routineAllowed(tokens: SqlToken[], index: number, driver: DatabaseDriver) {
  const token = tokens[index]
  if (tokens[index + 1]?.value !== "(") return true
  const name = sqlIdentifier(token, driver)
  if (!name) return token?.kind === "symbol"
  if (token?.kind === "word" && PAREN_SYNTAX.has(name.toUpperCase())) return true
  if (isCteColumnList(tokens, index)) return true
  if (!READ_FUNCTIONS.has(name.toUpperCase())) return false
  if (tokens[index - 1]?.value !== ".") return true
  return driver === "postgres" && sqlIdentifier(tokens[index - 2], driver) === "pg_catalog"
}

function readSelect(tokens: SqlToken[], driver: DatabaseDriver) {
  if (!tokens.some((token) => sqlKeyword(token, "SELECT"))) return false
  if (tokens.some((token) => token.kind === "word" && WRITING_WORDS.has(token.value.toUpperCase())))
    return false
  if (tokens.some((token) => token.kind === "symbol" && ["@", ":="].includes(token.value)))
    return false
  return tokens.every((_token, index) => routineAllowed(tokens, index, driver))
}

function classifyTokens(tokens: SqlToken[], driver: DatabaseDriver): boolean {
  if (sqlKeyword(tokens[0], "PRAGMA")) return readPragma(tokens, driver)
  if (sqlKeyword(tokens[0], "EXPLAIN")) {
    const query = tokens.findIndex(
      (token) => sqlKeyword(token, "SELECT") || sqlKeyword(token, "WITH"),
    )
    // Never search past a non-read statement to a SELECT in its RETURNING/body.
    if (
      query < 0 ||
      tokens
        .slice(1, query)
        .some((token) => token.kind === "word" && WRITING_WORDS.has(token.value.toUpperCase()))
    )
      return false
    return readSelect(tokens.slice(query), driver)
  }
  if (sqlKeyword(tokens[0], "SELECT") || sqlKeyword(tokens[0], "WITH"))
    return readSelect(tokens, driver)
  if (["SHOW", "DESCRIBE", "DESC"].some((command) => sqlKeyword(tokens[0], command))) {
    return (
      !tokens.some((token) => sqlKeyword(token, "ANALYZE")) &&
      tokens.every((_token, index) => routineAllowed(tokens, index, driver))
    )
  }
  return false
}

export function isReadOnlySql(sql: string, driver: DatabaseDriver = "postgres") {
  const tokens = sqlTokens(sql, driver)
  if (!tokens?.length) return false
  if (tokens.at(-1)?.kind === "symbol" && tokens.at(-1)?.value === ";") tokens.pop()
  if (tokens.some((token) => token.kind === "symbol" && token.value === ";")) return false
  return classifyTokens(tokens, driver)
}
