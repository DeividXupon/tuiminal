import { randomUUID } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { readFile, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { gunzip, gzip } from "node:zlib"
import { atomicWriteFileSync, currentFileHash } from "@xupon/tuiminal-core/storage/atomic-file"
import {
  type RemoteProjectSyncEntry,
  type RemoteProjectSyncManifest,
  type RemoteProjectSyncMapping,
  type RemoteProjectSyncSnapshot,
  remoteProjectSyncMappingKey,
} from "../model/remote-project-sync"
import { validProjectPath } from "./agent-project-directories"
import { terminalWorkspaceStateDirectory } from "./terminal-workspace-state"

const MAX_MAPPINGS = 256
const MAX_STATE_BYTES = 2 * 1024 * 1024
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024
const MAX_SNAPSHOT_OUTPUT_BYTES = 128 * 1024 * 1024
const gunzipAsync = promisify(gunzip)
const gzipAsync = promisify(gzip)
const snapshotCache = new Map<string, Promise<RemoteProjectSyncSnapshot | undefined>>()
const MAX_CACHED_SNAPSHOTS = 2
const SNAPSHOT_BATCH_SIZE = 2_048

function yieldToInterface() {
  return new Promise<void>((resolve) => setImmediate(resolve))
}

function cacheSnapshot(path: string, snapshot: Promise<RemoteProjectSyncSnapshot | undefined>) {
  snapshotCache.delete(path)
  snapshotCache.set(path, snapshot)
  while (snapshotCache.size > MAX_CACHED_SNAPSHOTS) {
    const oldest = snapshotCache.keys().next().value
    if (oldest) snapshotCache.delete(oldest)
  }
}

export function remoteProjectSyncStatePath(environment: NodeJS.ProcessEnv = process.env) {
  return join(terminalWorkspaceStateDirectory(environment), "project-syncs.json")
}

export function remoteProjectSyncSnapshotPath(
  snapshotId: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return join(
    terminalWorkspaceStateDirectory(environment),
    "project-sync-snapshots",
    `${snapshotId}.json.gz`,
  )
}

function validMapping(value: unknown): value is RemoteProjectSyncMapping {
  if (!value || typeof value !== "object") return false
  const mapping = value as RemoteProjectSyncMapping
  return (
    typeof mapping.profileId === "string" &&
    mapping.profileId.length > 0 &&
    mapping.profileId.length <= 512 &&
    validProjectPath(mapping.sourcePath, true) &&
    validProjectPath(mapping.remotePath, true) &&
    validProjectPath(mapping.localPath) &&
    typeof mapping.remoteFingerprint === "string" &&
    /^[a-f\d]{64}$/u.test(mapping.remoteFingerprint) &&
    typeof mapping.localFingerprint === "string" &&
    /^[a-f\d]{64}$/u.test(mapping.localFingerprint) &&
    (mapping.snapshotId === undefined ||
      (typeof mapping.snapshotId === "string" &&
        /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/iu.test(
          mapping.snapshotId,
        ))) &&
    Number.isFinite(mapping.syncedAt)
  )
}

export function normalizeRemoteProjectSyncMappings(values: readonly unknown[]) {
  const unique = new Map<string, RemoteProjectSyncMapping>()
  for (const value of [...values].reverse()) {
    if (!validMapping(value)) continue
    const key = remoteProjectSyncMappingKey(value)
    if (!unique.has(key)) unique.set(key, value)
    if (unique.size === MAX_MAPPINGS) break
  }
  return [...unique.values()].reverse()
}

export function loadRemoteProjectSyncMappings(
  environment: NodeJS.ProcessEnv = process.env,
): RemoteProjectSyncMapping[] {
  if (environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return []
  try {
    const path = remoteProjectSyncStatePath(environment)
    if (statSync(path).size > MAX_STATE_BYTES) return []
    const parsed = JSON.parse(readFileSync(path, "utf8"))
    if ((parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.mappings)) return []
    return normalizeRemoteProjectSyncMappings(parsed.mappings)
  } catch {
    return []
  }
}

export function saveRemoteProjectSyncMapping(
  mapping: RemoteProjectSyncMapping,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return
  const path = remoteProjectSyncStatePath(environment)
  for (let attempt = 0; attempt < 2; attempt++) {
    const expectedHash = currentFileHash(path)
    const mappings = normalizeRemoteProjectSyncMappings([
      ...loadRemoteProjectSyncMappings(environment).filter(
        (candidate) =>
          remoteProjectSyncMappingKey(candidate) !== remoteProjectSyncMappingKey(mapping),
      ),
      mapping,
    ])
    try {
      atomicWriteFileSync(path, `${JSON.stringify({ version: 2, mappings }, null, 2)}\n`, {
        expectedHash,
        mode: 0o600,
      })
      return
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
}

function validEntry(value: unknown): value is RemoteProjectSyncEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as RemoteProjectSyncEntry
  return (
    typeof entry.path === "string" &&
    entry.path.length > 0 &&
    entry.path.length <= 4_096 &&
    !entry.path.startsWith("/") &&
    !entry.path.split("/").some((part) => part === "" || part === "." || part === "..") &&
    ["file", "directory", "symlink", "unsupported"].includes(entry.type) &&
    Number.isSafeInteger(entry.mode) &&
    Number.isSafeInteger(entry.size) &&
    entry.size >= 0 &&
    Number.isFinite(entry.modifiedAt) &&
    (entry.changedAt === undefined || Number.isFinite(entry.changedAt)) &&
    (entry.metadataKey === undefined ||
      (typeof entry.metadataKey === "string" && entry.metadataKey.length <= 512)) &&
    typeof entry.target === "string" &&
    (entry.linkKind === undefined || entry.linkKind === "file" || entry.linkKind === "directory") &&
    (entry.type === "file"
      ? typeof entry.digest === "string" && /^[a-f\d]{40}$/u.test(entry.digest)
      : entry.digest === undefined)
  )
}

async function validEntries(values: unknown[]) {
  const paths = new Set<string>()
  for (let offset = 0; offset < values.length; offset += SNAPSHOT_BATCH_SIZE) {
    for (const value of values.slice(offset, offset + SNAPSHOT_BATCH_SIZE)) {
      if (!validEntry(value) || paths.has(value.path)) return false
      paths.add(value.path)
    }
    await yieldToInterface()
  }
  return true
}

async function validManifest(value: unknown, remote: boolean) {
  if (!value || typeof value !== "object") return false
  const manifest = value as RemoteProjectSyncManifest
  return (
    typeof manifest.fingerprint === "string" &&
    (manifest.fingerprint === "" || /^[a-f\d]{64}$/u.test(manifest.fingerprint)) &&
    validProjectPath(manifest.canonicalPath, remote) &&
    (manifest.scope === undefined || manifest.scope === "complete" || manifest.scope === "git") &&
    Array.isArray(manifest.entries) &&
    manifest.entries.length <= 250_000 &&
    (await validEntries(manifest.entries)) &&
    typeof manifest.hasUnsupported === "boolean" &&
    typeof manifest.hasSymlink === "boolean"
  )
}

async function validSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return false
  const snapshot = value as RemoteProjectSyncSnapshot
  return (
    snapshot.version === 1 &&
    (await validManifest(snapshot.remote, true)) &&
    (await validManifest(snapshot.local, false))
  )
}

async function serializeEntries(entries: readonly RemoteProjectSyncEntry[]) {
  const chunks: string[] = []
  for (let offset = 0; offset < entries.length; offset += SNAPSHOT_BATCH_SIZE) {
    chunks.push(
      entries
        .slice(offset, offset + SNAPSHOT_BATCH_SIZE)
        .map((entry) => JSON.stringify(entry))
        .join(","),
    )
    await yieldToInterface()
  }
  return chunks.join(",")
}

async function serializeManifest(manifest: RemoteProjectSyncManifest) {
  const metadata = JSON.stringify({
    fingerprint: manifest.fingerprint,
    canonicalPath: manifest.canonicalPath,
    scope: manifest.scope,
    hasUnsupported: manifest.hasUnsupported,
    hasSymlink: manifest.hasSymlink,
  })
  return `${metadata.slice(0, -1)},"entries":[${await serializeEntries(manifest.entries)}]}`
}

async function serializeSnapshot(snapshot: RemoteProjectSyncSnapshot) {
  const remote = await serializeManifest(snapshot.remote)
  const local = await serializeManifest(snapshot.local)
  return `{"version":1,"remote":${remote},"local":${local}}\n`
}

export async function loadRemoteProjectSyncSnapshot(
  mapping: RemoteProjectSyncMapping,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!mapping.snapshotId || environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return undefined
  const path = remoteProjectSyncSnapshotPath(mapping.snapshotId, environment)
  const cached = snapshotCache.get(path)
  if (cached) return cached
  const pending = (async () => {
    try {
      if ((await stat(path)).size > MAX_SNAPSHOT_BYTES) return undefined
      const content = await gunzipAsync(await readFile(path), {
        maxOutputLength: MAX_SNAPSHOT_OUTPUT_BYTES,
      })
      const parsed = JSON.parse(content.toString("utf8"))
      return (await validSnapshot(parsed)) ? (parsed as RemoteProjectSyncSnapshot) : undefined
    } catch {
      return undefined
    }
  })()
  cacheSnapshot(path, pending)
  return pending
}

export async function saveRemoteProjectSyncSnapshot(
  mapping: RemoteProjectSyncMapping,
  snapshot: RemoteProjectSyncSnapshot,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return mapping
  if (!(await validSnapshot(snapshot))) throw new Error("Snapshot de sincronização inválido.")
  const snapshotId = randomUUID()
  const content = await gzipAsync(await serializeSnapshot(snapshot))
  if (content.byteLength > MAX_SNAPSHOT_BYTES)
    throw new Error("O projeto excede o limite de verificação.")
  const path = remoteProjectSyncSnapshotPath(snapshotId, environment)
  atomicWriteFileSync(path, content, {
    expectedHash: null,
    mode: 0o600,
  })
  cacheSnapshot(path, Promise.resolve(snapshot))
  const next = { ...mapping, snapshotId }
  saveRemoteProjectSyncMapping(next, environment)
  if (mapping.snapshotId && mapping.snapshotId !== snapshotId) {
    const previousPath = remoteProjectSyncSnapshotPath(mapping.snapshotId, environment)
    await unlink(previousPath).catch(() => undefined)
    snapshotCache.delete(previousPath)
  }
  return next
}
