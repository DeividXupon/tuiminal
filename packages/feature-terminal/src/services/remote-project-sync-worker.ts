import { randomUUID } from "node:crypto"
import type {
  RemoteProjectSyncMapping,
  RemoteProjectSyncPreview,
  RemoteProjectSyncSnapshot,
} from "../model/remote-project-sync"
import type { RemoteCodexTarget } from "../model/sessions"
import {
  inspectRemoteProjectSync,
  pathExists,
  RemoteProjectSyncCollisionError,
  RemoteProjectSyncLocalChangesError,
  RemoteProjectSyncLocalRaceError,
  synchronizeRemoteProject,
} from "./remote-project-sync"
import {
  loadRemoteProjectSyncSnapshot,
  saveRemoteProjectSyncSnapshot,
} from "./remote-project-sync-state"
import {
  REMOTE_PROJECT_SYNC_PAGE_SIZE,
  type RemoteProjectSyncWorkerRequest,
  type RemoteProjectSyncWorkerResponse,
} from "./remote-project-sync-worker-protocol"

let controller: AbortController | null = null
let preview: RemoteProjectSyncPreview | null = null
let remote: RemoteCodexTarget | null = null
let destination = ""
let mapping: RemoteProjectSyncMapping | undefined
let jobId = ""
let activeRequestId = ""

function send(message: RemoteProjectSyncWorkerResponse) {
  return new Promise<void>((resolve) => {
    if (!process.send) return resolve()
    process.send(message, () => resolve())
  })
}

function nextMapping(snapshot: RemoteProjectSyncSnapshot) {
  if (!remote) throw new Error("Sessão remota ausente.")
  return {
    profileId: remote.profile.id,
    sourcePath: remote.workingDirectory,
    remotePath: snapshot.remote.canonicalPath,
    localPath: destination,
    remoteFingerprint: snapshot.remote.fingerprint,
    localFingerprint: snapshot.local.fingerprint,
    syncedAt: Date.now(),
  } satisfies RemoteProjectSyncMapping
}

function reviewPage(value: RemoteProjectSyncPreview, offset = 0) {
  const safeOffset = Math.max(
    0,
    Math.min(
      Math.floor(offset / REMOTE_PROJECT_SYNC_PAGE_SIZE) * REMOTE_PROJECT_SYNC_PAGE_SIZE,
      value.changes.length,
    ),
  )
  return {
    jobId,
    localPath: value.localPath,
    changeCount: value.changes.length,
    counts: {
      add: value.changes.filter((change) => change.action === "add").length,
      update: value.changes.filter((change) => change.action === "update").length,
      delete: value.changes.filter((change) => change.action === "delete").length,
      conflict: value.changes.filter((change) => change.localChanged).length,
    },
    hasLocalChanges: value.hasLocalChanges,
    legacyLocalChanges: value.legacyLocalChanges,
    difference:
      value.hasLocalChanges && value.changes.some((change) => change.remoteChanged)
        ? ("both" as const)
        : value.hasLocalChanges
          ? ("local" as const)
          : ("remote" as const),
    ...(mapping ? { mapping } : {}),
    offset: safeOffset,
    pageSize: REMOTE_PROJECT_SYNC_PAGE_SIZE,
    changes: value.changes.slice(safeOffset, safeOffset + REMOTE_PROJECT_SYNC_PAGE_SIZE),
  }
}

function errorCode(
  error: unknown,
): Extract<RemoteProjectSyncWorkerResponse, { kind: "error" }>["code"] {
  if (error instanceof RemoteProjectSyncCollisionError) return "collision"
  if (error instanceof RemoteProjectSyncLocalChangesError) return "local-changes"
  if (error instanceof RemoteProjectSyncLocalRaceError) return "local-race"
  return "general"
}

async function inspect(id: string, emitReview = true) {
  if (!remote || !controller) throw new Error("Sessão remota ausente.")
  await send({ id, kind: "progress", state: "checking", phase: "remote" })
  const snapshot = mapping ? await loadRemoteProjectSyncSnapshot(mapping) : undefined
  preview = await inspectRemoteProjectSync({
    remote,
    destination,
    mapping,
    snapshot,
    signal: controller.signal,
  })
  if (
    mapping &&
    !preview.changes.length &&
    (!snapshot ||
      preview.remote.fingerprint !== mapping.remoteFingerprint ||
      preview.local.fingerprint !== mapping.localFingerprint)
  ) {
    const baseline = { version: 1, remote: preview.remote, local: preview.local } as const
    mapping = await saveRemoteProjectSyncSnapshot(nextMapping(baseline), baseline)
  }
  if (emitReview) await send({ id, kind: "review", review: reviewPage(preview) })
}

function progressPhase(progress: number) {
  if (progress < 0.65) return "transferring" as const
  if (progress < 0.72) return "verifying" as const
  if (progress < 0.93) return "applying" as const
  return "verifying" as const
}

async function apply(id: string) {
  if (!remote || !controller || !preview) throw new Error("Prévia de sincronização ausente.")
  await send({ id, kind: "progress", state: "syncing", phase: "transferring", progress: 0 })
  const result = await synchronizeRemoteProject({
    remote,
    destination,
    preview,
    signal: controller.signal,
    onProgress: (progress) => {
      void send({
        id,
        kind: "progress",
        state: "syncing",
        phase: progressPhase(progress),
        progress,
      })
    },
  })
  const saved = await saveRemoteProjectSyncSnapshot(nextMapping(result.snapshot), result.snapshot)
  mapping = saved
  await send({ id, kind: "complete", mapping: saved })
}

async function start(
  request: Extract<RemoteProjectSyncWorkerRequest, { kind: "inspect" | "synchronize" }>,
) {
  if (controller) throw new Error("Já existe uma sincronização em andamento.")
  controller = new AbortController()
  activeRequestId = request.id
  remote = request.remote
  destination = request.destination
  mapping = request.mapping
  jobId = randomUUID()
  if (!mapping && (await pathExists(destination)))
    throw new RemoteProjectSyncCollisionError("A pasta de sincronização já existe.")
  await inspect(request.id, request.kind === "inspect")
  if (request.kind !== "synchronize") return
  if (!preview) throw new Error("Prévia de sincronização ausente.")
  if (!mapping && preview.local.fingerprint !== "")
    throw new RemoteProjectSyncCollisionError("A pasta de sincronização já existe.")
  await apply(request.id)
}

async function handle(request: RemoteProjectSyncWorkerRequest) {
  if (request.kind === "cancel") {
    if (controller?.signal.aborted) return
    await send({ id: activeRequestId || request.id, kind: "progress", state: "cancelling" })
    controller?.abort(new Error("Operação cancelada."))
    if (!activeRequestId) {
      await send({ id: request.id, kind: "cancelled" })
      process.disconnect?.()
    }
    return
  }
  if (request.kind === "page") {
    if (!preview) throw new Error("Prévia de sincronização ausente.")
    const page = reviewPage(preview, request.offset)
    await send({ id: request.id, kind: "page", offset: page.offset, changes: page.changes })
    return
  }
  if (request.kind === "apply") {
    if (!controller || activeRequestId) throw new Error("Sincronização indisponível.")
    activeRequestId = request.id
    await apply(request.id)
    return
  }
  await start(request)
}

process.on("message", (request: RemoteProjectSyncWorkerRequest) => {
  void handle(request)
    .catch(async (error) => {
      if (controller?.signal.aborted)
        await send({ id: activeRequestId || request.id, kind: "cancelled" })
      else
        await send({
          id: activeRequestId || request.id,
          kind: "error",
          code: errorCode(error),
          message: error instanceof Error ? error.message : "Não foi possível sincronizar.",
        })
    })
    .finally(() => {
      if (request.kind === "page" || request.kind === "cancel") return
      activeRequestId = ""
      if (request.kind === "synchronize" || request.kind === "apply" || controller?.signal.aborted)
        process.disconnect?.()
    })
})

process.on("disconnect", () => controller?.abort(new Error("Operação cancelada.")))
