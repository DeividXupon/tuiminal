export type SqlStatementRange = {
  sql: string
  start: number
  end: number
  index: number
  total: number
}

type PendingRange = Omit<SqlStatementRange, "index" | "total">

function trimmedRange(
  sql: string,
  start: number,
  end: number,
  hasCode: boolean,
): PendingRange | null {
  if (!hasCode) return null
  let trimmedStart = start
  let trimmedEnd = end
  while (trimmedStart < trimmedEnd && /\s/.test(sql[trimmedStart] ?? "")) trimmedStart += 1
  while (trimmedEnd > trimmedStart && /\s/.test(sql[trimmedEnd - 1] ?? "")) trimmedEnd -= 1
  if (sql[trimmedEnd - 1] === ";") {
    trimmedEnd -= 1
    while (trimmedEnd > trimmedStart && /\s/.test(sql[trimmedEnd - 1] ?? "")) trimmedEnd -= 1
  }
  return {
    sql: sql.slice(trimmedStart, trimmedEnd),
    start,
    end,
  }
}

export function sqlStatementRanges(sql: string): SqlStatementRange[] {
  const ranges: PendingRange[] = []
  let statementStart = 0
  let hasCode = false
  let quote: "'" | '"' | "`" | null = null
  let dollarQuote: string | null = null
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index] ?? ""
    const next = sql[index + 1] ?? ""
    if (lineComment) {
      if (current === "\n") lineComment = false
      continue
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false
        index += 1
      }
      continue
    }
    if (dollarQuote) {
      if (sql.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1
        dollarQuote = null
      }
      continue
    }
    if (quote) {
      if (current === quote) {
        if (next === quote) index += 1
        else if (sql[index - 1] !== "\\") quote = null
      }
      continue
    }
    if (current === "-" && next === "-") {
      lineComment = true
      index += 1
      continue
    }
    if (current === "#") {
      lineComment = true
      continue
    }
    if (current === "/" && next === "*") {
      blockComment = true
      index += 1
      continue
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current
      hasCode = true
      continue
    }
    if (current === "$") {
      const openingDollarQuote = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
      if (openingDollarQuote) {
        dollarQuote = openingDollarQuote
        hasCode = true
        index += openingDollarQuote.length - 1
        continue
      }
    }
    if (current === ";") {
      const range = trimmedRange(sql, statementStart, index + 1, hasCode)
      if (range) ranges.push(range)
      statementStart = index + 1
      hasCode = false
      continue
    }
    if (!/\s/.test(current)) hasCode = true
  }

  const finalRange = trimmedRange(sql, statementStart, sql.length, hasCode)
  if (finalRange) ranges.push(finalRange)
  return ranges.map((range, index) => ({
    ...range,
    index,
    total: ranges.length,
  }))
}

export function sqlStatementAtOffset(sql: string, cursorOffset: number): SqlStatementRange | null {
  const ranges = sqlStatementRanges(sql)
  if (!ranges.length) return null
  const offset = Math.max(0, Math.min(sql.length, cursorOffset))
  const containing = ranges.find((range) => offset >= range.start && offset <= range.end)
  if (containing) return containing
  const following = ranges.find((range) => range.start > offset)
  return following ?? ranges.at(-1) ?? null
}
