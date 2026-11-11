import type { InputRenderable } from "@opentui/core"
import { useEffect, useRef, type RefObject } from "react"
import type { HttpClientUrlRequest, HttpDocumentState, HttpPane } from "../model/types"
import { createScratchRequest, type HttpWorkspaceAction } from "../model/workspace"
import { syncHttpUrlQuery } from "../model/url-query"

export function useHttpWorkspaceLifecycle({
  active,
  auxiliaryDocument = false,
  initialUrlRequest,
  document,
  activePane,
  urlRef,
  abortControllers,
  dispatch,
}: {
  active: boolean
  auxiliaryDocument?: boolean
  initialUrlRequest: HttpClientUrlRequest | null | undefined
  document: HttpDocumentState | undefined
  activePane: HttpPane
  urlRef: RefObject<InputRenderable | null>
  abortControllers: RefObject<Map<string, AbortController>>
  dispatch: (action: HttpWorkspaceAction) => void
}) {
  const handledInitialRequestId = useRef<number | null>(null)
  const hasDocument = Boolean(document)

  useEffect(() => {
    if (!initialUrlRequest) return
    if (handledInitialRequestId.current === initialUrlRequest.id) return
    handledInitialRequestId.current = initialUrlRequest.id
    if (!document)
      dispatch({
        type: "add-document",
        request: createScratchRequest("http-scratch-1"),
      })
    const documentId = document?.request.id ?? "http-scratch-1"
    dispatch({
      type: "update-request",
      documentId,
      patch: {
        method: "GET",
        url: initialUrlRequest.url,
        query: syncHttpUrlQuery(initialUrlRequest.url, document?.request.query ?? [], documentId),
      },
    })
    dispatch({ type: "select-pane", pane: "url" })
    setTimeout(() => urlRef.current?.focus(), 0)
  }, [dispatch, document, initialUrlRequest, urlRef])

  useEffect(() => {
    if (!active) return
    const pane = auxiliaryDocument
      ? "request"
      : hasDocument || initialUrlRequest
        ? "url"
        : "navigation"
    dispatch({ type: "select-pane", pane })
    if (pane !== "url") return
    const timer = setTimeout(() => urlRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [active, auxiliaryDocument, dispatch, hasDocument, initialUrlRequest, urlRef])

  const documentId = document?.request.id
  useEffect(() => {
    if (!active || !documentId || activePane !== "url") return
    const timer = setTimeout(() => urlRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [active, activePane, documentId, urlRef])

  useEffect(
    () => () => {
      for (const controller of abortControllers.current.values()) controller.abort()
      abortControllers.current.clear()
    },
    [abortControllers],
  )
}
