import { requirePostmanSession, type LivePostmanSession } from "../postman/live-session"
import { manageLivePostmanCollection } from "../postman/live-mutations"
import { duplicateCollectionItem, refreshDuplicatedSource } from "./duplicate-http-collection-item"
import { dirname } from "node:path"
import { useCallback, useRef } from "react"
import { projectFileHash } from "@xupon/tuiminal-core/storage/project-files"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import type { HttpDocumentState, HttpProjectRequestItem } from "../model/types"
import { belongsToHttpSource, type HttpSourceMode } from "../model/source-mode"
import type { HttpWorkspaceAction } from "../model/workspace"
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
  | "duplicate"
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
) {
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

async function performLocalAction(action: HttpCollectionAction, input: ManagementInput) {
  if (action === "duplicate")
    return duplicateCollectionItem(input.root, input.files, input.row, input.name)
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
  postmanSession,
  ensurePostmanSession,
  files,
  getDocuments,
  settingsBlocked,
  dispatch,
  refreshProject,
  openRequest,
  setNotice,
}: {
  root: string
  sourceMode: HttpSourceMode
  postmanSession?: LivePostmanSession | null
  ensurePostmanSession?: (workspaceId?: string) => Promise<LivePostmanSession>
  files: CollectionFile[]
  getDocuments: () => HttpDocumentState[]
  settingsBlocked?: () => boolean
  dispatch: (action: HttpWorkspaceAction) => void
  refreshProject: () => Promise<void>
  openRequest: (item: HttpProjectRequestItem) => void
  setNotice: (notice: string) => void
}) {
  const busy = useRef(false)
  const manage = useCallback(
    async (
      action: HttpCollectionAction,
      row: HttpCollectionTreeRow | null,
      name = "",
      destination?: HttpCollectionDestination,
    ) => {
      if (busy.current) return false
      busy.current = true
      try {
        if (settingsBlocked?.())
          throw new Error("Salve ou feche as configurações alteradas antes de mudar de workspace.")
        if (!validAction(action, name, row)) return false
        assertSourceAction(sourceMode, action, row, destination)
        const all = getDocuments()
        const affected = affectedDocuments(action, row, all)
        assertReady(affected)
        const opened =
          sourceMode === "postman"
            ? await manageLivePostmanCollection(
                await collectionSession(postmanSession, ensurePostmanSession, destination),
                action,
                row,
                name,
                destination?.kind === "postman" ? destination.workspaceId : undefined,
              )
            : await performLocalAction(action, { root, files, row, name })
        await finishCollectionAction(
          action,
          root,
          row,
          postmanSession,
          getDocuments,
          dispatch,
          affected,
        )
        const selection = openManagedRequest(opened, openRequest)
        await refreshProject()
        setNotice(action === "delete" ? "ITEM EXCLUÍDO DA COLEÇÃO" : "COLEÇÃO ATUALIZADA")
        return selection
      } catch (error) {
        await refreshProject().catch(() => {})
        setNotice(error instanceof Error ? error.message : String(error))
        return false
      } finally {
        busy.current = false
      }
    },
    [
      dispatch,
      files,
      getDocuments,
      settingsBlocked,
      openRequest,
      refreshProject,
      root,
      setNotice,
      sourceMode,
      postmanSession,
      ensurePostmanSession,
    ],
  )
  return { manage, pending: false, content: null }
}

async function finishCollectionAction(
  action: HttpCollectionAction,
  root: string,
  row: HttpCollectionTreeRow | null,
  session: LivePostmanSession | null | undefined,
  getDocuments: () => HttpDocumentState[],
  dispatch: (action: HttpWorkspaceAction) => void,
  affected: HttpDocumentState[],
) {
  if (action !== "duplicate") closeAffected(dispatch, affected)
  else if (!session) await refreshDuplicatedSource(root, row, getDocuments, dispatch)
}

async function collectionSession(
  session: LivePostmanSession | null | undefined,
  ensure: ((workspaceId?: string) => Promise<LivePostmanSession>) | undefined,
  destination: HttpCollectionDestination | undefined,
) {
  if (ensure) return ensure(destination?.kind === "postman" ? destination.workspaceId : undefined)
  return requirePostmanSession(session)
}

function validAction(
  action: HttpCollectionAction,
  name: string,
  row: HttpCollectionTreeRow | null,
) {
  if (action !== "delete" && !name.trim()) throw new Error("Informe um nome.")
  return !(["rename", "delete", "duplicate"].includes(action) && !row)
}

function openManagedRequest(
  opened: HttpProjectRequestItem | string | null,
  open: (item: HttpProjectRequestItem) => void,
) {
  if (typeof opened === "string") return opened
  if (opened) open(opened)
  return true
}
