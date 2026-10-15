import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { atomicWriteProjectFile, projectFileHash } from "@xupon/tuiminal-core/storage/project-files"
import { parseHttpFile, requestFromHttpFile, serializeHttpRequestBlock } from "../model/http-file"
import type { PostmanApi } from "./api"
import {
  postmanRemoteFolders,
  postmanRemoteHash,
  postmanRemoteRequests,
  postmanRequestKey,
  postmanRequestSnapshot,
  postmanSidecar,
  readPostmanProvenance,
  replacePostmanProvenance,
  type PostmanProvenance,
} from "./sync"

type FolderApi = Pick<PostmanApi, "collection" | "createFolder" | "renameFolder" | "deleteFolder">

function validName(name: string) {
  const trimmed = name.trim()
  if (!trimmed || /[\\/\0\r\n]/u.test(trimmed) || trimmed === "." || trimmed === "..") {
    throw new Error("Use um nome de pasta Postman sem barras ou caracteres de controle.")
  }
  return trimmed
}

async function association(root: string, filePath: string) {
  const metadataPath = await postmanSidecar(root, filePath)
  return { metadataPath, metadata: await readPostmanProvenance(metadataPath) }
}

function folder(metadata: PostmanProvenance, folderId: string) {
  const selected = metadata.folders?.find((item) => item.id === folderId)
  if (!selected) throw new Error("A pasta Postman não está vinculada; importe a coleção novamente.")
  return selected
}

function currentRemoteFolder(metadata: PostmanProvenance, remote: unknown, folderId: string) {
  const selected = folder(metadata, folderId)
  const current = postmanRemoteFolders(remote).find((item) => item.id === folderId)
  if (!current || current.remoteHash !== selected.remoteHash) {
    throw new Error("A pasta mudou no Postman; importe a coleção novamente.")
  }
  return selected
}

function updatedMetadata(metadata: PostmanProvenance, after: unknown) {
  metadata.folders = postmanRemoteFolders(after)
  metadata.collectionHash = postmanRemoteHash(after)
}

function assertCollectionUnchanged(metadata: PostmanProvenance, remote: unknown) {
  if (metadata.collectionHash !== postmanRemoteHash(remote)) {
    throw new Error("A coleção mudou no Postman; importe-a novamente antes de editar a pasta.")
  }
}

function changedRequests(
  source: string,
  filePath: string,
  prefix: string,
  nextPrefix: string | null,
) {
  const parsed = parseHttpFile(source, filePath)
  const affected = parsed.requests.filter((block) => block.name.startsWith(`${prefix} / `))
  let next = source
  for (const block of affected.reverse()) {
    if (nextPrefix !== null && !block.editable) {
      throw new Error("Uma request da pasta não pode ser renomeada com segurança.")
    }
    const replacement =
      nextPrefix === null
        ? ""
        : serializeHttpRequestBlock({
            ...requestFromHttpFile(parsed, block),
            name: `${nextPrefix}${block.name.slice(prefix.length)}`,
          })
    next = `${next.slice(0, block.start)}${replacement}${next.slice(block.end)}`
  }
  return next
}

async function checkedSource(root: string, filePath: string, expectedHash: string) {
  const source = await readFile(resolve(root, filePath), "utf8")
  if (projectFileHash(source) !== expectedHash) {
    throw new Error("A coleção local mudou; atualize antes de editar a pasta.")
  }
  return source
}

async function publishSource(root: string, filePath: string, source: string, expectedHash: string) {
  await atomicWriteProjectFile(root, filePath, source, { expectedHash })
}

function refreshEntries(
  metadata: PostmanProvenance,
  source: string,
  filePath: string,
  remote: unknown,
  affectedPath: string,
) {
  const parsed = parseHttpFile(source, filePath)
  const snapshots = new Map(
    parsed.requests.map((block) => [
      postmanRequestKey(block.blockId),
      postmanRequestSnapshot(requestFromHttpFile(parsed, block)),
    ]),
  )
  const remoteRequests = new Map(
    postmanRemoteRequests(remote).map((item) => [String(item.id), item]),
  )
  metadata.entries = metadata.entries.flatMap((entry) => {
    if (!entry.baseline.name.startsWith(`${affectedPath} / `)) return [entry]
    const baseline = snapshots.get(entry.key)
    const item = remoteRequests.get(entry.requestId)
    if (!baseline || !item) return []
    return [{ ...entry, baseline, remoteHash: postmanRemoteHash(item) }]
  })
}

export async function createPostmanFolder(
  root: string,
  api: FolderApi,
  filePath: string,
  name: string,
  parentFolderId?: string,
) {
  const leaf = validName(name)
  const { metadataPath, metadata } = await association(root, filePath)
  const before = await api.collection(metadata.collectionId)
  assertCollectionUnchanged(metadata, before)
  const parent = parentFolderId ? currentRemoteFolder(metadata, before, parentFolderId) : undefined
  const path = parent ? `${parent.path} / ${leaf}` : leaf
  if (metadata.folders?.some((item) => item.path === path)) {
    throw new Error("Já existe uma pasta Postman com esse nome.")
  }
  await api.createFolder(metadata.collectionId, leaf, parentFolderId)
  const after = await api.collection(metadata.collectionId)
  if (!postmanRemoteFolders(after).some((item) => item.path === path)) {
    throw new Error(
      "Pasta criada no Postman, mas o vínculo local falhou. Importe a coleção novamente.",
    )
  }
  updatedMetadata(metadata, after)
  await replacePostmanProvenance(metadataPath, metadata)
}

export async function renamePostmanFolder(
  root: string,
  api: FolderApi,
  filePath: string,
  folderId: string,
  name: string,
  expectedHash: string,
) {
  const leaf = validName(name)
  const { metadataPath, metadata } = await association(root, filePath)
  const source = await checkedSource(root, filePath, expectedHash)
  const before = await api.collection(metadata.collectionId)
  assertCollectionUnchanged(metadata, before)
  const selected = currentRemoteFolder(metadata, before, folderId)
  const separator = selected.path.lastIndexOf(" / ")
  const nextPath = separator < 0 ? leaf : `${selected.path.slice(0, separator + 3)}${leaf}`
  if (metadata.folders?.some((item) => item.id !== folderId && item.path === nextPath)) {
    throw new Error("Já existe uma pasta Postman com esse nome.")
  }
  const next = changedRequests(source, filePath, selected.path, nextPath)
  await api.renameFolder(metadata.collectionId, folderId, leaf)
  await publishSource(root, filePath, next, expectedHash)
  const after = await api.collection(metadata.collectionId)
  refreshEntries(metadata, next, filePath, after, selected.path)
  updatedMetadata(metadata, after)
  await replacePostmanProvenance(metadataPath, metadata)
}

export async function deletePostmanFolder(
  root: string,
  api: FolderApi,
  filePath: string,
  folderId: string,
  expectedHash: string,
) {
  const { metadataPath, metadata } = await association(root, filePath)
  const source = await checkedSource(root, filePath, expectedHash)
  const before = await api.collection(metadata.collectionId)
  assertCollectionUnchanged(metadata, before)
  const selected = currentRemoteFolder(metadata, before, folderId)
  const next = changedRequests(source, filePath, selected.path, null)
  await api.deleteFolder(metadata.collectionId, folderId)
  await publishSource(root, filePath, next, expectedHash)
  const after = await api.collection(metadata.collectionId)
  refreshEntries(metadata, next, filePath, after, selected.path)
  updatedMetadata(metadata, after)
  await replacePostmanProvenance(metadataPath, metadata)
}
