import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import type { HttpHistoryEntry, HttpRedirectHop, HttpResponseBodyKind } from "../model/types"
import { budgetHttpHistory, redactHttpDiagnostic, redactHttpHistoryUrl } from "../model/history"
import { redactHttpHistoryEntry } from "../model/history-privacy"
import type { HttpWorkspaceConfig } from "./config"
import {
  atomicWriteProjectFile,
  projectFileHash,
  resolveSafeProjectFile,
} from "@xupon/tuiminal-core/storage/project-files"

const HISTORY_VERSION = 1
const MAX_HISTORY_FILE_BYTES = 3_000_000
const MAX_PERSISTED_BODY_BYTES = 250_000
const PERSISTED_BODY_BUDGET = 2_000_000
const writes = new Map<string, Promise<void>>()

type PersistedResponse = {
  url: string
  status: number
  statusText: string
  bodyKind: HttpResponseBodyKind
  contentType: string
  declaredBytes?: number
  capturedBytes: number
  truncated: boolean
  downloadedBytes?: number
  encoding: string
  redirects: HttpRedirectHop[]
  timings: { headersMs: number; downloadMs: number; totalMs: number }
  bodyBase64?: string
}

type PersistedEntry = Omit<HttpHistoryEntry, "response" | "persisted" | "privacy"> & {
  response?: PersistedResponse
}

type PersistedHistory = { version: 1; entries: PersistedEntry[] }
type PersistedHistorySnapshot = PersistedHistory & { sourceHash: string | null }

function historyPath(root: string) {
  return resolve(root, ".tuiminal", "http", "history.json")
}

function serializedResponse(
  entry: HttpHistoryEntry,
  includeBody: boolean,
): PersistedResponse | undefined {
  const response = entry.response
  if (!response) return undefined
  const body = includeBody && !entry.privacy?.hasSecrets ? response.body : undefined
  return {
    url: redactHttpHistoryUrl(response.url),
    status: response.status,
    statusText: response.statusText,
    bodyKind: response.bodyKind,
    contentType: response.contentType,
    ...(response.declaredBytes === undefined ? {} : { declaredBytes: response.declaredBytes }),
    capturedBytes: response.capturedBytes,
    truncated: response.truncated,
    ...(response.downloadedBytes === undefined
      ? {}
      : { downloadedBytes: response.downloadedBytes }),
    encoding: response.encoding,
    redirects: response.redirects.map((redirect) => ({
      ...redirect,
      url: redactHttpHistoryUrl(redirect.url),
      location: redactHttpHistoryUrl(redirect.location),
    })),
    timings: response.timings,
    ...(body && body.length <= MAX_PERSISTED_BODY_BYTES
      ? { bodyBase64: Buffer.from(body).toString("base64") }
      : {}),
  }
}

function persistableEntry(original: HttpHistoryEntry, includeBody: boolean): PersistedEntry {
  const entry = redactHttpHistoryEntry(original)
  const response = serializedResponse(entry, includeBody)
  return {
    id: entry.privacy.redactText(entry.id),
    createdAt: entry.createdAt,
    requestId: entry.privacy.redactText(entry.requestId),
    requestName: entry.requestName,
    environmentName: entry.environmentName,
    method: entry.method,
    url: redactHttpHistoryUrl(entry.url),
    status: entry.status,
    durationMs: entry.durationMs,
    error: entry.error ? redactHttpDiagnostic(entry.error) : null,
    bodyDiscarded: entry.bodyDiscarded || Boolean(entry.response?.body && !response?.bodyBase64),
    ...(response ? { response } : {}),
  }
}

function enforcePersistedBodyBudget(entries: PersistedEntry[]) {
  let remaining = PERSISTED_BODY_BUDGET
  return entries.map((entry) => {
    const encoded = entry.response?.bodyBase64
    if (!encoded) return entry
    const bytes = Math.floor((encoded.length * 3) / 4)
    if (bytes <= remaining) {
      remaining -= bytes
      return entry
    }
    const { bodyBase64: _discarded, ...response } = entry.response!
    return { ...entry, response, bodyDiscarded: true }
  })
}

const RESPONSE_BODY_KINDS = new Set<HttpResponseBodyKind>(["text", "json", "xml", "html", "binary"])

function finiteNumber(value: unknown, minimum = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
}

function parsedRedirect(value: unknown): HttpRedirectHop | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (
    !finiteNumber(input.status) ||
    typeof input.url !== "string" ||
    typeof input.location !== "string" ||
    typeof input.crossOrigin !== "boolean"
  ) {
    return null
  }
  return {
    status: input.status as number,
    url: redactHttpHistoryUrl(input.url),
    location: redactHttpHistoryUrl(input.location),
    crossOrigin: input.crossOrigin,
  }
}

function parsedTiming(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (
    !finiteNumber(input.headersMs) ||
    !finiteNumber(input.downloadMs) ||
    !finiteNumber(input.totalMs)
  ) {
    return null
  }
  return {
    headersMs: input.headersMs as number,
    downloadMs: input.downloadMs as number,
    totalMs: input.totalMs as number,
  }
}

function validPersistedBase64(value: unknown) {
  if (typeof value !== "string") return undefined
  const maximumEncodedLength = Math.ceil((MAX_PERSISTED_BODY_BYTES * 4) / 3) + 4
  if (value.length > maximumEncodedLength || value.length % 4 !== 0) return undefined
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return undefined
  }
  return Buffer.from(value, "base64").length <= MAX_PERSISTED_BODY_BYTES ? value : undefined
}

function parsedResponse(value: unknown): PersistedResponse | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  const timings = parsedTiming(input.timings)
  if (
    typeof input.url !== "string" ||
    !finiteNumber(input.status) ||
    typeof input.statusText !== "string" ||
    !RESPONSE_BODY_KINDS.has(input.bodyKind as HttpResponseBodyKind) ||
    typeof input.contentType !== "string" ||
    !finiteNumber(input.capturedBytes) ||
    typeof input.truncated !== "boolean" ||
    typeof input.encoding !== "string" ||
    !Array.isArray(input.redirects) ||
    !timings
  ) {
    return undefined
  }
  const redirects = input.redirects
    .slice(0, 20)
    .map(parsedRedirect)
    .filter((redirect): redirect is HttpRedirectHop => redirect !== null)
  const bodyBase64 = validPersistedBase64(input.bodyBase64)
  return {
    url: redactHttpHistoryUrl(input.url),
    status: input.status as number,
    statusText: input.statusText,
    bodyKind: input.bodyKind as HttpResponseBodyKind,
    contentType: input.contentType,
    ...(finiteNumber(input.declaredBytes) ? { declaredBytes: input.declaredBytes as number } : {}),
    capturedBytes: input.capturedBytes as number,
    truncated: input.truncated,
    ...(finiteNumber(input.downloadedBytes)
      ? { downloadedBytes: input.downloadedBytes as number }
      : {}),
    encoding: input.encoding,
    redirects,
    timings,
    ...(bodyBase64 ? { bodyBase64 } : {}),
  }
}

function parsedEntry(value: unknown): PersistedEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (
    typeof input.id !== "string" ||
    !finiteNumber(input.createdAt) ||
    typeof input.requestId !== "string" ||
    typeof input.requestName !== "string" ||
    typeof input.method !== "string" ||
    typeof input.url !== "string"
  ) {
    return null
  }
  const response = parsedResponse(input.response)
  return {
    id: input.id,
    createdAt: input.createdAt as number,
    requestId: input.requestId,
    requestName: input.requestName,
    environmentName: typeof input.environmentName === "string" ? input.environmentName : null,
    method: input.method,
    url: redactHttpHistoryUrl(input.url),
    status: finiteNumber(input.status) ? (input.status as number) : null,
    durationMs: finiteNumber(input.durationMs) ? (input.durationMs as number) : null,
    error: typeof input.error === "string" ? redactHttpDiagnostic(input.error) : null,
    bodyDiscarded: input.bodyDiscarded === true || Boolean(input.response && !response),
    ...(response ? { response } : {}),
  }
}

async function readPersistedHistory(root: string): Promise<PersistedHistorySnapshot> {
  let path: string
  try {
    path = (
      await resolveSafeProjectFile(root, ".tuiminal/http/history.json", {
        allowMissing: true,
      })
    ).path
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, entries: [], sourceHash: null }
    }
    throw error
  }
  try {
    if ((await stat(path)).size > MAX_HISTORY_FILE_BYTES) {
      throw new Error("O histórico HTTP persistido ultrapassa 3 MB e foi preservado.")
    }
    const source = await readFile(path, "utf8")
    const parsed = JSON.parse(source) as Record<string, unknown>
    if (parsed.version !== HISTORY_VERSION || !Array.isArray(parsed.entries)) {
      throw new Error("O histórico HTTP persistido tem formato inválido e foi preservado.")
    }
    return {
      version: 1,
      entries: parsed.entries
        .map(parsedEntry)
        .filter((entry): entry is PersistedEntry => entry !== null),
      sourceHash: projectFileHash(source),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, entries: [], sourceHash: null }
    }
    if (error instanceof SyntaxError) {
      throw new Error("O histórico HTTP contém JSON inválido e foi preservado.")
    }
    throw error
  }
}

async function writeAtomic(root: string, value: PersistedHistory, expectedHash: string | null) {
  await atomicWriteProjectFile(
    root,
    ".tuiminal/http/history.json",
    `${JSON.stringify(value, null, 2)}\n`,
    { expectedHash },
  )
}

function restoredEntry(entry: PersistedEntry): HttpHistoryEntry | null {
  if (
    !entry ||
    typeof entry.id !== "string" ||
    typeof entry.createdAt !== "number" ||
    typeof entry.requestId !== "string" ||
    typeof entry.requestName !== "string" ||
    typeof entry.method !== "string" ||
    typeof entry.url !== "string"
  ) {
    return null
  }
  const response = entry.response
  const body = response?.bodyBase64
    ? new Uint8Array(Buffer.from(response.bodyBase64, "base64"))
    : undefined
  const restoredResponse = response
    ? (() => {
        const { bodyBase64: _encoded, ...metadata } = response
        return {
          executionId: entry.id,
          requestId: entry.requestId,
          requestRevision: 0,
          ...metadata,
          headers: [],
          ...(body ? { body } : {}),
        }
      })()
    : undefined
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    requestId: entry.requestId,
    requestName: entry.requestName,
    environmentName: entry.environmentName,
    method: entry.method,
    url: entry.url,
    status: entry.status,
    durationMs: entry.durationMs,
    error: entry.error,
    persisted: true,
    bodyDiscarded: entry.bodyDiscarded || Boolean(response && !body),
    ...(restoredResponse ? { response: restoredResponse } : {}),
  }
}

export async function loadHttpHistory(root: string, config: HttpWorkspaceConfig | boolean) {
  const persistMetadata = typeof config === "boolean" ? config : config.history.persistMetadata
  if (!persistMetadata) return []
  const persisted = await readPersistedHistory(root)
  return budgetHttpHistory(
    persisted.entries
      .map(restoredEntry)
      .filter((entry): entry is HttpHistoryEntry => Boolean(entry)),
  )
}

export function persistHttpHistoryEntry(
  root: string,
  config: HttpWorkspaceConfig,
  entry: HttpHistoryEntry,
) {
  if (!config.history.persistMetadata) return Promise.resolve()
  const path = historyPath(root)
  const previous = writes.get(path) ?? Promise.resolve()
  const next = previous.then(async () => {
    const current = await readPersistedHistory(root)
    const entries = enforcePersistedBodyBudget([
      persistableEntry(entry, config.history.persistBodies),
      ...current.entries.filter((candidate) => candidate.id !== entry.id),
    ]).slice(0, 30)
    await writeAtomic(root, { version: 1, entries }, current.sourceHash)
  })
  const queued = next.catch(() => undefined)
  writes.set(path, queued)
  void queued.finally(() => {
    if (writes.get(path) === queued) writes.delete(path)
  })
  return next
}
