import type { HttpResponseBodyKind, HttpResponseSnapshot } from "../model/types"

export const DEFAULT_HTTP_CAPTURE_LIMIT = 1_500_000

export async function readLimitedResponseBody(
  response: Response,
  limit = DEFAULT_HTTP_CAPTURE_LIMIT,
) {
  const reader = response.body?.getReader()
  if (!reader) return { body: new Uint8Array(), truncated: false }

  const chunks: Uint8Array[] = []
  let capturedBytes = 0
  let truncated = false

  while (capturedBytes < limit) {
    const next = await reader.read()
    if (next.done) break

    const remaining = limit - capturedBytes
    const chunk = next.value.length > remaining ? next.value.subarray(0, remaining) : next.value
    chunks.push(chunk)
    capturedBytes += chunk.length

    if (chunk.length !== next.value.length) {
      truncated = true
      break
    }
  }

  if (!truncated && capturedBytes === limit) {
    const next = await reader.read()
    truncated = !next.done
  }
  if (truncated) await reader.cancel()

  const body = new Uint8Array(capturedBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return { body, truncated }
}

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
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    const unsafe = code <= 8 || (code >= 11 && code <= 31) || (code >= 127 && code <= 159)
    if (!unsafe) return character
    return code === 27 ? "␛" : "�"
  }).join("")
}

export function responseBodyText(response: HttpResponseSnapshot, pretty = true) {
  if (response.bodyKind === "binary") {
    return sanitizeTerminalText(
      `Resposta binária · ${response.contentType || "tipo desconhecido"} · ${response.capturedBytes} bytes`,
    )
  }

  const text = new TextDecoder().decode(response.body)
  if (!pretty || response.bodyKind !== "json" || !text.trim()) return sanitizeTerminalText(text)
  try {
    return sanitizeTerminalText(JSON.stringify(JSON.parse(text), null, 2))
  } catch {
    return sanitizeTerminalText(text)
  }
}
