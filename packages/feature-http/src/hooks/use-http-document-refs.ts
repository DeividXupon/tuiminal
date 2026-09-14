import type { InputRenderable } from "@opentui/core"
import { useCallback, useRef, type RefObject } from "react"
import type { HttpDocumentRefs } from "../runtime"

export function useHttpDocumentRefs(urlRef: RefObject<InputRenderable | null>) {
  const documentRefs = useRef(new Map<string, HttpDocumentRefs>())
  const refsFor = useCallback((documentId: string) => {
    const existing = documentRefs.current.get(documentId)
    if (existing) return existing
    const refs = { headers: null, body: null, raw: null, response: null, responseSearch: null }
    documentRefs.current.set(documentId, refs)
    return refs
  }, [])
  const blurDocumentControls = useCallback(() => {
    urlRef.current?.blur()
    for (const refs of documentRefs.current.values()) {
      refs.headers?.blur()
      refs.body?.blur()
      refs.raw?.blur()
      refs.response?.blur()
      refs.responseSearch?.blur()
    }
  }, [urlRef])
  return { documentRefs, refsFor, blurDocumentControls }
}
