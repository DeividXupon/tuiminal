export type OpenCodeServerProtocol = "v1" | "v2"

export function openCodeCliProtocol(versionOutput: string): OpenCodeServerProtocol | null {
  const major = Number(/\bv?(\d+)\.\d+/u.exec(versionOutput)?.[1])
  if (!Number.isInteger(major)) return null
  return major >= 2 ? "v2" : "v1"
}

export async function readOpenCodeJsonResponse(
  response: Response,
  maximumBytes = 16 * 1024 * 1024,
) {
  if (!response.ok) throw new Error("A API do OpenCode recusou a consulta.")
  const contentLength = Number(response.headers.get("content-length") ?? 0)
  if (contentLength > maximumBytes)
    throw new Error("A resposta da API do OpenCode excedeu o limite seguro.")
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maximumBytes)
        throw new Error("A resposta da API do OpenCode excedeu o limite seguro.")
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const source = new TextDecoder()
    .decode(bytes)
    .replace(/^\uFEFF/u, "")
    .trim()
  if (!source) return null
  try {
    return JSON.parse(source)
  } catch {
    throw new Error("A API do OpenCode retornou JSON inválido.")
  }
}

async function probeOpenCodeHealth(
  baseUrl: string,
  pathname: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  try {
    const response = await fetcher(`${baseUrl}${pathname}`, { signal })
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      return null
    const value = await readOpenCodeJsonResponse(response, 64 * 1024)
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export async function detectOpenCodeServerProtocol(
  baseUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<OpenCodeServerProtocol | null> {
  const [legacy, current] = await Promise.all([
    probeOpenCodeHealth(baseUrl, "/global/health", signal, fetcher),
    probeOpenCodeHealth(baseUrl, "/api/health", signal, fetcher),
  ])
  if (legacy?.healthy === true) return "v1"
  if (typeof current?.pid === "number") return "v2"
  if (current?.healthy === true) return "v1"
  return null
}

export function openCodeTuiCommand(
  executable: string,
  baseUrl: string,
  directory: string,
  resumeThreadId: string | undefined,
  protocol: OpenCodeServerProtocol,
) {
  if (protocol === "v2")
    return [
      executable,
      "--server",
      baseUrl,
      ...(resumeThreadId ? ["--session", resumeThreadId] : []),
      directory,
    ]
  return [
    executable,
    "attach",
    baseUrl,
    "--dir",
    directory,
    ...(resumeThreadId ? ["--session", resumeThreadId] : []),
  ]
}
