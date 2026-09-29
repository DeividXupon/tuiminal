import type { RemoteCodexTarget } from "./sessions"

export type RemoteProjectSyncDifference = "local" | "remote" | "both"

export type RemoteProjectSyncEntryType = "file" | "directory" | "symlink" | "unsupported"

export type RemoteProjectSyncEntry = {
  path: string
  type: RemoteProjectSyncEntryType
  mode: number
  size: number
  modifiedAt: number
  changedAt?: number | undefined
  target: string
  digest?: string | undefined
}

export type RemoteProjectSyncManifest = {
  fingerprint: string
  canonicalPath: string
  entries: RemoteProjectSyncEntry[]
  hasUnsupported: boolean
  hasSymlink: boolean
}

export type RemoteProjectSyncSnapshot = {
  version: 1
  remote: RemoteProjectSyncManifest
  local: RemoteProjectSyncManifest
}

export type RemoteProjectSyncChangeAction = "add" | "update" | "delete"

export type RemoteProjectSyncChange = {
  path: string
  action: RemoteProjectSyncChangeAction
  localChanged: boolean
  remoteChanged: boolean
  transferBytes: number
}

export type RemoteProjectSyncPreview = {
  localPath: string
  remote: RemoteProjectSyncManifest
  local: RemoteProjectSyncManifest
  changes: RemoteProjectSyncChange[]
  hasLocalChanges: boolean
  legacyLocalChanges: boolean
}

export type RemoteProjectSyncStatus =
  | { kind: "unmapped" }
  | { kind: "checking"; localPath: string }
  | { kind: "syncing"; localPath: string; progress: number }
  | { kind: "synced"; localPath: string }
  | { kind: "out-of-sync"; localPath: string; difference: RemoteProjectSyncDifference }
  | { kind: "error"; localPath?: string; message: string }

export type RemoteProjectSyncMapping = {
  profileId: string
  sourcePath: string
  remotePath: string
  localPath: string
  remoteFingerprint: string
  localFingerprint: string
  snapshotId?: string | undefined
  syncedAt: number
}

export function remoteProjectSyncKey(remote: RemoteCodexTarget) {
  return JSON.stringify([remote.profile.id, remote.workingDirectory])
}

export function remoteProjectSyncMappingKey(
  mapping: Pick<RemoteProjectSyncMapping, "profileId" | "sourcePath">,
) {
  return JSON.stringify([mapping.profileId, mapping.sourcePath])
}
