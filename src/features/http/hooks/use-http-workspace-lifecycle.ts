import type { InputRenderable } from "@opentui/core"
import { useEffect, useRef, type RefObject } from "react"
import type { HttpClientUrlRequest, HttpDocumentState } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"

export function useHttpWorkspaceLifecycle({
  active,
  initialUrlRequest,
  document,
  urlRef,
  abortControllers,
  dispatch,
}: {
  active: boolean
  initialUrlRequest: HttpClientUrlRequest | null | undefined
  document: HttpDocumentState | undefined
  urlRef: RefObject<InputRenderable | null>
  abortControllers: RefObject<Map<string, AbortController>>
  dispatch: (action: HttpWorkspaceAction) => void
}) {
  const handledInitialRequestId = useRef<number | null>(null)

  useEffect(() => {
    if (!initialUrlRequest || !document) return
    if (handledInitialRequestId.current === initialUrlRequest.id) return
    handledInitialRequestId.current = initialUrlRequest.id
    dispatch({
      type: "update-request",
      documentId: document.request.id,
      patch: { method: "GET", url: initialUrlRequest.url },
    })
    dispatch({ type: "select-pane", pane: "url" })
    setTimeout(() => urlRef.current?.focus(), 0)
  }, [dispatch, document, initialUrlRequest, urlRef])

  useEffect(() => {
    if (!active) return
    dispatch({ type: "select-pane", pane: "url" })
    const timer = setTimeout(() => urlRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [active, dispatch, urlRef])

  useEffect(
    () => () => {
      for (const controller of abortControllers.current.values()) controller.abort()
      abortControllers.current.clear()
    },
    [abortControllers],
  )
}
