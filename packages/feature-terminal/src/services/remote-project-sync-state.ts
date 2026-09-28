import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteFileSync, currentFileHash } from "@xupon/tuiminal-core/storage/atomic-file"
import {
  type RemoteProjectSyncMapping,
  remoteProjectSyncMappingKey,
} from "../model/remote-project-sync"
import { validProjectPath } from "./agent-project-directories"
import { terminalWorkspaceStateDirectory } from "./terminal-workspace-state"

const MAX_MAPPINGS = 256
const MAX_STATE_BYTES = 2 * 1024 * 1024

export function remoteProjectSyncStatePath(environment: NodeJS.ProcessEnv = process.env) {
  return join(terminalWorkspaceStateDirectory(environment), "project-syncs.json")
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
    if (parsed.version !== 1 || !Array.isArray(parsed.mappings)) return []
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
      atomicWriteFileSync(path, `${JSON.stringify({ version: 1, mappings }, null, 2)}\n`, {
        expectedHash,
        mode: 0o600,
      })
      return
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
}
