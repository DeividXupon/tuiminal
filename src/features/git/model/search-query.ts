type QueryToken = { text: string; complete: boolean }
type QueryQualifier = { name: string; value: string }

function quotedEnd(value: string, start: number) {
  const quote = value[start]
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === "\\") index += 1
    else if (value[index] === quote) return index + 1
  }
  return null
}

function startsQuote(value: string, index: number, tokenStart: number) {
  if (value[index] === '"') return true
  // Keep existing single-quoted filters without treating don't as an open quote.
  return value[index] === "'" && (index === tokenStart || /[:,(]/.test(value[index - 1] ?? ""))
}

function queryTokens(value: string): QueryToken[] {
  const tokens: QueryToken[] = []
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    if (/\s/.test(value[index] ?? "")) {
      if (index > start) tokens.push({ text: value.slice(start, index), complete: true })
      start = index + 1
    } else if (startsQuote(value, index, start)) {
      const end = quotedEnd(value, index)
      if (end === null) {
        tokens.push({ text: value.slice(start), complete: false })
        return tokens
      }
      index = end - 1
    }
  }
  if (start < value.length) tokens.push({ text: value.slice(start), complete: true })
  return tokens
}

function tokenQualifier(token: QueryToken): QueryQualifier | null {
  // A quoted phrase is one token, so qualifier-looking words inside it are data.
  const match = /^([a-z-]+):(.+)$/i.exec(token.text)
  if (!match?.[1] || !match[2]) return null
  let value = match[2]
  if ((value[0] === '"' || value[0] === "'") && quotedEnd(value, 0) === value.length) {
    value = value.slice(1, -1).replace(/\\(["'\\])/g, "$1")
  }
  if (!value) return null
  return { name: match[1].toLowerCase(), value: value.toLowerCase() }
}

export function normalizeGitHubSearchQuery(value: string) {
  return queryTokens(value.trim())
    .map((token) => token.text)
    .join(" ")
}

export function readGitHubSearchQuery(value: string) {
  const tokens = queryTokens(value.trim())
  if (tokens.some((token) => !token.complete)) {
    throw new Error("Feche as aspas na query do GitHub.")
  }
  return {
    normalized: tokens.map((token) => token.text).join(" "),
    qualifiers: tokens.flatMap((token) => {
      const qualifier = tokenQualifier(token)
      return qualifier ? [qualifier] : []
    }),
  }
}

export function hasGitHubSearchQualifier(
  qualifiers: readonly QueryQualifier[],
  name: string,
  value?: string,
) {
  return qualifiers.some(
    (qualifier) => qualifier.name === name && (value === undefined || qualifier.value === value),
  )
}
