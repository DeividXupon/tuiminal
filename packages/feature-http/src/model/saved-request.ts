import type { HttpRequestDefinition, HttpWorkspaceState } from "./types"

/** Keep only edits made after submission, while adopting confirmed remote fields. */
export function rebaseHttpSavedRequest(
  current: HttpRequestDefinition,
  submitted: HttpRequestDefinition | undefined,
  saved: HttpRequestDefinition,
) {
  if (!submitted) return { ...current, id: saved.id, source: saved.source }
  const edits = Object.fromEntries(
    (Object.keys(current) as Array<keyof HttpRequestDefinition>)
      .filter(
        (key) =>
          key !== "scripts" && JSON.stringify(current[key]) !== JSON.stringify(submitted[key]),
      )
      .map((key) => [key, current[key]]),
  )
  const scripts = { ...saved.scripts }
  for (const phase of ["preRequest", "postResponse"] as const) {
    if ((current.scripts?.[phase] ?? "") !== (submitted.scripts?.[phase] ?? ""))
      scripts[phase] = current.scripts?.[phase] ?? ""
  }
  return {
    ...saved,
    ...edits,
    ...(Object.keys(scripts).length
      ? { scripts: { preRequest: "", postResponse: "", ...scripts } }
      : {}),
    id: saved.id,
    source: saved.source,
  }
}

export type HttpSavedRequestAction =
  | { type: "rebase-collection-variable"; path: string; beforeHash: string; sourceHash: string }
  | {
      type: "commit-saved-document"
      documentId: string
      request: HttpRequestDefinition
      revision?: number
      submittedRequest?: HttpRequestDefinition
    }

export function commitHttpSavedDocument(
  state: HttpWorkspaceState,
  action: HttpSavedRequestAction,
): HttpWorkspaceState {
  if (action.type === "rebase-collection-variable")
    return {
      ...state,
      documents: state.documents.map((document) => {
        const source = document.request.source
        if (
          source.kind !== "file" ||
          source.path !== action.path ||
          source.sourceHash !== action.beforeHash
        )
          return document
        return {
          ...document,
          request: { ...document.request, source: { ...source, sourceHash: action.sourceHash } },
        }
      }),
    }
  return {
    ...state,
    activeDocumentId:
      state.activeDocumentId === action.documentId ? action.request.id : state.activeDocumentId,
    documents: state.documents.map((document) =>
      document.request.id === action.documentId
        ? {
            ...document,
            request:
              action.revision !== undefined && action.revision !== document.revision
                ? rebaseHttpSavedRequest(document.request, action.submittedRequest, action.request)
                : action.request,
            savedRevision: action.revision ?? document.revision,
          }
        : document,
    ),
  }
}
