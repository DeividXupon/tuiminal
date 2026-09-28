import type { RemoteCodexTarget } from "./sessions"

export type RemoteProjectSyncDifference = "local" | "remote" | "both"

export type RemoteProjectSyncStatus =
  | { kind: "unmapped" }
  | { kind: "checking"; localPath: string }
  | { kind: "syncing"; localPath: string }
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
