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
  metadataKey?: string | undefined
  target: string
  linkKind?: "file" | "directory" | undefined
  digest?: string | undefined
}

export type RemoteProjectSyncManifest = {
  fingerprint: string
  canonicalPath: string
  scope?: "complete" | "git" | undefined
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

export type RemoteProjectSyncReview = {
  jobId: string
  localPath: string
  changeCount: number
  counts: { add: number; update: number; delete: number; conflict: number }
  hasLocalChanges: boolean
  legacyLocalChanges: boolean
  difference: RemoteProjectSyncDifference
  mapping?: RemoteProjectSyncMapping | undefined
  offset: number
  pageSize: number
  changes: RemoteProjectSyncChange[]
}

export type RemoteProjectSyncPhase =
  | "remote"
  | "local"
  | "comparing"
  | "transferring"
  | "applying"
  | "verifying"
  | "rolling-back"

export type RemoteProjectSyncStatus =
  | { kind: "unmapped" }
  | { kind: "checking"; localPath: string; phase?: RemoteProjectSyncPhase | undefined }
  | {
      kind: "syncing"
      localPath: string
      progress: number
      phase?: RemoteProjectSyncPhase | undefined
    }
  | { kind: "cancelling"; localPath: string }
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
