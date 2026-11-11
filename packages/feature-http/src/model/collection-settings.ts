import type {
  HttpWorkspaceState,
  HttpCollectionSettingsDocument,
  HttpCollectionSettingsData,
} from "./types"
export type {
  HttpCollectionSettingsTarget,
  HttpCollectionAuth,
  HttpCollectionSettingsData,
  HttpCollectionSettingsDocument,
} from "./types"

export type HttpCollectionSettingsAction =
  | { type: "open-collection-settings"; document: HttpCollectionSettingsDocument }
  | {
      type: "update-collection-settings"
      id: string
      patch: Partial<HttpCollectionSettingsDocument>
    }
  | { type: "close-collection-settings"; id: string }
  | { type: "clear-collection-settings" }

export function emptyCollectionSettings(folder = false): HttpCollectionSettingsData {
  return {
    auth: { kind: folder ? "inherit" : "none" },
    scripts: { preRequest: "", postResponse: "" },
    variables: [],
  }
}

export function reduceCollectionSettings(
  state: HttpWorkspaceState,
  action: HttpCollectionSettingsAction,
): HttpWorkspaceState {
  switch (action.type) {
    case "open-collection-settings":
      return {
        ...state,
        collectionDocuments: state.collectionDocuments.some((doc) => doc.id === action.document.id)
          ? state.collectionDocuments
          : [...state.collectionDocuments, action.document],
        activeDocumentId: action.document.id,
        activePane: "request",
        navigationOpen: false,
      }
    case "update-collection-settings":
      return {
        ...state,
        collectionDocuments: state.collectionDocuments.map((doc) =>
          doc.id === action.id ? { ...doc, ...action.patch } : doc,
        ),
      }
    case "close-collection-settings": {
      const collectionDocuments = state.collectionDocuments.filter((doc) => doc.id !== action.id)
      return {
        ...state,
        collectionDocuments,
        activeDocumentId:
          state.activeDocumentId === action.id
            ? (collectionDocuments.at(-1)?.id ??
              state.documents.at(-1)?.request.id ??
              state.environmentDocuments.at(-1)?.id ??
              "")
            : state.activeDocumentId,
      }
    }
    case "clear-collection-settings":
      return {
        ...state,
        collectionDocuments: [],
        activeDocumentId: state.collectionDocuments.some((doc) => doc.id === state.activeDocumentId)
          ? (state.documents.at(-1)?.request.id ?? state.environmentDocuments.at(-1)?.id ?? "")
          : state.activeDocumentId,
      }
  }
}

export function isCollectionSettingsAction(action: {
  type: string
}): action is HttpCollectionSettingsAction {
  return [
    "open-collection-settings",
    "update-collection-settings",
    "close-collection-settings",
    "clear-collection-settings",
  ].includes(action.type)
}
