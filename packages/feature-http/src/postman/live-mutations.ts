import { liveSnapshotHashes, resolvePostmanSecrets } from "./live-snapshot"
import { assertLivePostmanSettingsUnchanged } from "./live-settings"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import type { HttpRequestDefinition } from "../model/types"
import { createScratchRequest } from "../model/workspace"
import { record } from "../importing/shared"
import type { LivePostmanSession } from "./live-session"
import { postmanRequestSnapshot } from "./snapshot"
import { postmanRequestBody, postmanBodyHeaders } from "./request-body"
import { postmanRemoteHash, postmanRemoteRequests, remoteAuth, remoteHeaders } from "./sync"
import { POSTMAN_EDIT_CONFLICT, POSTMAN_SAVE_UNCONFIRMED } from "./live-save"

function remoteId(value: unknown) {
  const object = record(value)
  const id = object?.id ?? object?.uid ?? record(object?.data)?.id ?? object?.model_id
  if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id))
    throw new Error(POSTMAN_SAVE_UNCONFIRMED)
  return id
}

function name(value: string) {
  const result = value.trim()
  if (!result || /[\0\r\n]/u.test(result)) throw new Error("Informe um nome.")
  return result
}

export async function createLivePostmanRequest(
  session: LivePostmanSession,
  path: string,
  draft: HttpRequestDefinition,
  folderId?: string,
) {
  return session.mutate(async () => {
    const collection = session.collection(path)
    const defaults = createScratchRequest("postman-defaults")
    assertLivePostmanSettingsUnchanged(draft, defaults)
    const fields = postmanRequestSnapshot(draft)
    const body = draft.body.kind === "none" ? {} : postmanRequestBody(draft.body)
    const pendingKey = `request:${path}:${draft.id}:${folderId ?? ""}`
    let id = session.pendingCreations.get(pendingKey)
    if (!id) {
      const response = await session.api.createRequest(
        collection.selected.uid ?? collection.selected.id,
        name(draft.name),
        folderId,
        {
          method: fields.method,
          url: fields.url,
          description: fields.description ?? "",
          preRequestScript: fields.scripts?.preRequest ?? "",
          tests: fields.scripts?.postResponse ?? "",
          headerData: remoteHeaders(postmanBodyHeaders(fields.headers, draft.body)),
          pathVariableData: fields.path,
          auth: remoteAuth(fields.auth),
          ...body,
        },
      )
      id = remoteId(response)
      session.pendingCreations.set(pendingKey, id)
    }
    // Creation is never automatically replayed, including after a failed confirmation.
    try {
      const after = await session.fetchCollection(collection.selected)
      const created = after.requests.find(
        (entry) =>
          entry.request.source.kind === "file" && entry.request.source.postman?.requestId === id,
      )
      if (!created) throw new Error(POSTMAN_SAVE_UNCONFIRMED)
      const expected = liveSnapshotHashes(draft, collection.privateValues)
      const actual = liveSnapshotHashes(created.request, after.privateValues)
      if (
        Object.keys(expected).some(
          (key) =>
            key !== "name" &&
            expected[key as keyof typeof expected] !== actual[key as keyof typeof actual],
        )
      )
        throw new Error(POSTMAN_SAVE_UNCONFIRMED)
      session.pendingCreations.delete(pendingKey)
      return created.request
    } catch (cause) {
      throw new Error(
        "A request foi criada no Postman, mas a confirmação falhou. Reabra o workspace antes de criar outra request.",
        { cause },
      )
    }
  })
}

export async function deleteLivePostmanRequest(
  session: LivePostmanSession,
  request: HttpRequestDefinition,
) {
  return session.mutate(async () => {
    if (request.source.kind !== "file" || !request.source.postman)
      throw new Error(POSTMAN_EDIT_CONFLICT)
    const collection = session.collection(request.source.path)
    const link = request.source.postman
    const before = await session.api.collection(link.collectionId)
    const remote = postmanRemoteRequests(before).find((item) => item.id === link.requestId)
    if (!remote || postmanRemoteHash(remote) !== request.source.sourceHash)
      throw new Error(POSTMAN_EDIT_CONFLICT)
    session.assertActive()
    await session.api.deleteRequest(link.collectionId, link.requestId)
    await session.fetchCollection(collection.selected)
  })
}

function withoutIds(items: unknown): unknown[] {
  if (!Array.isArray(items)) return []
  return items.map((value) => {
    const item = { ...record(value) }
    delete item.id
    delete item.uid
    if (Array.isArray(item.item)) item.item = withoutIds(item.item)
    if (Array.isArray(item.response)) item.response = withoutIds(item.response)
    return item
  })
}

export async function duplicateLivePostmanRequest(
  session: LivePostmanSession,
  request: HttpRequestDefinition,
  copyName?: string,
) {
  const latest = await session.openRequest(request)
  if (latest.source.kind !== "file") throw new Error(POSTMAN_EDIT_CONFLICT)
  const collection = session.collection(latest.source.path)
  const separator = latest.name.lastIndexOf(" / ")
  const parentPath = separator < 0 ? "" : latest.name.slice(0, separator)
  const leaf = separator < 0 ? latest.name : latest.name.slice(separator + 3)
  const folder = collection.folders.find((entry) => entry.path === parentPath)
  const draft = {
    ...latest,
    name: copyName ?? `${leaf} copy`,
    headers: resolvePostmanSecrets(latest.headers, collection.privateValues),
    auth: resolvePostmanSecrets(latest.auth, collection.privateValues),
  }
  return createLivePostmanRequest(session, latest.source.path, draft, folder?.id)
}

export async function manageLivePostmanCollection(
  session: LivePostmanSession,
  action:
    | "create-collection"
    | "create-folder"
    | "create-request"
    | "rename"
    | "duplicate"
    | "delete",
  row: HttpCollectionTreeRow | null,
  input: string,
  workspaceId = session.workspaceId,
) {
  if (action === "create-request" && row) {
    const request = await createLivePostmanRequest(
      session,
      row.path,
      { ...createScratchRequest("postman-new"), name: name(input) },
      row.kind === "folder" ? row.folderId : undefined,
    )
    return { filePath: row.path, request }
  }
  if (row?.kind === "request") {
    if (action === "delete") {
      await deleteLivePostmanRequest(session, row.item.request)
      return null
    }
    const separator = row.item.request.name.lastIndexOf(" / ")
    const prefix = separator < 0 ? "" : row.item.request.name.slice(0, separator + 3)
    const request =
      action === "duplicate"
        ? await duplicateLivePostmanRequest(session, row.item.request, name(input))
        : await session.save({ ...row.item.request, name: `${prefix}${name(input)}` })
    return { filePath: row.path, request }
  }
  return session.mutate(async () => {
    if (action === "create-collection") {
      const id = remoteId(await session.api.createCollection(workspaceId, name(input)))
      await session.fetchCollection({ id, name: input })
      return `file:postman/${id}.http`
    }
    if (!row) return null
    const collection = session.collection(row.path)
    const id = collection.selected.uid ?? collection.selected.id
    const current = await session.api.collection(id)
    session.assertActive()
    if (
      action === "delete" &&
      postmanRemoteHash(current) !== postmanRemoteHash(collection.document)
    )
      throw new Error(POSTMAN_EDIT_CONFLICT)
    if (action === "create-folder")
      await session.api.createFolder(
        id,
        name(input),
        row.kind === "folder" ? row.folderId : undefined,
      )
    else if (row.kind === "folder") await mutateFolder(session, collection, row, action, input)
    else if (await mutateCollection(session, collection, current, action, input, workspaceId))
      return null
    await session.fetchCollection(collection.selected)
    return null
  })
}

async function mutateFolder(
  session: LivePostmanSession,
  collection: ReturnType<LivePostmanSession["collection"]>,
  row: Extract<HttpCollectionTreeRow, { kind: "folder" }>,
  action: string,
  input: string,
) {
  const id = collection.selected.uid ?? collection.selected.id
  if (action === "rename") return session.api.renameFolder(id, row.folderId, name(input))
  if (action === "delete") return session.api.deleteFolder(id, row.folderId)
  const parent = row.folderPath.split(" / ").slice(0, -1).join(" / ")
  const parentId = collection.folders.find((entry) => entry.path === parent)?.id
  await session.api.copyFolder(id, row.folderId, parentId)
  const after = await session.fetchCollection(collection.selected)
  const added = after.folders.filter(
    (entry) =>
      !collection.folders.some((old) => old.id === entry.id) &&
      entry.path.split(" / ").slice(0, -1).join(" / ") === parent,
  )
  const copy = added[0]
  if (added.length !== 1 || !copy) throw new Error(POSTMAN_SAVE_UNCONFIRMED)
  return session.api.renameFolder(id, copy.id, name(input))
}

async function mutateCollection(
  session: LivePostmanSession,
  collection: ReturnType<LivePostmanSession["collection"]>,
  current: Record<string, unknown>,
  action: string,
  input: string,
  workspaceId: string,
) {
  const id = collection.selected.uid ?? collection.selected.id
  if (action === "rename") await session.api.renameCollection(id, name(input))
  else if (action === "delete") {
    await session.api.deleteCollection(id)
    session.remove(collection.file.path)
    return true
  } else if (action === "duplicate") {
    const info = { ...record(current.info) }
    delete info._postman_id
    delete info._exporter_id
    const created = remoteId(
      await session.api.createCollection(workspaceId, name(input), {
        ...current,
        info,
        item: withoutIds(current.item),
      }),
    )
    await session.fetchCollection({ id: created, name: input })
    return true
  }
  return false
}
