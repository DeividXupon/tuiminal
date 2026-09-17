import type { InputRenderable } from "@opentui/core"
import { useCallback, useState, type RefObject } from "react"
import type { HttpDocumentRefs } from "../runtime"
import type { HttpDocumentState } from "../model/types"
import type { HttpProjectRequestItem } from "../model/types"
import { isOpaqueHttpRequest } from "../model/request-capabilities"
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
  refsFor,
  blurDocumentControls,
  dispatch,
}: {
  documents: HttpDocumentState[]
  documentRefs: RefObject<Map<string, HttpDocumentRefs>>
  abortControllers: RefObject<Map<string, AbortController>>
  documentCounter: RefObject<number>
  urlRef: RefObject<InputRenderable | null>
  refsFor: (documentId: string) => HttpDocumentRefs
  blurDocumentControls: () => void
  dispatch: (action: HttpWorkspaceAction) => void
}) {
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)
  const selectDocument = useCallback(
    (documentId: string) => {
      blurDocumentControls()
      dispatch({ type: "select-document", documentId })
      dispatch({ type: "select-pane", pane: "url" })
      setTimeout(() => urlRef.current?.focus(), 0)
    },
    [blurDocumentControls, dispatch, urlRef],
  )
  const openProjectRequest = useCallback(
    (item: HttpProjectRequestItem) => {
      blurDocumentControls()
      dispatch({ type: "add-document", request: item.request })
      setTimeout(() => {
        if (isOpaqueHttpRequest(item.request)) {
          dispatch({ type: "select-pane", pane: "request" })
          refsFor(item.request.id).raw?.focus()
        } else {
          dispatch({ type: "select-pane", pane: "url" })
          urlRef.current?.focus()
        }
      }, 0)
    },
    [blurDocumentControls, dispatch, refsFor, urlRef],
  )
  const addDocument = useCallback(() => {
    if (documents.length >= HTTP_DOCUMENT_LIMIT) return
    documentCounter.current += 1
    dispatch({
      type: "add-document",
      request: createScratchRequest(`http-scratch-${documentCounter.current}`),
    })
    dispatch({ type: "select-pane", pane: "url" })
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
      dispatch({ type: "select-pane", pane: "url" })
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
    openProjectRequest,
    addDocument,
    cancelDocument,
    closeDocument,
    requestCloseDocument,
    confirmCloseDocument,
    cancelPendingClose,
    pendingCloseDocument: documents.find((document) => document.request.id === pendingCloseId),
  }
}
