import type { InputRenderable } from "@opentui/core"
import { useCallback, type RefObject } from "react"
import { isHttpRequestJumpTarget } from "../model/keyboard"
import type { HttpDocumentState, HttpJumpTarget, HttpPane, HttpRequestView } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import type { HttpDocumentRefs } from "../runtime"

export function useHttpOverlayNavigation({
  document,
  activePane,
  refsFor,
  urlRef,
  dispatch,
  selectRequestView,
}: {
  document: HttpDocumentState | undefined
  activePane: HttpPane
  refsFor: (documentId: string) => HttpDocumentRefs
  urlRef: RefObject<InputRenderable | null>
  dispatch: (action: HttpWorkspaceAction) => void
  selectRequestView: (documentId: string, view: HttpRequestView) => void
}) {
  const closeOverlay = useCallback(() => {
    dispatch({ type: "close-overlay" })
    if (!document) return
    setTimeout(() => {
      if (activePane === "response") refsFor(document.request.id).response?.focus()
      else if (activePane === "request") urlRef.current?.focus()
    }, 0)
  }, [activePane, dispatch, document, refsFor, urlRef])

  const jumpTo = useCallback(
    (target: HttpJumpTarget) => {
      dispatch({ type: "close-overlay" })
      if (!document) return
      const documentId = document.request.id
      if (target === "url") {
        dispatch({ type: "select-pane", pane: "request" })
        setTimeout(() => urlRef.current?.focus(), 0)
        return
      }
      if (isHttpRequestJumpTarget(target)) {
        selectRequestView(documentId, target)
        return
      }
      if (target === "response") {
        dispatch({ type: "select-pane", pane: "response" })
        setTimeout(() => refsFor(documentId).response?.focus(), 0)
        return
      }
      dispatch({ type: "select-navigation-view", view: target })
      dispatch({ type: "select-pane", pane: "navigation" })
    },
    [dispatch, document, refsFor, selectRequestView, urlRef],
  )

  return { closeOverlay, jumpTo }
}
