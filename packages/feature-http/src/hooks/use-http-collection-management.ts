import { dirname } from "node:path"
import { useCallback } from "react"
import { projectFileHash } from "@xupon/tuiminal-core/storage/project-files"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import type { HttpDocumentState, HttpProjectRequestItem } from "../model/types"
import { belongsToHttpSource, type HttpSourceMode } from "../model/source-mode"
import { createScratchRequest, type HttpWorkspaceAction } from "../model/workspace"
import { deleteHttpRequest } from "../storage/collections"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi } from "../postman/api"
import {
  createPostmanCollection,
  createPostmanRequest,
  deletePostmanCollection,
  deletePostmanRequest,
  isPostmanPath,
  renamePostmanCollection,
  renamePostmanRequest,
} from "../postman/mutations"
import {
  createPostmanFolder,
  deletePostmanFolder,
  renamePostmanFolder,
} from "../postman/folder-mutations"
import {
  createHttpCollection,
  createHttpFolder,
  createHttpRequestInCollection,
  deleteHttpCollection,
  deleteHttpFolder,
  renameHttpCollection,
  renameHttpFolder,
  renameHttpRequest,
} from "../storage/collection-management"

export type HttpCollectionAction =
  | "create-collection"
  | "create-folder"
  | "create-request"
  | "rename"
  | "delete"
export type HttpCollectionDestination =
  | { kind: "tuiminal" }
  | { kind: "postman"; workspaceId: string }
type CollectionFile = { path: string; sourceHash: string }
type ManagementInput = {
  root: string
  files: CollectionFile[]
  row: HttpCollectionTreeRow | null
  name: string
}

function parentPath(row: HttpCollectionTreeRow | null) {
  return row?.kind === "directory" ? row.path : row ? dirname(row.path) : ""
}

function fileHash(files: CollectionFile[], path: string) {
  const file = files.find((item) => item.path === path)
  if (!file) throw new Error("A coleção não está mais na árvore; atualize antes de continuar.")
  return file.sourceHash
}

function affectedDocuments(
  action: HttpCollectionAction,
  row: HttpCollectionTreeRow | null,
  documents: HttpDocumentState[],
) {
  if (
    !row ||
    action === "create-folder" ||
    action === "create-collection" ||
    (action === "create-request" && row.kind === "directory")
  )
    return []
  return documents.filter((document) => {
    const source = document.request.source
    if (source.kind !== "file") return false
    return row.kind === "directory"
      ? source.path.startsWith(`${row.path}/`)
      : source.path === row.path
  })
}

function assertReady(documents: HttpDocumentState[]) {
  if (documents.some((document) => document.revision !== document.savedRevision)) {
    throw new Error("Salve ou feche os requests alterados antes de mudar a coleção.")
  }
  if (documents.some((document) => document.execution.status === "running")) {
    throw new Error("Aguarde ou cancele o request em execução antes de mudar a coleção.")
  }
}

function closeAffected(
  dispatch: (action: HttpWorkspaceAction) => void,
  affected: HttpDocumentState[],
  all: HttpDocumentState[],
) {
  if (affected.length && affected.length === all.length) {
    dispatch({ type: "add-document", request: createScratchRequest(`http-scratch-${Date.now()}`) })
  }
  for (const document of affected)
    dispatch({ type: "close-document", documentId: document.request.id })
}

async function createItem(
  { root, files, row, name }: ManagementInput,
  action: HttpCollectionAction,
): Promise<HttpProjectRequestItem | null> {
  if (action === "create-collection") {
    await createHttpCollection(root, parentPath(row), name)
    return null
  }
  if (action === "create-folder") {
    await createHttpFolder(root, parentPath(row), name)
    return null
  }
  const path =
    row?.kind === "directory" || !row
      ? await createHttpCollection(root, parentPath(row), name)
      : row.path
  const hash = row?.kind === "directory" || !row ? projectFileHash("") : fileHash(files, path)
  const request = await createHttpRequestInCollection(root, path, name, hash)
  return { filePath: path, request }
}

async function renameItem({
  root,
  files,
  row,
  name,
}: ManagementInput): Promise<HttpProjectRequestItem | null> {
  if (!row) return null
  if (row.kind === "request") {
    const request = await renameHttpRequest(root, row.item.request, name)
    return { filePath: row.path, request }
  }
  if (row.kind === "file") {
    await renameHttpCollection(root, row.path, name, fileHash(files, row.path))
  } else await renameHttpFolder(root, row.path, name)
  return null
}

async function deleteItem({ root, files, row }: ManagementInput) {
  if (!row) return
  if (row.kind === "request") await deleteHttpRequest(root, row.item.request)
  else if (row.kind === "file")
    await deleteHttpCollection(root, row.path, fileHash(files, row.path))
  else await deleteHttpFolder(root, row.path)
}

async function connectedPostmanApi() {
  const account = await loadPostmanAccount()
  if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
  return new PostmanApi(account)
}

async function existingPostmanAction(
  action: HttpCollectionAction,
  input: ManagementInput,
): Promise<HttpProjectRequestItem | null> {
  const { root, files, row, name } = input
  if (!row) return null
  const path = row.path
  const api = await connectedPostmanApi()
  if (action === "create-request") {
    return createLinkedRequest(root, api, files, row, name)
  }
  if (action === "create-folder") {
    await createLinkedFolder(root, api, row, name)
    return null
  }
  if (action === "rename") {
    if (row?.kind === "request") {
      const request = await renamePostmanRequest(root, api, row.item.request, name)
      return { filePath: path, request }
    }
    if (row.kind === "folder") {
      await renamePostmanFolder(root, api, path, row.folderId, name, fileHash(files, path))
      return null
    }
    await renamePostmanCollection(root, api, path, name, fileHash(files, path))
    return null
  }
  if (action === "delete") {
    if (row?.kind === "request") await deletePostmanRequest(root, api, row.item.request)
    else if (row.kind === "folder")
      await deletePostmanFolder(root, api, path, row.folderId, fileHash(files, path))
    else await deletePostmanCollection(root, api, path, fileHash(files, path))
  }
  return null
}

async function createLinkedRequest(
  root: string,
  api: PostmanApi,
  files: CollectionFile[],
  row: HttpCollectionTreeRow,
  name: string,
) {
  const path = row.path
  const request = await createPostmanRequest(
    root,
    api,
    path,
    row.kind === "folder" ? `${row.folderPath} / ${name}` : name,
    fileHash(files, path),
    row.kind === "folder" ? row.folderId : undefined,
  )
  return { filePath: path, request }
}

async function createLinkedFolder(
  root: string,
  api: PostmanApi,
  row: HttpCollectionTreeRow,
  name: string,
) {
  if (row.kind === "request") throw new Error("Selecione a coleção ou pasta Postman.")
  await createPostmanFolder(
    root,
    api,
    row.path,
    name,
    row.kind === "folder" ? row.folderId : undefined,
  )
}

async function postmanAction(
  action: HttpCollectionAction,
  input: ManagementInput,
  destination?: HttpCollectionDestination,
): Promise<HttpProjectRequestItem | null> {
  const { root, row, name } = input
  if (action === "create-collection") {
    if (destination?.kind === "postman") {
      await createPostmanCollection(
        root,
        await connectedPostmanApi(),
        destination.workspaceId,
        name,
      )
      return null
    }
    const inPostmanDirectory =
      row?.kind === "directory" && (row.path === "postman" || isPostmanPath(row.path))
    return createItem(inPostmanDirectory ? { ...input, row: null } : input, action)
  }
  if (row?.kind === "directory" && (row.path === "postman" || isPostmanPath(row.path))) {
    if (action === "create-request")
      throw new Error("Selecione uma coleção Postman para criar a request.")
    throw new Error("Pastas locais em /postman não representam pastas do Postman.")
  }
  if (row?.kind !== "directory" && row && isPostmanPath(row.path)) {
    return existingPostmanAction(action, input)
  }
  return performLocalAction(action, input)
}

async function performLocalAction(action: HttpCollectionAction, input: ManagementInput) {
  if (action === "delete") {
    await deleteItem(input)
    return null
  }
  if (action === "rename") return renameItem(input)
  return createItem(input, action)
}

function assertSourceAction(
  sourceMode: HttpSourceMode,
  action: HttpCollectionAction,
  row: HttpCollectionTreeRow | null,
  destination?: HttpCollectionDestination,
) {
  if (row && !belongsToHttpSource(row.path, sourceMode)) {
    throw new Error("O item pertence a outra origem HTTP.")
  }
  if (sourceMode === "local") {
    if (destination?.kind === "postman") {
      throw new Error("Troque para a origem Postman antes de criar a coleção.")
    }
    return
  }
  if (action === "create-folder" && (!row || row.kind === "request" || row.kind === "directory")) {
    throw new Error("Selecione uma coleção ou pasta Postman para criar a pasta.")
  }
  if (action === "create-request" && (!row || row.kind === "directory")) {
    throw new Error("Selecione uma coleção Postman para criar a request.")
  }
  if (action === "create-collection" && destination?.kind !== "postman") {
    throw new Error("Selecione um workspace Postman para criar a coleção.")
  }
}

export function useHttpCollectionManagement({
  root,
  sourceMode,
  files,
  getDocuments,
  dispatch,
  refreshProject,
  openRequest,
  setNotice,
}: {
  root: string
  sourceMode: HttpSourceMode
  files: CollectionFile[]
  getDocuments: () => HttpDocumentState[]
  dispatch: (action: HttpWorkspaceAction) => void
  refreshProject: () => Promise<void>
  openRequest: (item: HttpProjectRequestItem) => void
  setNotice: (notice: string) => void
}) {
  return useCallback(
    async (
      action: HttpCollectionAction,
      row: HttpCollectionTreeRow | null,
      name = "",
      destination?: HttpCollectionDestination,
    ) => {
      try {
        if (action !== "delete" && !name.trim()) throw new Error("Informe um nome.")
        if ((action === "rename" || action === "delete") && !row) return false
        assertSourceAction(sourceMode, action, row, destination)
        const all = getDocuments()
        const affected = affectedDocuments(action, row, all)
        assertReady(affected)
        const opened = await postmanAction(action, { root, files, row, name }, destination)
        closeAffected(dispatch, affected, all)
        if (opened) openRequest(opened)
        await refreshProject()
        setNotice(action === "delete" ? "ITEM EXCLUÍDO DA COLEÇÃO" : "COLEÇÃO ATUALIZADA")
        return true
      } catch (error) {
        await refreshProject().catch(() => {})
        setNotice(error instanceof Error ? error.message : String(error))
        return false
      }
    },
    [dispatch, files, getDocuments, openRequest, refreshProject, root, setNotice, sourceMode],
  )
}
