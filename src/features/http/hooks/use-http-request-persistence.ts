import { useCallback, useState, type RefObject } from "react"
import type { HttpDocumentState } from "../model/types"
import { HTTP_DOCUMENT_LIMIT, type HttpWorkspaceAction } from "../model/workspace"
import type { HttpDocumentRefs } from "../runtime"
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

export function useHttpRequestPersistence({
  root,
  documents,
  documentRefs,
  dispatch,
  refreshProject,
  setNotice,
}: {
  root: string
  documents: HttpDocumentState[]
  documentRefs: RefObject<Map<string, HttpDocumentRefs>>
  dispatch: (action: HttpWorkspaceAction) => void
  refreshProject: () => Promise<void>
  setNotice: (notice: string) => void
}) {
  const [externalConflict, setExternalConflict] = useState<HttpExternalConflictPreview | null>(null)
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
      setNotice("SALVANDO REQUEST…")
      try {
        const saved = await saveHttpRequest(root, document.request)
        if (saved.id !== documentId) documentRefs.current.delete(documentId)
        dispatch({ type: "commit-saved-document", documentId, request: saved })
        setNotice(
          `REQUEST SALVO · ${saved.source.kind === "file" ? saved.source.path : saved.name}`,
        )
        await refreshProject()
      } catch (error) {
        if (error instanceof HttpExternalChangeError) {
          await openExternalConflict(document.request)
          return
        }
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [dispatch, documentRefs, documents, openExternalConflict, refreshProject, root, setNotice],
  )

  const duplicateDocument = useCallback(
    async (documentId: string) => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (!document || documents.length >= HTTP_DOCUMENT_LIMIT) return
      try {
        const duplicate = await duplicateHttpRequest(root, document.request)
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
    duplicateDocument,
    externalConflict,
    resolvingExternalConflict,
    resolveExternalConflict,
    cancelExternalConflict,
  }
}
