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
