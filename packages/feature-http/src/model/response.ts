import type { HttpResponseBodyKind, HttpResponseSnapshot } from "./types"

export type HttpTextMatch = { start: number; end: number; line: number; column: number }

export function classifyResponseBody(contentType: string): HttpResponseBodyKind {
  const normalized = contentType.toLowerCase()
  if (normalized.includes("json")) return "json"
  if (normalized.includes("xml")) return "xml"
  if (normalized.includes("html")) return "html"
  if (
    normalized.startsWith("text/") ||
    normalized.includes("javascript") ||
    normalized.includes("graphql") ||
    normalized.includes("x-www-form-urlencoded")
  ) {
    return "text"
  }
  return "binary"
}

export function sanitizeTerminalText(value: string) {
  let output = ""
  let safeStart = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    const unsafe = code <= 0x08 || (code >= 0x0b && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)
    if (!unsafe) continue
    output += value.slice(safeStart, index)
    output += code === 0x1b ? "␛" : "�"
    safeStart = index + 1
  }
  return safeStart ? output + value.slice(safeStart) : value
}

export function responseBodyText(
  response: HttpResponseSnapshot,
  pretty = true,
  maximumCharacters?: number,
) {
  if (response.bodyKind === "binary") {
    return sanitizeTerminalText(
      `Resposta binária · ${response.contentType || "tipo desconhecido"} · ${response.capturedBytes} bytes`,
    )
  }

  const byteLimit =
    maximumCharacters === undefined
      ? response.body.length
      : Math.min(response.body.length, (maximumCharacters + 1) * 4)
  const decoded = new TextDecoder().decode(response.body.subarray(0, byteLimit))
  const text = maximumCharacters === undefined ? decoded : decoded.slice(0, maximumCharacters + 1)
  if (!pretty || response.bodyKind !== "json" || !text.trim()) return sanitizeTerminalText(text)
  try {
    return sanitizeTerminalText(JSON.stringify(JSON.parse(text), null, 2))
  } catch {
    return sanitizeTerminalText(text)
  }
}

export function findHttpTextMatches(source: string, query: string) {
  if (!query) return []
  const needle = query.toLocaleLowerCase()
  const haystack = source.toLocaleLowerCase()
  const matches: HttpTextMatch[] = []
  let offset = 0
  let line = 1
  let lineStart = 0
  let nextLineBreak = source.indexOf("\n")
  while (offset <= haystack.length - needle.length) {
    const start = haystack.indexOf(needle, offset)
    if (start < 0) break
    while (nextLineBreak >= 0 && nextLineBreak < start) {
      line += 1
      lineStart = nextLineBreak + 1
      nextLineBreak = source.indexOf("\n", lineStart)
    }
    matches.push({
      start,
      end: start + query.length,
      line,
      column: start - lineStart + 1,
    })
    offset = start + Math.max(1, needle.length)
  }
  return matches
}

export function withHttpLineNumbers(source: string) {
  const lines = source.split("\n")
  const digits = String(lines.length).length
  return lines.map((line, index) => `${String(index + 1).padStart(digits)} │ ${line}`).join("\n")
}

function foldedJsonValue(value: unknown, depth: number, foldAtDepth: number): unknown {
  if (depth >= foldAtDepth && value !== null && typeof value === "object") {
    return Array.isArray(value)
      ? `[…] ${value.length} itens`
      : `{…} ${Object.keys(value).length} campos`
  }
  if (Array.isArray(value)) {
    return value.map((item) => foldedJsonValue(item, depth + 1, foldAtDepth))
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        foldedJsonValue(item, depth + 1, foldAtDepth),
      ]),
    )
  }
  return value
}

export function foldHttpJson(source: string, foldAtDepth: number) {
  try {
    return JSON.stringify(foldedJsonValue(JSON.parse(source), 0, foldAtDepth), null, 2)
  } catch {
    return source
  }
}

function jsonPathTokens(path: string) {
  const normalized = path.trim().replace(/^\$\.?/, "")
  if (!normalized) return []
  const tokens: Array<string | number> = []
  const pattern = /(?:^|\.)([A-Za-z_$][\w$-]*)|\[(\d+)\]|\["((?:[^"\\]|\\.)*)"\]/g
  let consumed = 0
  for (const match of normalized.matchAll(pattern)) {
    if (match.index !== consumed) throw new Error("JSON path inválido.")
    if (match[1] !== undefined) tokens.push(match[1])
    else if (match[2] !== undefined) tokens.push(Number(match[2]))
    else tokens.push(JSON.parse(`"${match[3] ?? ""}"`))
    consumed = (match.index ?? 0) + match[0].length
  }
  if (consumed !== normalized.length) throw new Error("JSON path inválido.")
  return tokens
}

export function isValidHttpJsonPathExpression(path: string) {
  try {
    jsonPathTokens(path)
    return Boolean(path.trim())
  } catch {
    return false
  }
}

export function evaluateHttpJsonPath(source: string, path: string) {
  let value: unknown = JSON.parse(source)
  for (const token of jsonPathTokens(path)) {
    if (value === null || typeof value !== "object") return undefined
    value = (value as Record<string | number, unknown>)[token]
  }
  return value
}

export type HttpDiffLine = { kind: "same" | "add" | "remove"; text: string }

export function diffHttpText(before: string, after: string, maximumLines = 500): HttpDiffLine[] {
  const left = before.split("\n").slice(0, maximumLines)
  const right = after.split("\n").slice(0, maximumLines)
  const lengths = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1))
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        left[i] === right[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }
  const result: HttpDiffLine[] = []
  let i = 0
  let j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      result.push({ kind: "same", text: left[i]! })
      i += 1
      j += 1
    } else if (
      j < right.length &&
      (i >= left.length || lengths[i]![j + 1]! >= lengths[i + 1]![j]!)
    ) {
      result.push({ kind: "add", text: right[j]! })
      j += 1
    } else {
      result.push({ kind: "remove", text: left[i]! })
      i += 1
    }
  }
  return result
}
