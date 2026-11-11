import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import { type RefObject, useCallback, useRef, useState } from "react"
import type { HttpSourceMode } from "../model/source-mode"
import type { HttpDocumentState, HttpRequestDefinition } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import { createLivePostmanRequest, duplicateLivePostmanRequest } from "../postman/live-mutations"
import { type LivePostmanSession, requirePostmanSession } from "../postman/live-session"
import { isPostmanPath } from "../postman/mutations"
import type { HttpDocumentRefs } from "../runtime"
import {
  duplicateHttpRequest,
  HttpExternalChangeError,
  saveHttpRequest,
} from "../storage/collections"
import {
  type HttpExternalConflictPreview,
  type HttpExternalConflictResolution,
  inspectHttpExternalConflict,
  resolveHttpExternalConflict,
} from "../storage/conflicts"

export function useHttpRequestPersistence({
  root,
  sourceMode,
  postmanSession,
  collectionFiles,
  documents,
  documentRefs,
  dispatch,
  refreshProject,
  setNotice,
}: {
  root: string
  sourceMode: HttpSourceMode
  postmanSession?: LivePostmanSession | null
  collectionFiles: Array<{ path: string; sourceHash: string }>
  documents: HttpDocumentState[]
  documentRefs: RefObject<Map<string, HttpDocumentRefs>>
  dispatch: (action: HttpWorkspaceAction) => void
  refreshProject: () => Promise<void>
  setNotice: (notice: string) => void
}) {
  const { notify } = useNotifications()
  const saving = useRef(new Set<string>())
  const [externalConflict, setExternalConflict] = useState<HttpExternalConflictPreview | null>(null)
  const [pendingPostmanSaveId, setPendingPostmanSaveId] = useState<string | null>(null)
  const [resolvingExternalConflict, setResolvingExternalConflict] = useState(false)
  const cancelExternalConflict = useCallback(() => setExternalConflict(null), [])
  const openExternalConflict = useCallback(
    async (request: HttpDocumentState["request"]) => {
      try {
        setExternalConflict(await inspectHttpExternalConflict(root, request))
        dispatch({ type: "open-overlay", overlay: "external-conflict" })
        setNotice("CONFLITO EXTERNO · REVISE AS ALTERAÇÕES")
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [dispatch, root, setNotice],
  )
  const saveDocument = useCallback(
    async (documentId: string) => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (!document || document.execution.status === "running") return
      if (sourceMode === "postman" && document.request.source.kind === "scratch") {
        setPendingPostmanSaveId(postmanDraftToSave(document))
        return
      }
      if (saving.current.has(documentId)) return
      saving.current.add(documentId)
      setNotice("SALVANDO REQUEST…")
      try {
        const saved = await saveForSource(root, sourceMode, postmanSession, document.request)
        if (saved.id !== documentId) documentRefs.current.delete(documentId)
        dispatch({
          type: "commit-saved-document",
          documentId,
          request: saved,
          revision: document.revision,
          submittedRequest: document.request,
        })
        await refreshProject()
        notify({ source: "HTTP", kind: "success", message: savedNotice(sourceMode, saved) })
      } catch (error) {
        if (error instanceof HttpExternalChangeError) {
          await openExternalConflict(document.request)
          return
        }
        notify({
          source: "HTTP",
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        saving.current.delete(documentId)
      }
    },
    [
      postmanSession,
      dispatch,
      documentRefs,
      documents,
      notify,
      openExternalConflict,
      refreshProject,
      root,
      setNotice,
      sourceMode,
    ],
  )

  const savePostmanDraftInCollection = useCallback(
    async (path: string, folder?: { id: string; path: string }) => {
      const document = documents.find((candidate) => candidate.request.id === pendingPostmanSaveId)
      if (document?.request.source.kind !== "scratch") return
      const collection = collectionFiles.find((file) => file.path === path)
      if (!collection) {
        setNotice("A coleção Postman mudou; atualize a biblioteca.")
        return
      }
      setPendingPostmanSaveId(null)
      try {
        if (!postmanSession) throw new Error("Selecione um workspace Postman.")
        setNotice("SALVANDO REQUEST NO POSTMAN…")
        const saved = await createLivePostmanRequest(
          postmanSession,
          path,
          document.request,
          folder?.id,
        )
        if (saved.id !== document.request.id) documentRefs.current.delete(document.request.id)
        dispatch({
          type: "commit-saved-document",
          documentId: document.request.id,
          request: saved,
          revision: document.revision,
          submittedRequest: document.request,
        })
        await refreshProject()
        setNotice("REQUEST SALVO NO POSTMAN")
      } catch (error) {
        await refreshProject().catch(() => {})
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [
      postmanSession,
      collectionFiles,
      dispatch,
      documentRefs,
      documents,
      pendingPostmanSaveId,
      refreshProject,
      setNotice,
    ],
  )

  const duplicateDocument = useCallback(
    async (documentId: string) => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (!document) return
      try {
        const postman =
          document.request.source.kind === "file" && isPostmanPath(document.request.source.path)
        if (postman && document.revision !== document.savedRevision) {
          throw new Error("Salve a request antes de duplicá-la no Postman.")
        }
        const duplicate = postman
          ? await duplicateLivePostmanRequest(
              requirePostmanSession(postmanSession),
              document.request,
            )
          : await duplicateHttpRequest(root, document.request)
        dispatch({ type: "add-document", request: duplicate })
        setNotice(
          `REQUEST DUPLICADO · ${duplicate.source.kind === "file" ? duplicate.source.path : duplicate.name}`,
        )
        await refreshProject()
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [dispatch, documents, refreshProject, root, setNotice, postmanSession],
  )

  const resolveExternalConflict = useCallback(
    async (resolution: HttpExternalConflictResolution) => {
      if (!externalConflict || resolvingExternalConflict) return
      const document = documents.find(
        (candidate) => candidate.request.id === externalConflict.documentId,
      )
      if (!document) return
      setResolvingExternalConflict(true)
      try {
        const saved = await resolveHttpExternalConflict(root, document.request, resolution)
        if (saved.id !== document.request.id) documentRefs.current.delete(document.request.id)
        dispatch({
          type: "commit-saved-document",
          documentId: document.request.id,
          request: saved,
        })
        setExternalConflict(null)
        dispatch({ type: "close-overlay" })
        setNotice(
          resolution === "reload"
            ? "VERSÃO EXTERNA RECARREGADA"
            : resolution === "save-copy"
              ? "VERSÃO LOCAL SALVA COMO CÓPIA"
              : "VERSÃO LOCAL APLICADA AO ARQUIVO ATUAL",
        )
        await refreshProject()
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      } finally {
        setResolvingExternalConflict(false)
      }
    },
    [
      dispatch,
      documentRefs,
      documents,
      externalConflict,
      refreshProject,
      resolvingExternalConflict,
      root,
      setNotice,
    ],
  )

  return {
    saveDocument,
    pendingPostmanSaveId,
    cancelPostmanSave: () => setPendingPostmanSaveId(null),
    savePostmanDraftInCollection,
    duplicateDocument,
    externalConflict,
    resolvingExternalConflict,
    resolveExternalConflict,
    cancelExternalConflict,
  }
}

function postmanDraftToSave({ request, revision, savedRevision }: HttpDocumentState) {
  return revision !== savedRevision || request.url.trim() ? request.id : null
}

function saveForSource(
  root: string,
  mode: HttpSourceMode,
  session: LivePostmanSession | null | undefined,
  request: HttpRequestDefinition,
) {
  return mode === "postman"
    ? requirePostmanSession(session).save(request)
    : saveHttpRequest(root, request)
}

function savedNotice(mode: HttpSourceMode, request: HttpRequestDefinition) {
  if (mode === "postman") return "REQUEST SALVO NO POSTMAN"
  return `REQUEST SALVO · ${request.source.kind === "file" ? request.source.path : request.name}`
}
