import type { DatabaseDriver } from "./types"

export type SqlToken = {
  kind: "word" | "quoted" | "literal" | "symbol"
  value: string
  raw: string
  start: number
  end: number
}

function quotedEnd(sql: string, start: number, delimiter: string) {
  const closing = delimiter === "[" ? "]" : delimiter
  for (let cursor = start + 1; cursor < sql.length; cursor += 1) {
    // Backslash interpretation depends on connection SQL modes. Do not guess.
    if (sql[cursor] === "\\") return -1
    if (sql[cursor] !== closing) continue
    if (sql[cursor + 1] !== closing) return cursor + 1
    cursor += 1
  }
  return -1
}

function commentEnd(sql: string, start: number, driver: DatabaseDriver) {
  if (sql.startsWith("/*", start)) {
    // MySQL/MariaDB executable comments are SQL, not ignorable whitespace.
    if (/^\/\*(?:!|M!)/i.test(sql.slice(start, start + 5))) return -1
    const end = sql.indexOf("*/", start + 2)
    if (end < 0 || sql.slice(start + 2, end).includes("/*")) return -1
    return end + 2
  }
  const mysql = driver === "mysql" || driver === "mcp-mysql"
  const line = sql.startsWith("--", start) || (mysql && sql[start] === "#")
  if (!line) return start
  if (sql.startsWith("--", start) && !/\s/.test(sql[start + 2] ?? "\n")) return -1
  const end = sql.indexOf("\n", start)
  return end < 0 ? sql.length : end
}

function readToken(sql: string, start: number): SqlToken | null {
  const opening = sql[start] ?? ""
  const dollar = sql.slice(start).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
  if (dollar) {
    const close = sql.indexOf(dollar, start + dollar.length)
    if (close < 0) return null
    const end = close + dollar.length
    return { kind: "literal", value: "", raw: sql.slice(start, end), start, end }
  }
  if (["'", '"', "`", "["].includes(opening)) {
    const end = quotedEnd(sql, start, opening)
    if (end < 0) return null
    const raw = sql.slice(start, end)
    const closing = opening === "[" ? "]" : opening
    const value = raw.slice(1, -1).replaceAll(closing + closing, closing)
    return { kind: opening === "'" ? "literal" : "quoted", value, raw, start, end }
  }
  const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(start))?.[0]
  const raw = word ?? opening
  return { kind: word ? "word" : "symbol", value: raw, raw, start, end: start + raw.length }
}

/** Conservative lexer, not an SQL validator. Unsupported/ambiguous syntax fails closed. */
export function sqlTokens(sql: string, driver: DatabaseDriver = "postgres"): SqlToken[] | null {
  const tokens: SqlToken[] = []
  let cursor = 0
  while (cursor < sql.length) {
    if (/\s/.test(sql[cursor] ?? "")) {
      cursor += 1
      continue
    }
    const afterComment = commentEnd(sql, cursor, driver)
    if (afterComment < 0) return null
    if (afterComment !== cursor) {
      cursor = afterComment
      continue
    }
    const token = readToken(sql, cursor)
    if (!token) return null
    tokens.push(token)
    cursor = token.end
  }
  return tokens
}

export function sqlKeyword(token: SqlToken | undefined, keyword: string) {
  return token?.kind === "word" && token.value.toUpperCase() === keyword
}

export function sqlIdentifier(token: SqlToken | undefined, driver: DatabaseDriver) {
  if (!token) return null
  if (token.kind === "word") return driver === "postgres" ? token.value.toLowerCase() : token.value
  if (token.kind !== "quoted") return null
  if (driver === "postgres" && !token.raw.startsWith('"')) return null
  if ((driver === "mysql" || driver === "mcp-mysql") && !token.raw.startsWith("`")) return null
  return token.value
}
