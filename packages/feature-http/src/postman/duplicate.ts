import { readFile } from "node:fs/promises"
import {
  atomicWriteProjectFile,
  projectFileHash,
  resolveSafeProjectFile,
} from "@xupon/tuiminal-core/storage/project-files"
import { parseHttpFile, requestFromHttpFile } from "../model/http-file"
import { copyHttpBlocks } from "../storage/collection-copy"
import { createHttpCollection, deleteHttpCollection } from "../storage/collection-management"
import type { PostmanApi } from "./api"
import { PostmanCollectionConflict } from "./conflict"
import {
  postmanRemoteFolders,
  postmanRemoteHash,
  postmanRemoteRequests,
  postmanRequestKey,
  postmanRequestSnapshot,
  postmanSidecar,
  readPostmanProvenance,
  replacePostmanProvenance,
  writePostmanProvenance,
} from "./sync"

type DuplicateApi = Pick<
  PostmanApi,
  "collection" | "createCollection" | "copyFolder" | "renameFolder"
>

function validName(name: string) {
  const leaf = name.trim()
  if (!leaf || /[\\/\0\r\n]/.test(leaf) || leaf === "." || leaf === "..")
    throw new Error("Use um nome sem barras ou caracteres de controle.")
  return leaf
}
async function checked(
  root: string,
  api: Pick<PostmanApi, "collection">,
  path: string,
  expectedHash: string,
) {
  const metadataPath = await postmanSidecar(root, path)
  const metadata = await readPostmanProvenance(metadataPath)
  const source = await readFile((await resolveSafeProjectFile(root, path)).path, "utf8")
  if (projectFileHash(source) !== expectedHash)
    throw new Error("A coleção local mudou; atualize antes de editar a pasta.")
  const remote = await api.collection(metadata.collectionId)
  if (metadata.collectionHash !== postmanRemoteHash(remote)) throw new PostmanCollectionConflict()
  const parsed = parseHttpFile(source, path)
  for (const block of parsed.requests) {
    const entry = metadata.entries.find((item) => item.key === postmanRequestKey(block.blockId))
    if (
      !entry ||
      postmanRemoteHash(entry.baseline) !==
        postmanRemoteHash(postmanRequestSnapshot(requestFromHttpFile(parsed, block)))
    )
      throw new Error("Salve ou feche os requests alterados antes de mudar a coleção.")
  }
  return { metadataPath, metadata, source, remote, parsed }
}
function remoteId(value: Record<string, unknown>) {
  const id = value.uid ?? value.id
  if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id))
    throw new Error("Identificador Postman inválido.")
  return id
}
function withoutItemIds(items: unknown): unknown[] {
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    const copy = structuredClone(item) as Record<string, unknown>
    delete copy.id
    delete copy.uid
    if (Array.isArray(copy.item)) copy.item = withoutItemIds(copy.item)
    if (Array.isArray(copy.response))
      copy.response = copy.response.map((response) => {
        const clone = { ...response }
        delete clone.id
        return clone
      })
    return copy
  })
}

export async function duplicatePostmanCollection(
  root: string,
  api: Pick<DuplicateApi, "collection" | "createCollection">,
  path: string,
  name: string,
  expectedHash: string,
) {
  const leaf = validName(name)
  const current = await checked(root, api, path, expectedHash)
  if (!current.metadata.workspaceId) throw new Error("Selecione um workspace Postman.")
  const destination = await createHttpCollection(root, "postman", leaf)
  let created = false
  try {
    const info = { ...(current.remote.info as Record<string, unknown>) }
    delete info._postman_id
    delete info._exporter_id
    const contents = { ...current.remote, info, item: withoutItemIds(current.remote.item) }
    const response = await api.createCollection(current.metadata.workspaceId, leaf, contents)
    created = true
    const id = remoteId(response)
    const after = await api.collection(id)
    if (postmanRemoteRequests(after).length !== current.parsed.requests.length)
      throw new Error("Associação Postman inválida. Importe a coleção novamente.")
    const entries = copiedEntries(current, after)
    await atomicWriteProjectFile(root, destination, current.source, {
      expectedHash: projectFileHash(""),
    })
    await writePostmanProvenance(root, destination, id, after, current.metadata.workspaceId)
    const sidecar = await postmanSidecar(root, destination)
    const metadata = await readPostmanProvenance(sidecar)
    await replacePostmanProvenance(sidecar, { ...metadata, entries })
    return destination
  } catch (error) {
    if (!created) await deleteHttpCollection(root, destination, projectFileHash("")).catch(() => {})
    if (created)
      throw new Error("A cópia foi criada no Postman, mas não foi concluída; atualize a coleção.", {
        cause: error,
      })
    throw error
  }
}

function findFolder(items: unknown, id: string): Record<string, unknown> | undefined {
  if (!Array.isArray(items)) return undefined
  for (const item of items) {
    if (item.id === id && Array.isArray(item.item)) return item
    const nested = findFolder(item.item, id)
    if (nested) return nested
  }
  return undefined
}
export async function duplicatePostmanFolder(
  root: string,
  api: Pick<DuplicateApi, "collection" | "copyFolder" | "renameFolder">,
  path: string,
  folderId: string,
  name: string,
  expectedHash: string,
) {
  const leaf = validName(name)
  const current = await checked(root, api, path, expectedHash)
  const folders = postmanRemoteFolders(current.remote)
  const selected = folders.find((folder) => folder.id === folderId)
  if (!selected) throw new Error("A pasta Postman não está vinculada; importe a coleção novamente.")
  const split = selected.path.lastIndexOf(" / ")
  const parentPath = split < 0 ? "" : selected.path.slice(0, split)
  const nextPath = parentPath ? `${parentPath} / ${leaf}` : leaf
  if (folders.some((folder) => folder.path === nextPath))
    throw new Error("Já existe uma pasta Postman com esse nome.")
  const originals = postmanRemoteRequests(findFolder(current.remote.item, folderId))
  const blocks = originals.map((item) => {
    const entry = current.metadata.entries.find((candidate) => candidate.requestId === item.id)
    const block = current.parsed.requests.find(
      (candidate) => postmanRequestKey(candidate.blockId) === entry?.key,
    )
    if (!block) throw new Error("Associação Postman inválida. Importe a coleção novamente.")
    return block
  })
  const copied = copyHttpBlocks(
    blocks,
    (block) => `${nextPath}${block.name.slice(selected.path.length)}`,
  )
  const nextSource = copied ? `${current.source}\n${copied}` : current.source
  const parentId = folders.find((folder) => folder.path === parentPath)?.id
  await api.copyFolder(current.metadata.collectionId, folderId, parentId)
  try {
    const afterCopy = await api.collection(current.metadata.collectionId)
    const knownIds = new Set(folders.map((folder) => folder.id))
    const additions = postmanRemoteFolders(afterCopy).filter(
      (folder) =>
        !knownIds.has(folder.id) &&
        folder.path.split(" / ").slice(0, -1).join(" / ") === parentPath,
    )
    if (additions.length !== 1 || !additions[0])
      throw new Error("Associação Postman inválida. Importe a coleção novamente.")
    const newId = additions[0].id
    await api.renameFolder(current.metadata.collectionId, newId, leaf)
    const after = await api.collection(current.metadata.collectionId)
    const subtree = findFolder(after.item, newId)
    const requests = postmanRemoteRequests(subtree)
    const withoutCopy = { ...after, item: removeFolder(after.item, newId) }
    if (postmanRemoteHash(withoutCopy) !== postmanRemoteHash(current.remote))
      throw new Error("A coleção mudou no Postman; importe-a novamente antes de editar a pasta.")
    assertCopies(originals, requests)
    const appended = parseHttpFile(copied, path)
    if (!subtree || requests.length !== appended.requests.length)
      throw new Error("Associação Postman inválida. Importe a coleção novamente.")
    current.metadata.entries.push(
      ...appended.requests.map((block, index) => ({
        key: postmanRequestKey(block.blockId),
        requestId: remoteId({ id: requests[index]?.id }),
        remoteHash: postmanRemoteHash(requests[index]),
        baseline: postmanRequestSnapshot(requestFromHttpFile(appended, block)),
      })),
    )
    current.metadata.collectionHash = postmanRemoteHash(after)
    current.metadata.folders = postmanRemoteFolders(after)
    await atomicWriteProjectFile(root, path, nextSource, { expectedHash })
    await replacePostmanProvenance(current.metadataPath, current.metadata)
  } catch (error) {
    throw new Error("A cópia foi criada no Postman, mas não foi concluída; atualize a coleção.", {
      cause: error,
    })
  }
}

function removeFolder(items: unknown, id: string): unknown {
  if (!Array.isArray(items)) return items
  return items
    .filter((item) => item.id !== id)
    .map((item) =>
      Array.isArray(item.item) ? { ...item, item: removeFolder(item.item, id) } : item,
    )
}

function assertCopies(before: Record<string, unknown>[], after: Record<string, unknown>[]) {
  if (
    before.length !== after.length ||
    before.some((item, index) => {
      const copy = after[index]
      return (
        !copy ||
        copy.name !== item.name ||
        postmanRemoteHash(copy.request) !== postmanRemoteHash(item.request)
      )
    })
  )
    throw new Error("Associação Postman inválida. Importe a coleção novamente.")
}

function copiedEntries(
  current: Awaited<ReturnType<typeof checked>>,
  after: Record<string, unknown>,
) {
  const beforeRequests = postmanRemoteRequests(current.remote)
  const afterRequests = postmanRemoteRequests(after)
  assertCopies(beforeRequests, afterRequests)
  return current.metadata.entries.map((entry) => {
    const index = beforeRequests.findIndex((item) => item.id === entry.requestId)
    const item = afterRequests[index]
    if (!item) throw new Error("Associação Postman inválida. Importe a coleção novamente.")
    return { ...entry, requestId: remoteId({ id: item.id }), remoteHash: postmanRemoteHash(item) }
  })
}
