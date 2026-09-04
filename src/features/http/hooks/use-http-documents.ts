import type { InputRenderable } from "@opentui/core"
import { useCallback, useState, type RefObject } from "react"
import type { HttpDocumentRefs } from "../runtime"
import type { HttpDocumentState } from "../model/types"
import {
  createScratchRequest,
  HTTP_DOCUMENT_LIMIT,
  httpDocumentNeedsDiscardConfirmation,
  type HttpWorkspaceAction,
} from "../model/workspace"

export function useHttpDocuments({
  documents,
  documentRefs,
  abortControllers,
  documentCounter,
  urlRef,
  blurDocumentControls,
  dispatch,
}: {
  documents: HttpDocumentState[]
  documentRefs: RefObject<Map<string, HttpDocumentRefs>>
  abortControllers: RefObject<Map<string, AbortController>>
  documentCounter: RefObject<number>
  urlRef: RefObject<InputRenderable | null>
  blurDocumentControls: () => void
  dispatch: (action: HttpWorkspaceAction) => void
}) {
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)
  const selectDocument = useCallback(
    (documentId: string) => {
      blurDocumentControls()
      dispatch({ type: "select-document", documentId })
      setTimeout(() => urlRef.current?.focus(), 0)
    },
    [blurDocumentControls, dispatch, urlRef],
  )
  const addDocument = useCallback(() => {
    if (documents.length >= HTTP_DOCUMENT_LIMIT) return
    documentCounter.current += 1
    dispatch({
      type: "add-document",
      request: createScratchRequest(`http-scratch-${documentCounter.current}`),
    })
    setTimeout(() => urlRef.current?.focus(), 0)
  }, [documentCounter, dispatch, documents.length, urlRef])
  const cancelDocument = useCallback(
    (documentId: string) => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (document?.execution.status !== "running") return
      abortControllers.current.get(document.execution.executionId)?.abort()
    },
    [abortControllers, documents],
  )
  const closeDocument = useCallback(
    (documentId: string) => {
      cancelDocument(documentId)
      documentRefs.current.delete(documentId)
      dispatch({ type: "close-document", documentId })
      setTimeout(() => urlRef.current?.focus(), 0)
    },
    [cancelDocument, dispatch, documentRefs, urlRef],
  )
  const requestCloseDocument = useCallback(
    (documentId: string) => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (!document || documents.length === 1) return
      if (httpDocumentNeedsDiscardConfirmation(documents, documentId)) {
        setPendingCloseId(documentId)
        dispatch({ type: "open-overlay", overlay: "discard-document" })
        return
      }
      closeDocument(documentId)
    },
    [closeDocument, dispatch, documents],
  )
  const confirmCloseDocument = useCallback(() => {
    if (pendingCloseId) closeDocument(pendingCloseId)
    setPendingCloseId(null)
  }, [closeDocument, pendingCloseId])
  const cancelPendingClose = useCallback(() => setPendingCloseId(null), [])
  return {
    selectDocument,
    addDocument,
    cancelDocument,
    closeDocument,
    requestCloseDocument,
    confirmCloseDocument,
    cancelPendingClose,
    pendingCloseDocument: documents.find((document) => document.request.id === pendingCloseId),
  }
}
