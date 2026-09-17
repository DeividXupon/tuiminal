import { dirname } from "node:path"
import { useCallback } from "react"
import { projectFileHash } from "@xupon/tuiminal-core/storage/project-files"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import type { HttpDocumentState, HttpProjectRequestItem } from "../model/types"
import { createScratchRequest, type HttpWorkspaceAction } from "../model/workspace"
import { deleteHttpRequest } from "../storage/collections"
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

async function performAction(action: HttpCollectionAction, input: ManagementInput) {
  if (action === "delete") {
    await deleteItem(input)
    return null
  }
  if (action === "rename") return renameItem(input)
  return createItem(input, action)
}

export function useHttpCollectionManagement({
  root,
  files,
  getDocuments,
  dispatch,
  refreshProject,
  openRequest,
  setNotice,
}: {
  root: string
  files: CollectionFile[]
  getDocuments: () => HttpDocumentState[]
  dispatch: (action: HttpWorkspaceAction) => void
  refreshProject: () => Promise<void>
  openRequest: (item: HttpProjectRequestItem) => void
  setNotice: (notice: string) => void
}) {
  return useCallback(
    async (action: HttpCollectionAction, row: HttpCollectionTreeRow | null, name = "") => {
      try {
        if (action !== "delete" && !name.trim()) throw new Error("Informe um nome.")
        if ((action === "rename" || action === "delete") && !row) return false
        const all = getDocuments()
        const affected = affectedDocuments(action, row, all)
        assertReady(affected)
        const opened = await performAction(action, { root, files, row, name })
        closeAffected(dispatch, affected, all)
        if (opened) openRequest(opened)
        await refreshProject()
        setNotice(action === "delete" ? "ITEM EXCLUÍDO DA COLEÇÃO" : "COLEÇÃO ATUALIZADA")
        return true
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
        return false
      }
    },
    [dispatch, files, getDocuments, openRequest, refreshProject, root, setNotice],
  )
}
