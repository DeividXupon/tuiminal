import { useEffect, useRef } from "react"
import type { HttpDocumentState, HttpPane } from "../model/types"
import type { HttpDocumentRefs } from "../runtime"

export function useHttpResponseFocus({
  active,
  document,
  pane,
  refsFor,
}: {
  active: boolean
  document: HttpDocumentState | undefined
  pane: HttpPane
  refsFor: (documentId: string) => HttpDocumentRefs
}) {
  const focusedResponseKey = useRef("")

  useEffect(() => {
    if (
      !active ||
      !document ||
      pane !== "response" ||
      document.execution.status !== "success" ||
      document.responsePresentation.searchOpen ||
      document.responsePresentation.jsonPathOpen
    ) {
      if (pane !== "response") focusedResponseKey.current = ""
      return
    }
    const focusKey = `${document.request.id}:${document.execution.response.executionId}`
    if (focusedResponseKey.current === focusKey) return
    const timer = setTimeout(() => {
      refsFor(document.request.id).response?.focus()
      focusedResponseKey.current = focusKey
    }, 0)
    return () => clearTimeout(timer)
  }, [active, document, pane, refsFor])
}
