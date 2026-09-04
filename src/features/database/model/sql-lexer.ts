export type SqlHighlightGroup =
  | "comment"
  | "constant"
  | "function"
  | "keyword"
  | "number"
  | "operator"
  | "property"
  | "punctuation"
  | "string"
  | "type"

export type SqlHighlightSpan = {
  line: number
  start: number
  end: number
  group: SqlHighlightGroup
}

export type SqlDialect = "mcp-mysql" | "mysql" | "postgres" | "sqlite"

export function sqlEditorLineCount(sql: string) {
  return sql.split("\n").length
}

export function sqlEditorGutterWidth(sql: string) {
  return Math.max(3, String(sqlEditorLineCount(sql)).length + 2)
}

export const SQL_KEYWORDS = [
  "ABORT",
  "ACTION",
  "ADD",
  "AFTER",
  "ALL",
  "ALTER",
  "ANALYZE",
  "AND",
  "AS",
  "ASC",
  "ATTACH",
  "AUTOINCREMENT",
  "BEFORE",
  "BEGIN",
  "BETWEEN",
  "BY",
  "CASCADE",
  "CASE",
  "CHECK",
  "COLLATE",
  "COLUMN",
  "COMMIT",
  "CONFLICT",
  "CONSTRAINT",
  "CREATE",
  "CROSS",
  "CURRENT",
  "DATABASE",
  "DEFAULT",
  "DEFERRABLE",
  "DEFERRED",
  "DELETE",
  "DESC",
  "DETACH",
  "DISTINCT",
  "DO",
  "DROP",
  "EACH",
  "ELSE",
  "END",
  "ESCAPE",
  "EXCEPT",
  "EXCLUDE",
  "EXISTS",
  "EXPLAIN",
  "FAIL",
  "FILTER",
  "FIRST",
  "FOLLOWING",
  "FOR",
  "FOREIGN",
  "FROM",
  "FULL",
  "GENERATED",
  "GLOB",
  "GRANT",
  "GROUP",
  "HAVING",
  "IF",
  "IGNORE",
  "ILIKE",
  "IMMEDIATE",
  "IN",
  "INDEX",
  "INDEXED",
  "INITIALLY",
  "INNER",
  "INSERT",
  "INSTEAD",
  "INTERSECT",
  "INTO",
  "IS",
  "ISNULL",
  "JOIN",
  "KEY",
  "LAST",
  "LEFT",
  "LIKE",
  "LIMIT",
  "MATCH",
  "MATERIALIZED",
  "NATURAL",
  "NO",
  "NOT",
  "NOTHING",
  "NOTNULL",
  "NULLS",
  "OF",
  "OFFSET",
  "ON",
  "OR",
  "ORDER",
  "OTHERS",
  "OUTER",
  "OVER",
  "PARTITION",
  "PLAN",
  "PRAGMA",
  "PRECEDING",
  "PRIMARY",
  "QUERY",
  "RAISE",
  "RECURSIVE",
  "REFERENCES",
  "REINDEX",
  "RELEASE",
  "RENAME",
  "REPLACE",
  "RESTRICT",
  "RETURNING",
  "RIGHT",
  "ROLLBACK",
  "ROW",
  "ROWS",
  "SAVEPOINT",
  "SELECT",
  "SET",
  "TABLE",
  "TEMP",
  "TEMPORARY",
  "THEN",
  "TIES",
  "TO",
  "TRANSACTION",
  "TRIGGER",
  "TRUNCATE",
  "UNBOUNDED",
  "UNION",
  "UNIQUE",
  "UPDATE",
  "USING",
  "VACUUM",
  "VALUES",
  "VIEW",
  "VIRTUAL",
  "WHEN",
  "WHERE",
  "WINDOW",
  "WITH",
  "WITHOUT",
] as const

const KEYWORDS = new Set<string>(SQL_KEYWORDS)

const TYPES = new Set([
  "BIGINT",
  "BIGSERIAL",
  "BINARY",
  "BIT",
  "BLOB",
  "BOOLEAN",
  "CHAR",
  "CHARACTER",
  "CLOB",
  "DATE",
  "DATETIME",
  "DEC",
  "DECIMAL",
  "DOUBLE",
  "ENUM",
  "FLOAT",
  "INET",
  "INT",
  "INT2",
  "INT4",
  "INT8",
  "INTEGER",
  "INTERVAL",
  "JSON",
  "JSONB",
  "MEDIUMINT",
  "MONEY",
  "NCHAR",
  "NUMERIC",
  "NVARCHAR",
  "REAL",
  "SERIAL",
  "SERIAL2",
  "SERIAL4",
  "SERIAL8",
  "SMALLINT",
  "TEXT",
  "TIME",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "TINYINT",
  "UUID",
  "VARBINARY",
  "VARCHAR",
  "VARYING",
  "XML",
])

const CONSTANTS = new Set([
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "FALSE",
  "LOCALTIME",
  "LOCALTIMESTAMP",
  "NULL",
  "TRUE",
  "UNKNOWN",
])

function isWordStart(character: string) {
  return /[A-Za-z_\u0080-\uFFFF]/.test(character)
}

function isWordPart(character: string) {
  return /[A-Za-z0-9_$\u0080-\uFFFF]/.test(character)
}

function quotedEnd(line: string, start: number, quote: "'" | '"' | "`" | "]") {
  let cursor = start + 1
  while (cursor < line.length) {
    if (quote !== "]" && line[cursor] === "\\") {
      cursor = Math.min(line.length, cursor + 2)
      continue
    }
    if (line[cursor] !== quote) {
      cursor += 1
      continue
    }
    if (line[cursor + 1] === quote) {
      cursor += 2
      continue
    }
    return { end: cursor + 1, closed: true }
  }
  return { end: line.length, closed: false }
}

/** Tokenizes the common SQL shared by SQLite, MySQL and PostgreSQL. */
export function getSqlHighlightSpans(sql: string, dialect?: SqlDialect): SqlHighlightSpan[] {
  const spans: SqlHighlightSpan[] = []
  const lines = sql.split("\n")
  let blockComment = false
  let openQuote: "'" | '"' | "`" | "]" | null = null
  let dollarQuote = ""

  const add = (line: number, start: number, end: number, group: SqlHighlightGroup) => {
    if (end > start) spans.push({ line, start, end, group })
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ""
    let cursor = 0

    while (cursor < line.length) {
      if (blockComment) {
        const end = line.indexOf("*/", cursor)
        if (end < 0) {
          add(lineIndex, cursor, line.length, "comment")
          break
        }
        add(lineIndex, cursor, end + 2, "comment")
        blockComment = false
        cursor = end + 2
        continue
      }

      if (dollarQuote) {
        const end = line.indexOf(dollarQuote, cursor)
        if (end < 0) {
          add(lineIndex, cursor, line.length, "string")
          break
        }
        add(lineIndex, cursor, end + dollarQuote.length, "string")
        cursor = end + dollarQuote.length
        dollarQuote = ""
        continue
      }

      if (openQuote) {
        const token = quotedEnd(line, cursor - 1, openQuote)
        add(lineIndex, cursor, token.end, openQuote === "'" ? "string" : "property")
        if (token.closed) openQuote = null
        cursor = token.end
        continue
      }

      const character = line[cursor] ?? ""
      const next = line[cursor + 1] ?? ""

      if (character === "-" && next === "-") {
        add(lineIndex, cursor, line.length, "comment")
        break
      }
      if (character === "#" && (dialect === "mysql" || dialect === "mcp-mysql")) {
        add(lineIndex, cursor, line.length, "comment")
        break
      }
      if (character === "/" && next === "*") {
        const end = line.indexOf("*/", cursor + 2)
        if (end < 0) {
          add(lineIndex, cursor, line.length, "comment")
          blockComment = true
          break
        }
        add(lineIndex, cursor, end + 2, "comment")
        cursor = end + 2
        continue
      }

      if (character === "$") {
        const tag = line.slice(cursor).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
        if (tag) {
          const end = line.indexOf(tag, cursor + tag.length)
          if (end < 0) {
            add(lineIndex, cursor, line.length, "string")
            dollarQuote = tag
            break
          }
          add(lineIndex, cursor, end + tag.length, "string")
          cursor = end + tag.length
          continue
        }
      }

      if (character === "'" || character === '"' || character === "`" || character === "[") {
        const quote = character === "[" ? "]" : character
        const token = quotedEnd(line, cursor, quote)
        add(lineIndex, cursor, token.end, quote === "'" ? "string" : "property")
        if (!token.closed) openQuote = quote
        cursor = token.end
        continue
      }

      const number = line.slice(cursor).match(/^(?:0x[\dA-Fa-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/)?.[0]
      if (number) {
        add(lineIndex, cursor, cursor + number.length, "number")
        cursor += number.length
        continue
      }

      if ((character === ":" || character === "@" || character === "$") && isWordStart(next)) {
        let end = cursor + 2
        while (end < line.length && isWordPart(line[end] ?? "")) end += 1
        add(lineIndex, cursor, end, "constant")
        cursor = end
        continue
      }
      if (character === "$" && /\d/.test(next)) {
        let end = cursor + 2
        while (end < line.length && /\d/.test(line[end] ?? "")) end += 1
        add(lineIndex, cursor, end, "constant")
        cursor = end
        continue
      }
      if (character === "?") {
        add(lineIndex, cursor, cursor + 1, "constant")
        cursor += 1
        continue
      }

      if (isWordStart(character)) {
        let end = cursor + 1
        while (end < line.length && isWordPart(line[end] ?? "")) end += 1
        const word = line.slice(cursor, end).toUpperCase()
        let group: SqlHighlightGroup | null = null
        if (CONSTANTS.has(word)) group = "constant"
        else if (TYPES.has(word)) group = "type"
        else if (KEYWORDS.has(word)) group = "keyword"
        else if (line.slice(end).match(/^\s*\(/)) group = "function"
        if (group) add(lineIndex, cursor, end, group)
        cursor = end
        continue
      }

      if (/[+\-*/%=<>!~|&^:#]/.test(character)) {
        let end = cursor + 1
        while (end < line.length && /[+\-*/%=<>!~|&^:#]/.test(line[end] ?? "")) end += 1
        add(lineIndex, cursor, end, "operator")
        cursor = end
        continue
      }
      if (/[(),.;]/.test(character)) {
        add(lineIndex, cursor, cursor + 1, "punctuation")
      }
      cursor += 1
    }
  }

  return spans
}
