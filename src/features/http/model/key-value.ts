import type { HttpKeyValue } from "./types"

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
  return /authorization|proxy-authorization|cookie|token|secret|api[-_ ]?key/i.test(name)
    ? "literal-secret"
    : "normal"
}
