import { useCallback, useState, type RefObject } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpDocumentState } from "../model/types"
import type { HttpRequestDefinition } from "../model/types"
import { HTTP_DOCUMENT_LIMIT, type HttpWorkspaceAction } from "../model/workspace"
import type { HttpDocumentRefs } from "../runtime"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi } from "../postman/api"
import { duplicatePostmanRequest, isPostmanPath } from "../postman/mutations"
import { pushPostmanRequest } from "../postman/sync"
import { savePostmanDraft } from "../postman/draft"
import { belongsToHttpSource, type HttpSourceMode } from "../model/source-mode"
import {
  duplicateHttpRequest,
  HttpExternalChangeError,
  saveHttpRequest,
} from "../storage/collections"
import {
  inspectHttpExternalConflict,
  resolveHttpExternalConflict,
  type HttpExternalConflictPreview,
  type HttpExternalConflictResolution,
} from "../storage/conflicts"

async function savedRequestNotice(root: string, saved: HttpRequestDefinition) {
  if (saved.source.kind !== "file" || !isPostmanPath(saved.source.path)) {
    return `REQUEST SALVO · ${saved.source.kind === "file" ? saved.source.path : saved.name}`
  }
  try {
    const account = await loadPostmanAccount()
    if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
    const result = await pushPostmanRequest(root, new PostmanApi(account), saved)
    return result === "pushed" ? "REQUEST SALVO NO POSTMAN" : "REQUEST SALVO · POSTMAN EM DIA"
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `${translateUi("SALVO LOCALMENTE · POSTMAN PENDENTE")}: ${message}`
  }
}

export function useHttpRequestPersistence({
  root,
  sourceMode,
  collectionFiles,
  documents,
  documentRefs,
  dispatch,
  refreshProject,
  setNotice,
}: {
  root: string
  sourceMode: HttpSourceMode
  collectionFiles: Array<{ path: string; sourceHash: string }>
  documents: HttpDocumentState[]
  documentRefs: RefObject<Map<string, HttpDocumentRefs>>
  dispatch: (action: HttpWorkspaceAction) => void
  refreshProject: () => Promise<void>
  setNotice: (notice: string) => void
}) {
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
        setPendingPostmanSaveId(documentId)
        return
      }
      if (
        sourceMode === "postman" &&
        document.request.source.kind === "file" &&
        !belongsToHttpSource(document.request.source.path, sourceMode)
      ) {
        setNotice("A request pertence à biblioteca local.")
        return
      }
      setNotice("SALVANDO REQUEST…")
      try {
        const saved = await saveHttpRequest(root, document.request)
        if (saved.id !== documentId) documentRefs.current.delete(documentId)
        dispatch({ type: "commit-saved-document", documentId, request: saved })
        await refreshProject()
        setNotice(await savedRequestNotice(root, saved))
      } catch (error) {
        if (error instanceof HttpExternalChangeError) {
          await openExternalConflict(document.request)
          return
        }
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [
      dispatch,
      documentRefs,
      documents,
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
      if (!document || document.request.source.kind !== "scratch") return
      const collection = collectionFiles.find((file) => file.path === path)
      if (!collection) {
        setNotice("A coleção Postman mudou; atualize a biblioteca.")
        return
      }
      setPendingPostmanSaveId(null)
      try {
        const account = await loadPostmanAccount()
        if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
        setNotice("SALVANDO REQUEST NO POSTMAN…")
        const saved = await savePostmanDraft(
          root,
          new PostmanApi(account),
          document.request,
          path,
          collection.sourceHash,
          folder,
        )
        if (saved.id !== document.request.id) documentRefs.current.delete(document.request.id)
        dispatch({ type: "commit-saved-document", documentId: document.request.id, request: saved })
        await refreshProject()
        setNotice("REQUEST SALVO NO POSTMAN")
      } catch (error) {
        await refreshProject().catch(() => {})
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [
      collectionFiles,
      dispatch,
      documentRefs,
      documents,
      pendingPostmanSaveId,
      refreshProject,
      root,
      setNotice,
    ],
  )

  const duplicateDocument = useCallback(
    async (documentId: string) => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (!document || documents.length >= HTTP_DOCUMENT_LIMIT) return
      try {
        const postman =
          document.request.source.kind === "file" && isPostmanPath(document.request.source.path)
        if (postman && document.revision !== document.savedRevision) {
          throw new Error("Salve a request antes de duplicá-la no Postman.")
        }
        const duplicate = postman
          ? await (async () => {
              const account = await loadPostmanAccount()
              if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
              return duplicatePostmanRequest(root, new PostmanApi(account), document.request)
            })()
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
    [dispatch, documents, refreshProject, root, setNotice],
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
