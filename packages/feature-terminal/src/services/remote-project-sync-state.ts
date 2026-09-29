import { randomUUID } from "node:crypto"
import { readFileSync, statSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { gunzipSync, gzipSync } from "node:zlib"
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
    typeof entry.target === "string" &&
    (entry.type === "file"
      ? typeof entry.digest === "string" && /^[a-f\d]{40}$/u.test(entry.digest)
      : entry.digest === undefined)
  )
}

function validEntries(values: unknown[]) {
  const paths = new Set<string>()
  for (const value of values) {
    if (!validEntry(value) || paths.has(value.path)) return false
    paths.add(value.path)
  }
  return true
}

function validManifest(value: unknown, remote: boolean): value is RemoteProjectSyncManifest {
  if (!value || typeof value !== "object") return false
  const manifest = value as RemoteProjectSyncManifest
  return (
    typeof manifest.fingerprint === "string" &&
    (manifest.fingerprint === "" || /^[a-f\d]{64}$/u.test(manifest.fingerprint)) &&
    validProjectPath(manifest.canonicalPath, remote) &&
    Array.isArray(manifest.entries) &&
    manifest.entries.length <= 250_000 &&
    validEntries(manifest.entries) &&
    typeof manifest.hasUnsupported === "boolean" &&
    typeof manifest.hasSymlink === "boolean"
  )
}

function validSnapshot(value: unknown): value is RemoteProjectSyncSnapshot {
  if (!value || typeof value !== "object") return false
  const snapshot = value as RemoteProjectSyncSnapshot
  return (
    snapshot.version === 1 &&
    validManifest(snapshot.remote, true) &&
    validManifest(snapshot.local, false)
  )
}

export function loadRemoteProjectSyncSnapshot(
  mapping: RemoteProjectSyncMapping,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!mapping.snapshotId || environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return undefined
  try {
    const path = remoteProjectSyncSnapshotPath(mapping.snapshotId, environment)
    if (statSync(path).size > MAX_SNAPSHOT_BYTES) return undefined
    const parsed = JSON.parse(
      gunzipSync(readFileSync(path), { maxOutputLength: MAX_SNAPSHOT_OUTPUT_BYTES }).toString(
        "utf8",
      ),
    )
    return validSnapshot(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function saveRemoteProjectSyncSnapshot(
  mapping: RemoteProjectSyncMapping,
  snapshot: RemoteProjectSyncSnapshot,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return mapping
  if (!validSnapshot(snapshot)) throw new Error("Snapshot de sincronização inválido.")
  const snapshotId = randomUUID()
  const content = gzipSync(`${JSON.stringify(snapshot)}\n`)
  if (content.byteLength > MAX_SNAPSHOT_BYTES)
    throw new Error("O projeto excede o limite de verificação.")
  atomicWriteFileSync(remoteProjectSyncSnapshotPath(snapshotId, environment), content, {
    expectedHash: null,
    mode: 0o600,
  })
  const next = { ...mapping, snapshotId }
  saveRemoteProjectSyncMapping(next, environment)
  if (mapping.snapshotId && mapping.snapshotId !== snapshotId)
    try {
      unlinkSync(remoteProjectSyncSnapshotPath(mapping.snapshotId, environment))
    } catch {
      // A missing or inaccessible old snapshot does not invalidate the new mapping.
    }
  return next
}
