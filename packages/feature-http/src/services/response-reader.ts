export {
  classifyResponseBody,
  responseBodyText,
  sanitizeTerminalText,
} from "../model/response"

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

  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      if (!next.value.length) continue

      const remaining = limit - capturedBytes
      if (remaining > 0) {
        const chunk = next.value.length > remaining ? next.value.subarray(0, remaining) : next.value
        chunks.push(chunk)
        capturedBytes += chunk.length
      }
      if (next.value.length > remaining) {
        truncated = true
        break
      }
    }
    if (truncated) await reader.cancel()
  } finally {
    reader.releaseLock()
  }

  const onlyChunk = chunks.length === 1 ? chunks[0] : undefined
  if (onlyChunk && onlyChunk.length === capturedBytes) return { body: onlyChunk, truncated }

  const body = new Uint8Array(capturedBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return { body, truncated }
}
