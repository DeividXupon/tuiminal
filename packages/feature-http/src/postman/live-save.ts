import {
  liveFieldHash,
  liveSnapshotFields,
  liveSnapshotHashes,
  resolvePostmanSecrets,
} from "./live-snapshot"
import { assertLivePostmanSettingsUnchanged } from "./live-settings"
import type { HttpRequestDefinition } from "../model/types"
import type { PostmanApi } from "./api"
import type { Snapshot } from "./snapshot"
import { postmanRequestSnapshot } from "./snapshot"
import { livePostmanCollection, type LivePostmanCollection } from "./live-view"
import { postmanRequestPayload, postmanRemoteRequests } from "./sync"
import { postmanMultipartHeaders } from "./request-body"

export const POSTMAN_EDIT_CONFLICT =
  "A request mudou no Postman nos campos editados. Suas alterações continuam abertas; reabra a request para carregar a versão atual."
export const POSTMAN_SAVE_UNCONFIRMED =
  "O Postman não confirmou o salvamento. Suas alterações continuam abertas; confira a request antes de tentar novamente."

function baseline(request: HttpRequestDefinition) {
  if (request.source.kind !== "file" || !request.source.postman)
    throw new Error("Selecione uma request Postman salva para editar.")
  const saved = JSON.parse(request.source.postman.baseline) as Pick<
    HttpRequestDefinition,
    "options" | "assertions" | "chain"
  > & {
    snapshot: Snapshot
    hashes: ReturnType<typeof liveSnapshotHashes>
  }
  assertLivePostmanSettingsUnchanged(request, saved)
  return { ...request.source.postman, saved }
}

export async function saveLivePostmanRequest(
  api: Pick<PostmanApi, "collection" | "updateRequest">,
  collection: LivePostmanCollection,
  request: HttpRequestDefinition,
  assertActive: () => void = () => {},
) {
  const { collectionId, requestId, saved } = baseline(request)
  const before = livePostmanCollection(collection.selected, await api.collection(collectionId))
  const latest = before.requests.find(
    (entry) =>
      entry.request.source.kind === "file" && entry.request.source.postman?.requestId === requestId,
  )?.request
  if (!latest) throw new Error(POSTMAN_EDIT_CONFLICT)
  const original = liveSnapshotFields(saved.snapshot)
  const desired = liveSnapshotFields(postmanRequestSnapshot(request))
  const current = postmanRequestSnapshot(latest)
  const edited = (Object.keys(desired) as Array<keyof typeof desired>).filter(
    (key) => liveFieldHash(original[key]) !== liveFieldHash(desired[key]),
  )
  const currentHashes = liveSnapshotHashes(latest, before.privateValues)
  const desiredHashes = liveSnapshotHashes(request, collection.privateValues)
  for (const key of edited) {
    if (saved.hashes[key] !== currentHashes[key] && desiredHashes[key] !== currentHashes[key])
      throw new Error(POSTMAN_EDIT_CONFLICT)
  }
  const rawCurrent = resolvePostmanSecrets(current, before.privateValues)
  const rawDesired = resolvePostmanSecrets(desired, collection.privateValues)
  const { preRequest, postResponse, ...merged } = {
    ...liveSnapshotFields(rawCurrent),
    ...Object.fromEntries(edited.map((key) => [key, rawDesired[key]])),
  }
  const update = postmanRequestPayload(rawCurrent, {
    ...merged,
    scripts: { preRequest, postResponse },
  })
  if (!Object.keys(update).length) return { collection: before, request: latest }
  if (
    desired.body.kind === "multipart" &&
    update.dataMode !== undefined &&
    update.headerData === undefined
  ) {
    const remote = postmanRemoteRequests(before.document).find((item) => item.id === requestId)
    update.headerData = postmanMultipartHeaders(remote?.request)
  }
  assertActive()
  await api.updateRequest(collectionId, requestId, update)
  const after = livePostmanCollection(collection.selected, await api.collection(collectionId))
  const confirmed = after.requests.find((entry) => entry.request.id === request.id)?.request
  if (!confirmed) throw new Error(POSTMAN_SAVE_UNCONFIRMED)
  const confirmedHashes = liveSnapshotHashes(confirmed, after.privateValues)
  if (edited.some((key) => desiredHashes[key] !== confirmedHashes[key]))
    throw new Error(POSTMAN_SAVE_UNCONFIRMED)
  return { collection: after, request: confirmed }
}
