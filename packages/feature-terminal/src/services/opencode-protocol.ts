export type OpenCodeServerProtocol = "v1" | "v2"

export type OpenCodeIdentity = {
  protocol: OpenCodeServerProtocol
  version: string | null
}

export type OpenCodeServerCredentials = {
  username: string
  password: string
}

export function openCodeAuthorization(credentials?: OpenCodeServerCredentials) {
  if (!credentials) return undefined
  return `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`
}

export function openCodeServerEnvironment(
  environment: Record<string, string | undefined> = process.env,
  credentials?: OpenCodeServerCredentials,
) {
  const inherited = Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] =>
        entry[0] !== "OPENCODE_PASSWORD" &&
        entry[0] !== "OPENCODE_SERVER_PASSWORD" &&
        entry[0] !== "OPENCODE_SERVER_USERNAME" &&
        typeof entry[1] === "string",
    ),
  )
  return credentials
    ? {
        ...inherited,
        OPENCODE_PASSWORD: credentials.password,
        OPENCODE_SERVER_USERNAME: credentials.username,
        OPENCODE_SERVER_PASSWORD: credentials.password,
      }
    : inherited
}

/** Hides the OpenCode session tabs only in the TUI process owned by Tuiminal. */
export function openCodeTuiConfigContent(inherited?: string) {
  let config: Record<string, unknown> = {}
  if (inherited) {
    try {
      const parsed = JSON.parse(inherited)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        config = parsed as Record<string, unknown>
    } catch {
      // An invalid inherited inline config must not prevent the owned TUI from starting.
    }
  }
  const inheritedTabs = config.tabs
  const tabs =
    inheritedTabs && typeof inheritedTabs === "object" && !Array.isArray(inheritedTabs)
      ? (inheritedTabs as Record<string, unknown>)
      : {}
  const inheritedTerminal = config.terminal
  const terminal =
    inheritedTerminal && typeof inheritedTerminal === "object" && !Array.isArray(inheritedTerminal)
      ? (inheritedTerminal as Record<string, unknown>)
      : {}
  return JSON.stringify({
    ...config,
    tabs: { ...tabs, mode: "off" },
    terminal: { ...terminal, title: true },
  })
}

export function openCodeCliProtocol(versionOutput: string): OpenCodeServerProtocol | null {
  const major = Number(/\bv?(\d+)\.\d+/u.exec(versionOutput)?.[1])
  if (!Number.isInteger(major)) return null
  return major >= 2 ? "v2" : "v1"
}

export function openCodeVersion(versionOutput: string) {
  return /\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/u.exec(versionOutput)?.[1] ?? null
}

export function compatibleRemoteOpenCode(local: OpenCodeIdentity | null, remote: OpenCodeIdentity) {
  if (!local || local.protocol !== remote.protocol) return false
  if (remote.protocol !== "v2") return true
  return Boolean(local.version && remote.version && local.version === remote.version)
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
  authorization?: string,
) {
  try {
    const response = await fetcher(`${baseUrl}${pathname}`, {
      ...(authorization ? { headers: { authorization } } : {}),
      signal,
    })
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
  authorization?: string,
): Promise<OpenCodeServerProtocol | null> {
  const [legacy, current, currentInfo] = await Promise.all([
    probeOpenCodeHealth(baseUrl, "/global/health", signal, fetcher, authorization),
    probeOpenCodeHealth(baseUrl, "/api/health", signal, fetcher, authorization),
    probeOpenCodeHealth(baseUrl, "/api/info", signal, fetcher, authorization),
  ])
  if (legacy?.healthy === true) return "v1"
  if (
    typeof currentInfo?.pid === "number" ||
    openCodeCliProtocol(String(currentInfo?.version)) === "v2"
  )
    return "v2"
  if (typeof current?.pid === "number") return "v2"
  if (current?.healthy === true) return "v1"
  return null
}

export async function detectOpenCodeServerVersion(
  baseUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  authorization?: string,
) {
  const info = await probeOpenCodeHealth(baseUrl, "/api/info", signal, fetcher, authorization)
  return openCodeVersion(String(info?.version ?? ""))
}

export function openCodeTuiCommand(
  executable: string,
  baseUrl: string,
  directory: string | undefined,
  resumeThreadId: string | undefined,
  protocol: OpenCodeServerProtocol,
) {
  if (protocol === "v2")
    return [
      executable,
      "--server",
      baseUrl,
      ...(resumeThreadId ? ["--session", resumeThreadId] : []),
      ...(directory ? [directory] : []),
    ]
  return [
    executable,
    "attach",
    baseUrl,
    "--dir",
    directory ?? process.cwd(),
    ...(resumeThreadId ? ["--session", resumeThreadId] : []),
  ]
}
