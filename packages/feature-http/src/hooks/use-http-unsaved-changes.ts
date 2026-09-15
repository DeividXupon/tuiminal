import { useLayoutEffect } from "react"
import type { HttpDocumentState } from "../model/types"
import { hasUnsavedHttpDocuments } from "../model/workspace"

export function useHttpUnsavedChanges(
  documents: HttpDocumentState[],
  onChange: ((dirty: boolean) => void) | undefined,
) {
  useLayoutEffect(() => {
    onChange?.(hasUnsavedHttpDocuments(documents))
    return () => onChange?.(false)
  }, [documents, onChange])
}
