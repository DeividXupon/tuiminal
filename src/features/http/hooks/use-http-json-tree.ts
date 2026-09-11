import { useMemo } from "react"
import { httpJsonTreeForDocument } from "../model/json-tree"
import type { HttpDocumentState } from "../model/types"

export function useHttpJsonTree(document: HttpDocumentState | undefined) {
  return useMemo(() => (document ? httpJsonTreeForDocument(document) : null), [document])
}
