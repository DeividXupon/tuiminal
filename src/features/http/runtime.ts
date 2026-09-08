import type { InputRenderable, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import type { HttpWorkspaceState } from "./model/types"

export type HttpDocumentRefs = {
  headers: InputRenderable | null
  body: TextareaRenderable | null
  raw: ScrollBoxRenderable | null
  response: ScrollBoxRenderable | null
  responseSearch: InputRenderable | null
}

export function newHttpExecutionId() {
  return `http-execution-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function httpBodyFor(state: HttpWorkspaceState, documentId: string) {
  return (
    state.documents.find((document) => document.request.id === documentId)?.request.body ?? {
      kind: "none" as const,
      text: "",
      form: [],
    }
  )
}
