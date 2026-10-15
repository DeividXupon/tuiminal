import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type {
  RemoteProjectSyncMapping,
  RemoteProjectSyncManifest,
  RemoteProjectSyncPreview,
  RemoteProjectSyncSnapshot,
} from "../model/remote-project-sync"
import type { RemoteCodexTarget } from "../model/sessions"
import {
  createRemoteProjectSyncPreview,
  emptyLocalProjectManifest,
} from "./remote-project-sync-diff"
import {
  RemoteProjectSyncCollisionError,
  RemoteProjectSyncError,
  RemoteProjectSyncLocalChangesError,
  RemoteProjectSyncLocalRaceError,
} from "./remote-project-sync-errors"
import {
  localRemoteProjectHashCommand,
  localRemoteProjectManifestCommand,
  readRemoteProjectFingerprint,
  readRemoteProjectManifest,
} from "./remote-project-sync-manifest"
import {
  readLocalProjectFingerprint,
  readLocalProjectFileDigest,
  readLocalProjectManifest,
  readLocalProjectMetadata,
} from "./remote-project-sync-local-manifest"
import {
  downloadRemoteProjectSyncDelta,
  localRemoteProjectArchiveCommand,
  type RemoteProjectArchiveCommand,
  remoteProjectSyncManifestsEqual,
} from "./remote-project-sync-transfer"
import {
  applyRemoteProjectSyncDelta,
  commitRemoteProjectSyncDelta,
  recoverRemoteProjectSyncTransactions,
  rollbackRemoteProjectSyncDelta,
} from "./remote-project-sync-transaction"

const SYNC_TIMEOUT_MS = 5 * 60_000

export {
  localRemoteProjectArchiveCommand,
  localRemoteProjectHashCommand,
  localRemoteProjectManifestCommand,
  RemoteProjectSyncCollisionError,
  RemoteProjectSyncError,
  RemoteProjectSyncLocalChangesError,
  RemoteProjectSyncLocalRaceError,
  readLocalProjectFingerprint,
  readLocalProjectManifest,
  readRemoteProjectFingerprint,
  readRemoteProjectManifest,
}

export type RemoteProjectSyncCommands = {
  manifest?: readonly string[] | undefined
  hashes?: ((paths: readonly string[]) => readonly string[]) | undefined
  archive?: RemoteProjectArchiveCommand
}

export async function pathExists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  )
}

function cleanLocalName(value: string) {
  const cleaned = value
    .replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]+/gu, "-")
    .replace(/[. ]+$/u, "")
    .trim()
  return cleaned || "project"
}

export function remoteProjectSyncDestination(parent: string, remotePath: string) {
  const normalized = remotePath.replace(/\/+$/u, "")
  const name = normalized ? basename(normalized) : "root"
  return join(parent, `${cleanLocalName(name)}-sync`)
}

function detailedOptions(remote: RemoteCodexTarget, commands?: RemoteProjectSyncCommands) {
  return {
    manifestCommand: commands?.manifest,
    hashCommand:
      commands?.hashes ??
      (commands?.manifest
        ? (paths: readonly string[]) =>
            localRemoteProjectHashCommand(remote.workingDirectory, paths)
        : undefined),
    timeoutMs: SYNC_TIMEOUT_MS,
  }
}

function validateRemoteManifest(manifest: RemoteProjectSyncManifest) {
  if (manifest.hasUnsupported)
    throw new RemoteProjectSyncError("O projeto remoto contém um tipo de arquivo não suportado.")
}

export async function inspectRemoteProjectSync(options: {
  remote: RemoteCodexTarget
  destination: string
  signal: AbortSignal
  mapping?: RemoteProjectSyncMapping | undefined
  snapshot?: RemoteProjectSyncSnapshot | undefined
  commands?: RemoteProjectSyncCommands | undefined
}) {
  await recoverRemoteProjectSyncTransactions(options.destination)
  const localPresent = await pathExists(options.destination)
  const [remoteMetadata, localMetadata] = await Promise.all([
    readRemoteProjectFingerprint(options.remote, options.signal, {
      command: options.commands?.manifest,
      timeoutMs: SYNC_TIMEOUT_MS,
    }),
    localPresent
      ? readLocalProjectMetadata(options.destination, options.signal)
      : Promise.resolve(emptyLocalProjectManifest(options.destination)),
  ])
  validateRemoteManifest(remoteMetadata)
  const baseline =
    options.mapping &&
    options.snapshot?.remote.scope !== "git" &&
    options.snapshot?.remote.fingerprint === options.mapping.remoteFingerprint &&
    options.snapshot.local.fingerprint === options.mapping.localFingerprint
      ? options.snapshot
      : undefined
  const remoteUnchanged = baseline?.remote.fingerprint === remoteMetadata.fingerprint
  const localUnchanged = baseline?.local.fingerprint === localMetadata.fingerprint
  const [remote, local] = await Promise.all([
    remoteUnchanged
      ? Promise.resolve({ ...baseline.remote, canonicalPath: remoteMetadata.canonicalPath })
      : readRemoteProjectManifest(options.remote, options.signal, {
          ...detailedOptions(options.remote, options.commands),
          manifest: remoteMetadata,
          baseline: baseline?.remote,
        }),
    localUnchanged
      ? Promise.resolve({ ...baseline.local, canonicalPath: localMetadata.canonicalPath })
      : localPresent
        ? readLocalProjectManifest(options.destination, options.signal, {
            manifest: localMetadata,
            baseline: baseline?.local,
          })
        : Promise.resolve(localMetadata),
  ])
  return createRemoteProjectSyncPreview({
    remote,
    local,
    mapping: options.mapping,
    snapshot: baseline,
  })
}

async function verifyReviewedState(options: {
  remote: RemoteCodexTarget
  destination: string
  preview: RemoteProjectSyncPreview
  signal: AbortSignal
  commands?: RemoteProjectSyncCommands | undefined
}) {
  const [remote, local] = await Promise.all([
    readRemoteProjectManifest(options.remote, options.signal, {
      ...detailedOptions(options.remote, options.commands),
      baseline: options.preview.remote,
    }),
    pathExists(options.destination).then((present) =>
      present
        ? readLocalProjectManifest(options.destination, options.signal, {
            baseline: options.preview.local,
          })
        : emptyLocalProjectManifest(options.destination),
    ),
  ])
  if (!remoteProjectSyncManifestsEqual(options.preview.remote, remote))
    throw new RemoteProjectSyncError("O projeto remoto mudou durante a sincronização.")
  if (
    options.preview.local.fingerprint !== local.fingerprint ||
    !remoteProjectSyncManifestsEqual(options.preview.local, local)
  )
    throw new RemoteProjectSyncLocalRaceError(
      "A cópia local mudou durante a sincronização; tente novamente.",
    )
  return remote
}

export async function synchronizeRemoteProject(options: {
  remote: RemoteCodexTarget
  destination: string
  signal: AbortSignal
  preview?: RemoteProjectSyncPreview | undefined
  beforePublish?: (() => Promise<void>) | undefined
  onProgress?: ((progress: number) => void) | undefined
  commands?: RemoteProjectSyncCommands | undefined
}) {
  const { remote, signal } = options
  const destination = resolve(options.destination)
  const preview =
    options.preview ??
    (await inspectRemoteProjectSync({
      remote,
      destination,
      signal,
      commands: options.commands,
    }))
  if (resolve(preview.localPath) !== destination)
    throw new RemoteProjectSyncError("O destino da sincronização mudou.")
  validateRemoteManifest(preview.remote)
  await mkdir(dirname(destination), { recursive: true })
  await recoverRemoteProjectSyncTransactions(destination)
  const transaction = await mkdtemp(
    join(dirname(destination), `.${basename(destination)}.tuiminal-sync-`),
  )
  const incoming = join(transaction, "incoming")
  const report = (progress: number) => options.onProgress?.(Math.max(0, Math.min(1, progress)))
  try {
    report(0)
    const transferred = await downloadRemoteProjectSyncDelta({
      remote,
      preview,
      incoming,
      transaction,
      signal,
      archiveOverride: options.commands?.archive,
      onProgress: (progress) => report(progress * 0.6),
    })
    for (const entry of transferred) {
      signal.throwIfAborted()
      const digest = await readLocalProjectFileDigest(
        join(incoming, ...entry.path.split("/")),
        entry.size,
        signal,
      )
      if (digest !== entry.digest)
        throw new RemoteProjectSyncError("O projeto remoto mudou durante a sincronização.")
    }
    report(0.65)
    await options.beforePublish?.()
    const remoteAfter = await verifyReviewedState({
      remote,
      destination,
      preview,
      signal,
      commands: options.commands,
    })
    report(0.72)
    await applyRemoteProjectSyncDelta({
      preview,
      destination,
      transaction,
      incoming,
      signal,
      onProgress: (progress) => report(0.72 + progress * 0.2),
    })
    report(0.93)
    const local = await readLocalProjectManifest(destination, signal, {
      baseline: remoteAfter,
      forceHashPaths: new Set(transferred.map((entry) => entry.path)),
      requireChangedAt: false,
    })
    if (!remoteProjectSyncManifestsEqual(remoteAfter, local))
      throw new RemoteProjectSyncError("Não foi possível verificar a cópia local sincronizada.")
    await commitRemoteProjectSyncDelta(transaction)
    report(1)
    const snapshot: RemoteProjectSyncSnapshot = { version: 1, remote: remoteAfter, local }
    return {
      remotePath: remoteAfter.canonicalPath,
      remoteFingerprint: remoteAfter.fingerprint,
      localFingerprint: local.fingerprint,
      snapshot,
    }
  } catch (error) {
    await rollbackRemoteProjectSyncDelta(transaction, destination).catch(() => undefined)
    await rm(transaction, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
