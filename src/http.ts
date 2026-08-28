export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export type HttpRequestDraft = {
  method: HttpMethod
  url: string
  headersText: string
  body: string
}

export type HttpResponseSnapshot = {
  url: string
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: string
  contentType: string
  durationMs: number
  size: number
  truncated: boolean
}

const MAX_RESPONSE_BYTES = 1_500_000

export function normalizeHttpUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error("Informe uma URL para enviar a requisição.")

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error("URL inválida. Exemplo: http://localhost:8000/api")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("A URL deve usar HTTP ou HTTPS.")
  }

  return parsed.toString()
}

export function parseHttpHeaders(source: string) {
  const headers = new Headers()

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) return

    const separator = line.indexOf(":")
    if (separator <= 0) {
      throw new Error(`Header inválido na linha ${index + 1}. Use Nome: valor`)
    }

    const name = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (!name) {
      throw new Error(`Header sem nome na linha ${index + 1}.`)
    }
    headers.append(name, value)
  })

  return headers
}

function responseIsText(contentType: string) {
  return contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("graphql") ||
    contentType.includes("x-www-form-urlencoded")
}

function formatResponseBody(body: string, contentType: string) {
  if (!contentType.includes("json") || !body.trim()) return body

  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

async function readResponseBytes(response: Response) {
  if (!response.body) {
    return { bytes: new Uint8Array(), truncated: false }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const remaining = MAX_RESPONSE_BYTES - size
    if (remaining <= 0) {
      truncated = true
      await reader.cancel()
      break
    }

    const chunk = value.length > remaining ? value.slice(0, remaining) : value
    chunks.push(chunk)
    size += chunk.length

    if (chunk.length < value.length) {
      truncated = true
      await reader.cancel()
      break
    }
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }

  return { bytes, truncated }
}

export async function executeHttpRequest(
  draft: HttpRequestDraft,
  signal?: AbortSignal,
): Promise<HttpResponseSnapshot> {
  const url = normalizeHttpUrl(draft.url)
  const headers = parseHttpHeaders(draft.headersText)
  const allowsBody = draft.method !== "GET" && draft.method !== "HEAD"
  const body = allowsBody && draft.body.trim() ? draft.body : undefined

  if (body && !headers.has("content-type")) {
    try {
      JSON.parse(body)
      headers.set("content-type", "application/json")
    } catch {
      headers.set("content-type", "text/plain; charset=utf-8")
    }
  }

  const timeoutSignal = AbortSignal.timeout(30_000)
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal
  const startedAt = performance.now()
  const response = await fetch(url, {
    method: draft.method,
    headers,
    body,
    redirect: "follow",
    signal: requestSignal,
  })
  const contentType = response.headers.get("content-type") ?? ""
  const { bytes, truncated } = await readResponseBytes(response)
  const durationMs = performance.now() - startedAt
  const decodedBody = responseIsText(contentType)
    ? new TextDecoder().decode(bytes)
    : `Resposta binária (${contentType || "tipo desconhecido"})`

  return {
    url: response.url || url,
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    body: formatResponseBody(decodedBody, contentType),
    contentType,
    durationMs,
    size: bytes.length,
    truncated,
  }
}
