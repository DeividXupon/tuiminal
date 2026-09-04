import { createHash } from "node:crypto"
import { chmod, lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises"
import { resolve } from "node:path"
import { httpHeaderSensitivity } from "../model/key-value"
import type { HttpRequestDefinition } from "../model/types"

export type HttpWorkspaceConfig = {
  version: 1
  defaultEnvironment?: string
  headers: Record<string, string>
  options: { timeoutMs?: number; followRedirects?: boolean }
  history: { persistMetadata: boolean; persistBodies: boolean }
}

export type HttpWorkspaceConfigSnapshot = {
  config: HttpWorkspaceConfig
  sourceHash: string | null
  error: string
}

export class HttpWorkspaceConfigConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HttpWorkspaceConfigConflictError"
  }
}

export const DEFAULT_HTTP_WORKSPACE_CONFIG: HttpWorkspaceConfig = {
  version: 1,
  headers: {},
  options: {},
  history: { persistMetadata: false, persistBodies: false },
}

function sourceHash(source: string) {
  return createHash("sha256").update(source).digest("hex")
}

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT"
}

async function assertRegularOrMissing(path: string) {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new HttpWorkspaceConfigConflictError(
        "A configuração HTTP precisa ser um arquivo regular.",
      )
    }
  } catch (error) {
    if (!missing(error)) throw error
  }
}

async function configPath(root: string, create: boolean) {
  const projectRoot = await realpath(root)
  const tuiminal = resolve(projectRoot, ".tuiminal")
  const directory = resolve(tuiminal, "http")
  for (const path of [tuiminal, directory]) {
    try {
      const info = await lstat(path)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new HttpWorkspaceConfigConflictError(
          "O diretório de configuração HTTP precisa permanecer dentro do projeto.",
        )
      }
    } catch (error) {
      if (!missing(error)) throw error
      if (!create) return resolve(directory, "config.json")
      await mkdir(path, { mode: 0o700 })
    }
  }
  return resolve(directory, "config.json")
}

export function parseHttpWorkspaceConfig(value: unknown): HttpWorkspaceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_HTTP_WORKSPACE_CONFIG
  }
  const input = value as Record<string, unknown>
  if (input.version !== 1) return DEFAULT_HTTP_WORKSPACE_CONFIG
  const rawHeaders =
    input.headers && typeof input.headers === "object" && !Array.isArray(input.headers)
      ? (input.headers as Record<string, unknown>)
      : {}
  const headers = Object.fromEntries(
    Object.entries(rawHeaders).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && httpHeaderSensitivity(entry[0]) === "normal",
    ),
  )
  const rawOptions =
    input.options && typeof input.options === "object" && !Array.isArray(input.options)
      ? (input.options as Record<string, unknown>)
      : {}
  const rawHistory =
    input.history && typeof input.history === "object" && !Array.isArray(input.history)
      ? (input.history as Record<string, unknown>)
      : {}
  return {
    version: 1,
    ...(typeof input.defaultEnvironment === "string"
      ? { defaultEnvironment: input.defaultEnvironment }
      : {}),
    headers,
    options: {
      ...(typeof rawOptions.timeoutMs === "number" ? { timeoutMs: rawOptions.timeoutMs } : {}),
      ...(typeof rawOptions.followRedirects === "boolean"
        ? { followRedirects: rawOptions.followRedirects }
        : {}),
    },
    history: {
      persistMetadata: rawHistory.persistMetadata === true,
      persistBodies: rawHistory.persistBodies === true,
    },
  }
}

export async function loadHttpWorkspaceConfigSnapshot(
  root: string,
): Promise<HttpWorkspaceConfigSnapshot> {
  let source: string
  try {
    const path = await configPath(root, false)
    await assertRegularOrMissing(path)
    source = await readFile(path, "utf8")
  } catch (error) {
    if (missing(error)) {
      return { config: DEFAULT_HTTP_WORKSPACE_CONFIG, sourceHash: null, error: "" }
    }
    return {
      config: DEFAULT_HTTP_WORKSPACE_CONFIG,
      sourceHash: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  try {
    return {
      config: parseHttpWorkspaceConfig(JSON.parse(source)),
      sourceHash: sourceHash(source),
      error: "",
    }
  } catch {
    return {
      config: DEFAULT_HTTP_WORKSPACE_CONFIG,
      sourceHash: sourceHash(source),
      error: "A configuração HTTP contém JSON inválido; salvar substituirá o conteúdo inválido.",
    }
  }
}

export async function loadHttpWorkspaceConfig(root: string) {
  return (await loadHttpWorkspaceConfigSnapshot(root)).config
}

export async function saveHttpWorkspaceConfig(
  root: string,
  config: HttpWorkspaceConfig,
  expectedHash: string | null,
) {
  const credentialHeader = Object.keys(config.headers).find(
    (name) => httpHeaderSensitivity(name) !== "normal",
  )
  if (credentialHeader) {
    throw new HttpWorkspaceConfigConflictError(
      `O header ${credentialHeader} contém credenciais e não pode ser salvo no workspace.`,
    )
  }
  const path = await configPath(root, true)
  await assertRegularOrMissing(path)
  const current = await readFile(path, "utf8").catch((error) => {
    if (missing(error)) return null
    throw error
  })
  if ((current ? sourceHash(current) : null) !== expectedHash) {
    throw new HttpWorkspaceConfigConflictError(
      "A configuração HTTP mudou fora do Tuiminal; reabra o editor.",
    )
  }
  const normalized = parseHttpWorkspaceConfig({
    ...config,
    history: {
      persistMetadata: config.history.persistMetadata || config.history.persistBodies,
      persistBodies: config.history.persistBodies,
    },
  })
  const content = `${JSON.stringify(normalized, null, 2)}\n`
  const temporary = `${path}.tuiminal-${process.pid}-${Date.now()}.tmp`
  const handle = await open(temporary, "wx", 0o600)
  try {
    await handle.writeFile(content, "utf8")
    await handle.sync()
    await handle.close()
    const latest = await readFile(path, "utf8").catch((error) => {
      if (missing(error)) return null
      throw error
    })
    if ((latest ? sourceHash(latest) : null) !== expectedHash) {
      throw new HttpWorkspaceConfigConflictError(
        "A configuração HTTP mudou fora do Tuiminal; reabra o editor.",
      )
    }
    await rename(temporary, path)
    await chmod(path, 0o600)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  return { config: normalized, sourceHash: sourceHash(content), error: "" }
}

export function applyHttpWorkspaceConfig(
  request: HttpRequestDefinition,
  config: HttpWorkspaceConfig,
): HttpRequestDefinition {
  const explicitNames = new Set(request.headers.map((header) => header.name.toLowerCase()))
  const inherited = Object.entries(config.headers)
    .filter(([name]) => !explicitNames.has(name.toLowerCase()))
    .map(([name, value], index) => ({
      id: `${request.id}-workspace-header-${index}`,
      enabled: true,
      name,
      value,
      sensitivity: "normal" as const,
      origin: "workspace" as const,
    }))
  const timeoutExplicit = request.options.timeoutExplicit ?? request.options.timeoutMs !== 30_000
  const redirectsExplicit =
    request.options.followRedirectsExplicit ?? !request.options.followRedirects
  return {
    ...request,
    headers: [...request.headers, ...inherited],
    options: {
      ...request.options,
      timeoutMs: timeoutExplicit
        ? request.options.timeoutMs
        : (config.options.timeoutMs ?? request.options.timeoutMs),
      followRedirects: redirectsExplicit
        ? request.options.followRedirects
        : (config.options.followRedirects ?? request.options.followRedirects),
    },
  }
}
