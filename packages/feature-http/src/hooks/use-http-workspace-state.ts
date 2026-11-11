import { useCallback, useReducer, useRef, type RefObject } from "react"
import type { HttpDocumentRefs } from "../runtime"
import type { HttpRequestDefinition } from "../model/types"
import {
  createHttpWorkspaceState,
  httpWorkspaceReducer,
  HTTP_DOCUMENT_LIMIT,
  type HttpWorkspaceAction,
} from "../model/workspace"

export function useHttpWorkspaceState(
  documentRefs: RefObject<Map<string, HttpDocumentRefs>>,
  abortControllers: RefObject<Map<string, AbortController>>,
) {
  const [state, reactDispatch] = useReducer(
    httpWorkspaceReducer,
    undefined,
    createHttpWorkspaceState,
  )
  const stateRef = useRef(state)
  stateRef.current = state
  const pending = useRef<{ documentId: string; request: HttpRequestDefinition } | null>(null)
  const cancelReplacement = useCallback(() => {
    pending.current = null
  }, [])
  const dispatch = useCallback(
    (action: HttpWorkspaceAction) => {
      const apply = (nextAction: HttpWorkspaceAction) => {
        const previous = stateRef.current
        const next = httpWorkspaceReducer(previous, nextAction)
        stateRef.current = next
        if (nextAction.type === "add-document" || nextAction.type === "close-document") {
          for (const document of previous.documents) {
            if (next.documents.some((item) => item.request.id === document.request.id)) continue
            if (document.execution.status === "running") {
              abortControllers.current.get(document.execution.executionId)?.abort()
            }
            documentRefs.current.delete(document.request.id)
          }
        }
        reactDispatch(nextAction)
      }
      const current = stateRef.current
      if (action.type === "add-document") {
        if (pending.current) return
        const exists = current.documents.some((item) => item.request.id === action.request.id)
        const last = current.documents.at(-1)
        if (
          !exists &&
          current.documents.length >= HTTP_DOCUMENT_LIMIT &&
          last &&
          last.revision !== last.savedRevision
        ) {
          pending.current = { documentId: last.request.id, request: action.request }
          apply({ type: "open-overlay", overlay: "discard-document" })
          return
        }
      }
      // An importer may close its own dialog immediately after asking to open a tab.
      // Keep discard confirmation until its explicit confirm/cancel action resolves it.
      if (pending.current && action.type === "close-overlay") return
      if (action.type === "close-document" && pending.current?.documentId === action.documentId) {
        const replacement = pending.current.request
        pending.current = null
        apply(action)
        apply({ type: "add-document", request: replacement })
        return
      }
      apply(action)
    },
    [abortControllers, documentRefs],
  )
  return {
    state,
    stateRef,
    dispatch,
    replacingDocumentId: pending.current?.documentId ?? null,
    cancelReplacement,
  }
}
