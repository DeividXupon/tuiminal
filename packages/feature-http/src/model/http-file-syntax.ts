import { parseHttpExtractionValue } from "./chain-extractions"
import { parseHttpScripts } from "./request-scripts"
import { parseHttpDescription } from "./request-description"
const METHOD_TOKEN = "[!#$%&'*+.^_`|~\\dA-Z-]+"
const REQUEST_LINE = new RegExp(`^(${METHOD_TOKEN})\\s+(\\S+)(?:\\s+(HTTP\\/\\S+))?\\s*$`, "i")
const REQUEST_PREFIX = new RegExp(`^(${METHOD_TOKEN})\\s+(\\S+)\\s+(.+)$`, "i")
const EMPTY_REQUEST_LINE = new RegExp(`^${METHOD_TOKEN}$`, "i")
const SHORT_GET_LINE = /^((?:https?:\/\/|\{\{)\S+)(?:\s+(HTTP\/\S+))?\s*$/i
const INLINE_PRE_REQUEST = new RegExp(
  `^<\\s*(?:\\{%.*%\\}|\\S+)\\s+(${METHOD_TOKEN})\\s+(\\S+)(?:\\s+.*)?$`,
  "i",
)
const OPAQUE_PROTOCOL_METHODS = new Set(["GRAPHQL", "GRPC", "WEBSOCKET"])

export function httpDirectiveValue(line: string, expectedName: string): string | null {
  const match = line.match(/^\s*(?:#|\/\/)\s*@([\w-]+)(.*)$/u)
  if (match?.[1]?.toLowerCase() !== expectedName.toLowerCase()) return null
  const value = (match[2] ?? "").trim()
  return value.startsWith("=") ? value.slice(1).trim() : value
}

export function hasHttpDirective(lines: string[], name: string) {
  return lines.some((line) => httpDirectiveValue(line, name) !== null)
}

function timeoutMilliseconds(value: string) {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/i)
  if (!match?.[1]) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const multiplier =
    match[2]?.toLowerCase() === "ms" ? 1 : match[2]?.toLowerCase() === "m" ? 60_000 : 1_000
  return Math.min(2_147_483_647, Math.max(1, Math.round(amount * multiplier)))
}

export function parseHttpTimeout(lines: string[]) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const value = httpDirectiveValue(lines[index] ?? "", "timeout")
    if (value !== null) return timeoutMilliseconds(value)
  }
  return null
}

export function parseHttpRedirectDirective(lines: string[]) {
  return lines.reduce<"follow" | "manual" | null>((current, line) => {
    if (httpDirectiveValue(line, "follow-redirects") !== null) return "follow"
    if (httpDirectiveValue(line, "no-redirect") !== null) return "manual"
    return current
  }, null)
}

export type HttpRequestStart = {
  index: number
  lastUrlLine: number
  method: string
  url: string
  opaque: boolean
}

function requestLine(text: string, allowEmptyUrl: boolean) {
  const explicit = text.match(REQUEST_LINE)
  if (explicit?.[1] && explicit[2]) {
    const method = explicit[1].toUpperCase()
    return {
      method,
      url: explicit[2],
      opaque: Boolean(explicit[3]) || OPAQUE_PROTOCOL_METHODS.has(method),
    }
  }
  const prefixed = text.match(REQUEST_PREFIX)
  if (prefixed?.[1] && prefixed[2]) {
    const method = prefixed[1].toUpperCase()
    return { method, url: prefixed[2], opaque: true }
  }
  const short = text.match(SHORT_GET_LINE)
  if (short?.[1]) return { method: "GET", url: short[1], opaque: Boolean(short[2]) }
  const inlinePreRequest = text.match(INLINE_PRE_REQUEST)
  if (inlinePreRequest?.[1] && inlinePreRequest[2]) {
    return { method: inlinePreRequest[1].toUpperCase(), url: inlinePreRequest[2], opaque: true }
  }
  if (allowEmptyUrl && EMPTY_REQUEST_LINE.test(text)) {
    const method = text.toUpperCase()
    return { method, url: "", opaque: OPAQUE_PROTOCOL_METHODS.has(method) }
  }
  return null
}

function continuedRequestUrl(lines: string[], index: number, initialUrl: string) {
  let url = initialUrl
  let lastUrlLine = index
  for (let continuation = index + 1; continuation < lines.length; continuation += 1) {
    const source = lines[continuation] ?? ""
    const part = source.trim()
    if (!/^\s+/.test(source) || !/^[/?&]/.test(part)) break
    url += part
    lastUrlLine = continuation
  }
  return { url, lastUrlLine }
}

export function findHttpRequestStart(lines: string[]): HttpRequestStart | null {
  let allowEmptyUrl = hasHttpDirective(lines, "name")
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]?.trim() ?? ""
    if (!text || text.startsWith("#") || text.startsWith("//") || text.startsWith("@")) continue
    const request = requestLine(text, allowEmptyUrl)
    allowEmptyUrl = false
    if (!request) continue
    return { index, ...request, ...continuedRequestUrl(lines, index, request.url) }
  }
  return null
}

const SUPPORTED_DIRECTIVES = new Set([
  "assert",
  "auth",
  "depends",
  "description",
  "tuiminal-scripts",
  "extract",
  "extract-secret",
  "extract-value",
  "follow-redirects",
  "insecure-tls",
  "name",
  "no-cookie-jar",
  "no-log",
  "no-redirect",
  "path",
  "proxy",
  "query",
  "timeout",
])

export function usesOpaqueHttpSyntax(lines: string[], requestStart: HttpRequestStart) {
  if (requestStart.opaque) return true
  return lines.some((line, index) => {
    if (unsupportedScriptLine(line, index, requestStart.index)) return true
    const directive = line.match(/^\s*(?:#|\/\/)\s*@([\w-]+)/u)?.[1]?.toLowerCase()
    if (!directive) return false
    if (!SUPPORTED_DIRECTIVES.has(directive)) return true
    if (directive === "tuiminal-scripts")
      return invalidScriptDirective(line, index, requestStart.index)
    if (directive === "description")
      return (
        index >= requestStart.index ||
        parseHttpDescription(httpDirectiveValue(line, directive) ?? "") === null
      )
    if (directive === "extract-value")
      return !parseHttpExtractionValue(httpDirectiveValue(line, directive) ?? "")
    if (directive === "timeout") {
      const value = httpDirectiveValue(line, directive)
      return value === null || timeoutMilliseconds(value) === null
    }
    return false
  })
}

function invalidScriptDirective(line: string, index: number, requestIndex: number) {
  return (
    index >= requestIndex || !parseHttpScripts(httpDirectiveValue(line, "tuiminal-scripts") ?? "")
  )
}

function unsupportedScriptLine(line: string, index: number, start: number) {
  return /^\s*(?:<\s*\{%|>)/u.test(line) || (index < start && /^\s*<\s*\S+/u.test(line))
}
