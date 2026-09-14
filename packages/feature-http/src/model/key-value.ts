import type { HttpKeyValue, HttpMultipartPart } from "./types"

export function httpKeyValueTextInputOwnsKeyboard(id: string) {
  return ["http-key-value-name-", "http-key-value-value-", "http-key-value-file-"].some((prefix) =>
    id.startsWith(prefix),
  )
}

export function createHttpKeyValueEntry(prefix: string): HttpKeyValue {
  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    enabled: true,
    name: "",
    value: "",
    sensitivity: "normal",
  }
}

export function createHttpMultipartPart(requestId: string): HttpMultipartPart {
  return {
    id: `${requestId}-part-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    enabled: true,
    name: "",
    value: "",
    kind: "text",
    sensitivity: "normal",
  }
}

export const COMMON_HTTP_HEADER_NAMES = [
  "Accept",
  "Accept-Language",
  "Authorization",
  "Cache-Control",
  "Content-Type",
  "Cookie",
  "If-Match",
  "If-None-Match",
  "Origin",
  "Referer",
  "User-Agent",
  "X-API-Key",
  "X-Request-ID",
] as const

export function completeHttpKeyValueName(value: string, suggestions: readonly string[]) {
  const needle = value.trim().toLowerCase()
  return suggestions.find(
    (suggestion) =>
      suggestion.toLowerCase() !== needle && suggestion.toLowerCase().startsWith(needle),
  )
}

export function httpHeaderSensitivity(name: string): HttpKeyValue["sensitivity"] {
  return /authorization|proxy-authorization|cookie|token|secret|password|passwd|session|api[-_ ]?key|(?:^|[-_ ])key(?:$|[-_ ])/i.test(
    name,
  )
    ? "literal-secret"
    : "normal"
}
