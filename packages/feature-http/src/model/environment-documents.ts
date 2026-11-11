import type { HttpWorkspaceState } from "./types"

import type { HttpEnvironmentDocumentAction } from "./environment-document-types"
export type {
  HttpEnvironmentDocument,
  HttpEnvironmentVariable,
  HttpEnvironmentDocumentAction,
} from "./environment-document-types"

export function environmentDocumentsBusy(state: HttpWorkspaceState) {
  return state.environmentDocuments.some(
    (item) => item.busy || item.revision !== item.savedRevision,
  )
}

export function httpWorkspaceTabs(state: HttpWorkspaceState) {
  return [
    ...state.documents.map((doc) => ({
      id: doc.request.id,
      name: doc.request.name,
      prefix: doc.request.method,
      dirty: doc.revision !== doc.savedRevision,
    })),
    ...state.environmentDocuments.map((doc) => ({
      id: doc.id,
      name: doc.name || "Novo ambiente",
      prefix: "◇",
      dirty: doc.revision !== doc.savedRevision,
    })),
    ...state.collectionDocuments.map((doc) => ({
      id: doc.id,
      name: doc.target.name,
      prefix: "⚙",
      dirty: doc.revision !== doc.savedRevision,
    })),
  ]
}

export function reduceEnvironmentDocument(
  state: HttpWorkspaceState,
  action: HttpEnvironmentDocumentAction,
): HttpWorkspaceState {
  switch (action.type) {
    case "open-environment-document":
      return {
        ...state,
        environmentDocuments: state.environmentDocuments.some(
          (doc) => doc.id === action.document.id,
        )
          ? state.environmentDocuments
          : [...state.environmentDocuments, action.document],
        activeDocumentId: action.document.id,
        activePane: "request",
        navigationOpen: false,
      }
    case "update-environment-document":
      return {
        ...state,
        environmentDocuments: state.environmentDocuments.map((doc) =>
          doc.id === action.id ? { ...doc, ...action.patch } : doc,
        ),
      }
    case "clear-environment-documents":
      return {
        ...state,
        environmentDocuments: [],
        activeDocumentId: state.documents.some((doc) => doc.request.id === state.activeDocumentId)
          ? state.activeDocumentId
          : (state.documents[0]?.request.id ?? state.collectionDocuments.at(-1)?.id ?? ""),
      }
    case "close-environment-document": {
      const environmentDocuments = state.environmentDocuments.filter((doc) => doc.id !== action.id)
      return {
        ...state,
        environmentDocuments,
        activeDocumentId:
          state.activeDocumentId === action.id
            ? (environmentDocuments.at(-1)?.id ??
              state.documents.at(-1)?.request.id ??
              state.collectionDocuments.at(-1)?.id ??
              "")
            : state.activeDocumentId,
      }
    }
  }
}
