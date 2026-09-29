import { resolve } from "node:path"
import type {
  RemoteProjectSyncEntry,
  RemoteProjectSyncManifest,
  RemoteProjectSyncMapping,
  RemoteProjectSyncPreview,
  RemoteProjectSyncSnapshot,
} from "../model/remote-project-sync"

export function emptyLocalProjectManifest(
  path: string,
  scope: RemoteProjectSyncManifest["scope"] = "complete",
): RemoteProjectSyncManifest {
  return {
    fingerprint: "",
    canonicalPath: resolve(path),
    scope,
    entries: [],
    hasUnsupported: false,
    hasSymlink: false,
  }
}

export function projectSyncEntriesEqual(
  remote: RemoteProjectSyncEntry | undefined,
  local: RemoteProjectSyncEntry | undefined,
) {
  if (!remote || !local || remote.type !== local.type) return remote === local
  if (remote.type === "unsupported") return false
  if (remote.type === "symlink")
    return remote.target === local.target && remote.linkKind === local.linkKind
  const modeEqual = process.platform === "win32" || remote.mode === local.mode
  if (remote.type === "directory") return modeEqual && remote.modifiedAt === local.modifiedAt
  return (
    modeEqual &&
    remote.size === local.size &&
    remote.modifiedAt === local.modifiedAt &&
    remote.digest === local.digest
  )
}

function entriesByPath(manifest: RemoteProjectSyncManifest | undefined) {
  return new Map(manifest?.entries.map((entry) => [entry.path, entry]) ?? [])
}

export function createRemoteProjectSyncPreview(options: {
  remote: RemoteProjectSyncManifest
  local: RemoteProjectSyncManifest
  mapping?: RemoteProjectSyncMapping | undefined
  snapshot?: RemoteProjectSyncSnapshot | undefined
}): RemoteProjectSyncPreview {
  const { remote, local, mapping, snapshot } = options
  const remoteEntries = entriesByPath(remote)
  const localEntries = entriesByPath(local)
  const baselineRemote = entriesByPath(snapshot?.remote)
  const baselineLocal = entriesByPath(snapshot?.local)
  const legacyLocalChanges = Boolean(
    mapping && !snapshot && local.fingerprint !== mapping.localFingerprint,
  )
  const legacyRemoteChanges = Boolean(
    mapping && !snapshot && remote.fingerprint !== mapping.remoteFingerprint,
  )
  const paths = [...new Set([...remoteEntries.keys(), ...localEntries.keys()])].sort((a, b) =>
    a.localeCompare(b),
  )
  const changes = paths.flatMap((path) => {
    const remoteEntry = remoteEntries.get(path)
    const localEntry = localEntries.get(path)
    if (projectSyncEntriesEqual(remoteEntry, localEntry)) return []
    const localChanged = snapshot
      ? !projectSyncEntriesEqual(localEntry, baselineLocal.get(path))
      : legacyLocalChanges
    const remoteChanged = snapshot
      ? !projectSyncEntriesEqual(remoteEntry, baselineRemote.get(path))
      : legacyRemoteChanges || !mapping
    return [
      {
        path,
        action: !remoteEntry ? "delete" : !localEntry ? "add" : "update",
        localChanged,
        remoteChanged,
        transferBytes:
          remoteEntry?.type === "file" && remoteEntry.digest !== localEntry?.digest
            ? remoteEntry.size
            : 0,
      } as const,
    ]
  })
  return {
    localPath: local.canonicalPath,
    remote,
    local,
    changes,
    hasLocalChanges: legacyLocalChanges || changes.some((change) => change.localChanged),
    legacyLocalChanges,
  }
}
