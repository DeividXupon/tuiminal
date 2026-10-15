import { lstat, readFile, realpath, rename, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { projectFileHash } from "@xupon/tuiminal-core/storage/project-files"
import { atomicWriteProjectFile } from "@xupon/tuiminal-core/storage/project-files"
import { parseHttpFile, requestFromHttpFile, serializeHttpRequestBlock } from "../model/http-file"
import type { HttpRequestDefinition } from "../model/types"
import { createScratchRequest } from "../model/workspace"
import { ensureHttpWorkspaceDirectory } from "../services/context"
import {
  createHttpCollection,
  createHttpRequestInCollection,
  deleteHttpCollection,
  renameHttpCollection,
  renameHttpRequest,
} from "../storage/collection-management"
import { deleteHttpRequest, saveHttpRequest } from "../storage/collections"
import type { PostmanApi } from "./api"
import { safeImportDirectory } from "./pull"
import {
  postmanRemoteHash,
  postmanRemoteFolders,
  postmanRemoteRequests,
  postmanRequestKey,
  postmanRequestSnapshot,
  postmanSidecar,
  pushPostmanRequest,
  readPostmanProvenance,
  replacePostmanProvenance,
  writePostmanProvenance,
} from "./sync"

type MutationApi = Pick<
  PostmanApi,
  | "collection"
  | "createCollection"
  | "renameCollection"
  | "deleteCollection"
  | "createRequest"
  | "updateRequest"
  | "deleteRequest"
>

export function isPostmanPath(path: string) {
  return path.replaceAll("\\", "/").startsWith("postman/")
}

function remoteId(value: unknown) {
  const object = value && typeof value === "object" ? (value as Record<string, unknown>) : null
  const data =
    object?.data && typeof object.data === "object"
      ? (object.data as Record<string, unknown>)
      : null
  const id = object?.id ?? data?.id ?? object?.model_id
  if (typeof id !== "string" || !/^[\w-]{1,128}$/u.test(id)) {
    throw new Error("O Postman não retornou um ID válido; atualize a coleção antes de continuar.")
  }
  return id
}

function folderIdForPath(collection: unknown, path: string) {
  const parts = path.split(" / ").filter(Boolean)
  let items = (collection as { item?: unknown })?.item
  let id: string | undefined
  for (const part of parts) {
    if (!Array.isArray(items))
      throw new Error("A pasta Postman mudou; importe a coleção novamente.")
    const folders = items.filter((item): item is { id: string; name: string; item: unknown } =>
      Boolean(item && typeof item === "object" && item.name === part && Array.isArray(item.item)),
    )
    if (folders.length !== 1 || !/^[\w-]{1,128}$/u.test(folders[0]?.id ?? "")) {
      throw new Error("A pasta Postman mudou; importe a coleção novamente.")
    }
    id = folders[0]?.id
    items = folders[0]?.item
  }
  return id
}

async function metadata(root: string, path: string) {
  const metadataPath = await postmanSidecar(root, path)
  return { metadataPath, value: await readPostmanProvenance(metadataPath) }
}

async function createLocalFolderRequest(
  root: string,
  path: string,
  name: string,
  expectedHash: string,
) {
  const current = await readFile(resolve(root, path), "utf8")
  if (projectFileHash(current) !== expectedHash) {
    throw new Error("A coleção local mudou; atualize antes de criar a request.")
  }
  const parsed = parseHttpFile(current, path)
  const blockId = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
  if (parsed.requests.some((block) => block.blockId === `${path}#${blockId}`)) {
    throw new Error("Já existe uma request com esse nome na coleção.")
  }
  const request = {
    ...createScratchRequest(`http-new-${Date.now()}`, "https://example.invalid"),
    name,
  }
  const separator = current && !current.endsWith("\n") ? "\n\n" : current ? "\n" : ""
  const next = `${current}${separator}${serializeHttpRequestBlock(request)}`
  await atomicWriteProjectFile(root, path, next, { expectedHash })
  const nextFile = parseHttpFile(next, path)
  const block = nextFile.requests.at(-1)
  if (!block) throw new Error("A request criada não pôde ser relida.")
  return requestFromHttpFile(nextFile, block)
}

export async function createPostmanCollection(
  root: string,
  api: MutationApi,
  workspaceId: string,
  name: string,
) {
  await ensureHttpWorkspaceDirectory(root)
  await safeImportDirectory(await realpath(root))
  const path = await createHttpCollection(root, "postman", name)
  let collectionId: string | null = null
  try {
    collectionId = remoteId(await api.createCollection(workspaceId, name.trim()))
    const collection = await api.collection(collectionId)
    await writePostmanProvenance(root, path, collectionId, collection, workspaceId)
    return path
  } catch (error) {
    await deleteHttpCollection(root, path, projectFileHash("")).catch(() => {})
    if (collectionId) {
      throw new Error(
        `Coleção criada no Postman (${collectionId}), mas o vínculo local falhou. Importe-a novamente.`,
        { cause: error },
      )
    }
    throw error
  }
}

export async function createPostmanRequest(
  root: string,
  api: MutationApi,
  path: string,
  name: string,
  expectedHash: string,
  folderId?: string,
) {
  const association = await metadata(root, path)
  const beforeRemote = await api.collection(association.value.collectionId)
  const collectionBaselineMatches =
    association.value.collectionHash === postmanRemoteHash(beforeRemote)
  const folder = folderId
    ? association.value.folders?.find((candidate) => candidate.id === folderId)
    : undefined
  if (folderId && (!folder || !name.startsWith(`${folder.path} / `))) {
    throw new Error("Selecione uma pasta Postman vinculada para criar a request.")
  }
  const separator = name.lastIndexOf(" / ")
  const leafName = separator < 0 ? name : name.slice(separator + 3)
  if (!leafName.trim() || /[\\/\0\r\n]/u.test(leafName)) {
    throw new Error("Use um nome de request sem barras ou caracteres de controle.")
  }
  const created = folderId
    ? await createLocalFolderRequest(root, path, name, expectedHash)
    : await createHttpRequestInCollection(root, path, name, expectedHash)
  let remoteCreated = false
  try {
    const response = await api.createRequest(
      association.value.collectionId,
      leafName.trim(),
      folderId,
    )
    remoteCreated = true
    const requestId = remoteId(response)
    const collection = await api.collection(association.value.collectionId)
    const remote = postmanRemoteRequests(collection).find((item) => item.id === requestId)
    if (!remote)
      throw new Error(
        "Request criada no Postman, mas não foi possível vinculá-la. Reimporte a coleção.",
      )
    association.value.entries.push({
      key: postmanRequestKey(created.source.kind === "file" ? created.source.blockId : ""),
      requestId,
      remoteHash: postmanRemoteHash(remote),
      baseline: postmanRequestSnapshot(created),
    })
    if (collectionBaselineMatches) {
      association.value.collectionHash = postmanRemoteHash(collection)
      association.value.folders = postmanRemoteFolders(collection)
    }
    await replacePostmanProvenance(association.metadataPath, association.value)
    return created
  } catch (error) {
    await deleteHttpRequest(root, created, { preserveEmpty: true }).catch(() => {})
    if (remoteCreated) {
      throw new Error(
        "Request criada no Postman, mas o vínculo local falhou. Importe a coleção novamente.",
        {
          cause: error,
        },
      )
    }
    throw error
  }
}

export async function duplicatePostmanRequest(
  root: string,
  api: MutationApi,
  request: HttpRequestDefinition,
) {
  if (request.source.kind !== "file" || !isPostmanPath(request.source.path)) {
    throw new Error("Selecione uma request Postman salva para duplicar.")
  }
  const separator = request.name.lastIndexOf(" / ")
  const leaf = separator < 0 ? request.name : request.name.slice(separator + 3)
  const name = `${leaf} copy`
  const folderId =
    separator < 0
      ? undefined
      : folderIdForPath(
          await api.collection((await metadata(root, request.source.path)).value.collectionId),
          request.name.slice(0, separator),
        )
  const created = await createPostmanRequest(
    root,
    api,
    request.source.path,
    separator < 0 ? name : `${request.name.slice(0, separator + 3)}${name}`,
    request.source.sourceHash,
    folderId,
  )
  try {
    const saved = await saveHttpRequest(root, {
      ...request,
      id: created.id,
      name: separator < 0 ? name : `${request.name.slice(0, separator + 3)}${name}`,
      source: created.source,
    })
    await pushPostmanRequest(root, api, saved)
    return saved
  } catch (error) {
    throw new Error("A cópia foi criada no Postman, mas não foi concluída; atualize a coleção.", {
      cause: error,
    })
  }
}

export async function renamePostmanRequest(
  root: string,
  api: MutationApi,
  request: HttpRequestDefinition,
  name: string,
) {
  const separator = request.name.lastIndexOf(" / ")
  const prefix = separator < 0 ? "" : request.name.slice(0, separator + 3)
  let saved: HttpRequestDefinition
  if (prefix) {
    const leaf = name.startsWith(prefix) ? name.slice(prefix.length) : name
    if (!leaf.trim() || /[\\/\0\r\n]/u.test(leaf)) {
      throw new Error("Renomeie apenas a request, sem alterar a pasta Postman.")
    }
    saved = await saveHttpRequest(root, { ...request, name: `${prefix}${leaf.trim()}` })
  } else saved = await renameHttpRequest(root, request, name)
  await pushPostmanRequest(root, api, saved)
  return saved
}

export async function deletePostmanRequest(
  root: string,
  api: MutationApi,
  request: HttpRequestDefinition,
) {
  if (request.source.kind !== "file") throw new Error("Request sem arquivo Postman.")
  const { metadataPath, value } = await metadata(root, request.source.path)
  const key = postmanRequestKey(request.source.blockId)
  const entry = value.entries.find((candidate) => candidate.key === key)
  if (!entry) throw new Error("Request sem ID Postman; importe a coleção novamente.")
  const content = await readFile(resolve(root, request.source.path), "utf8")
  if (projectFileHash(content) !== request.source.sourceHash) {
    throw new Error("O arquivo HTTP mudou; recarregue antes de excluir.")
  }
  const collection = await api.collection(value.collectionId)
  const collectionBaselineMatches = value.collectionHash === postmanRemoteHash(collection)
  const remote = postmanRemoteRequests(collection).find((item) => item.id === entry.requestId)
  if (!remote || postmanRemoteHash(remote) !== entry.remoteHash) {
    throw new Error("A request mudou no Postman; importe a coleção novamente antes de excluir.")
  }
  await api.deleteRequest(value.collectionId, entry.requestId)
  await deleteHttpRequest(root, request, { preserveEmpty: true })
  value.entries = value.entries.filter((candidate) => candidate.key !== key)
  if (collectionBaselineMatches) {
    const refreshed = await api.collection(value.collectionId)
    value.collectionHash = postmanRemoteHash(refreshed)
    value.folders = postmanRemoteFolders(refreshed)
  }
  await replacePostmanProvenance(metadataPath, value)
}

export async function renamePostmanCollection(
  root: string,
  api: MutationApi,
  path: string,
  name: string,
  expectedHash: string,
) {
  const { metadataPath, value } = await metadata(root, path)
  if (
    !name.trim() ||
    /[\\/\0\r\n]/u.test(name) ||
    name.trim() === "." ||
    name.trim() === ".." ||
    name.trim() === ".tuiminal"
  ) {
    throw new Error("Use um nome de coleção sem barras ou caracteres de controle.")
  }
  const source = await readFile(resolve(root, path), "utf8")
  if (projectFileHash(source) !== expectedHash) {
    throw new Error("A coleção local mudou; atualize antes de renomear.")
  }
  const destinationName = /\.(?:http|rest)$/iu.test(name.trim())
    ? name.trim()
    : `${name.trim()}.http`
  const destination = `postman/${destinationName}`
  if (destination !== path && (await lstat(resolve(root, destination)).catch(() => null))) {
    throw new Error("Já existe uma coleção com esse nome.")
  }
  const collectionBaselineMatches =
    value.collectionHash === postmanRemoteHash(await api.collection(value.collectionId))
  await api.renameCollection(value.collectionId, name.trim())
  const newPath = await renameHttpCollection(root, path, name, expectedHash)
  const newSidecar = `${resolve(root, newPath)}.postman.json`
  if (newPath !== path) await rename(metadataPath, newSidecar)
  if (collectionBaselineMatches)
    value.collectionHash = postmanRemoteHash(await api.collection(value.collectionId))
  await replacePostmanProvenance(newSidecar, value)
  return newPath
}

export async function deletePostmanCollection(
  root: string,
  api: MutationApi,
  path: string,
  expectedHash: string,
) {
  const { metadataPath, value } = await metadata(root, path)
  const source = await readFile(resolve(root, path), "utf8")
  if (projectFileHash(source) !== expectedHash)
    throw new Error("A coleção local mudou; atualize antes de excluir.")
  const remote = await api.collection(value.collectionId)
  if (!value.collectionHash || postmanRemoteHash(remote) !== value.collectionHash) {
    throw new Error("A coleção mudou no Postman; importe novamente antes de excluir.")
  }
  await api.deleteCollection(value.collectionId)
  await deleteHttpCollection(root, path, expectedHash)
  await rm(metadataPath)
}
