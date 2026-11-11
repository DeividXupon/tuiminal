import {
  isCollectionSettingsAction,
  reduceCollectionSettings,
  type HttpCollectionSettingsAction,
} from "./collection-settings"
import {
  reduceEnvironmentDocument,
  type HttpEnvironmentDocumentAction,
} from "./environment-documents"
import { commitHttpSavedDocument, type HttpSavedRequestAction } from "./saved-request"
import {
  budgetHttpHistory,
  createHttpErrorHistoryEntry,
  createHttpSuccessHistoryEntry,
  type HttpHistoryAction,
  isHttpHistoryAction,
  reduceHttpHistoryAction,
} from "./history"
import { requestPatchIsUnchanged } from "./request-patch"
import {
  type HttpDocumentState,
  type HttpHistoryEntry,
  type HttpPane,
  type HttpRequestDefinition,
  type HttpRequestMoreView,
  type HttpRequestView,
  type HttpResponseSnapshot,
  type HttpResponseView,
  type HttpWorkspaceOverlay,
  type HttpWorkspaceState,
} from "./types"
export const HTTP_DOCUMENT_LIMIT = 6
export function hasUnsavedHttpDocuments(documents: HttpDocumentState[]) {
  return documents.some((document) => document.revision !== document.savedRevision)
}
export function httpDocumentNeedsDiscardConfirmation(
  documents: HttpDocumentState[],
  documentId: string,
) {
  const document = documents.find((candidate) => candidate.request.id === documentId)
  return Boolean(document && document.revision !== document.savedRevision)
}
export { nextHttpMethod } from "./http-methods"
export type HttpWorkspaceAction =
  | HttpCollectionSettingsAction
  | HttpEnvironmentDocumentAction
  | HttpHistoryAction
  | { type: "add-document"; request: HttpRequestDefinition }
  | { type: "select-document"; documentId: string }
  | { type: "close-document"; documentId: string }
  | HttpSavedRequestAction
  | {
      type: "update-request"
      documentId: string
      patch: Partial<Omit<HttpRequestDefinition, "id">>
    }
  | { type: "select-request-view"; documentId: string; view: HttpRequestView }
  | { type: "select-request-more-view"; documentId: string; view: HttpRequestMoreView }
  | { type: "select-response-view"; documentId: string; view: HttpResponseView }
  | {
      type: "update-response-presentation"
      documentId: string
      patch: Partial<HttpDocumentState["responsePresentation"]>
    }
  | { type: "select-pane"; pane: HttpPane }
  | { type: "set-split-ratio"; documentId: string; ratio: number }
  | { type: "toggle-maximize"; documentId: string; pane: "request" | "response" }
  | { type: "select-navigation-view"; view: "collection" | "environments" }
  | { type: "toggle-navigation"; view?: "collection" | "environments" }
  | { type: "close-navigation" }
  | { type: "open-overlay"; overlay: Exclude<HttpWorkspaceOverlay, null> }
  | { type: "close-overlay" }
  | {
      type: "start-execution"
      documentId: string
      executionId: string
      requestRevision: number
    }
  | {
      type: "finish-execution"
      documentId: string
      response: HttpResponseSnapshot
      historyEntry?: HttpHistoryEntry | null
    }
  | {
      type: "fail-execution"
      documentId: string
      executionId: string
      requestRevision: number
      kind: import("./types").HttpFailureKind
      message: string
      historyEntry?: HttpHistoryEntry | null
    }
  | {
      type: "cancel-execution"
      documentId: string
      executionId: string
      requestRevision: number
    }

type HttpExecutionAction = Extract<
  HttpWorkspaceAction,
  { type: "start-execution" | "finish-execution" | "fail-execution" | "cancel-execution" }
>

export function createScratchRequest(id: string, url = ""): HttpRequestDefinition {
  return {
    id,
    source: { kind: "scratch" },
    name: "Scratch",
    method: "GET",
    url,
    query: [],
    path: [],
    headers: [
      {
        id: `${id}-accept`,
        enabled: true,
        name: "Accept",
        value: "application/json",
        sensitivity: "normal",
      },
    ],
    auth: { kind: "none" },
    body: { kind: "none", text: "", form: [] },
    options: { timeoutMs: 30_000, followRedirects: true },
  }
}

function createDocument(request: HttpRequestDefinition): HttpDocumentState {
  return {
    request,
    revision: 0,
    savedRevision: 0,
    requestView: "params",
    requestMoreView: "options",
    responseView: "pretty",
    responsePresentation: {
      wrap: false,
      lineNumbers: false,
      foldDepth: null,
      jsonSelectedPath: null,
      jsonCollapsedPaths: [],
      searchOpen: false,
      searchQuery: "",
      searchMatchIndex: 0,
      jsonPathOpen: false,
      jsonPath: "",
      moreView: "summary",
    },
    splitRatio: 0.5,
    maximizedPane: null,
    execution: { status: "idle" },
  }
}

export function createHttpWorkspaceState(request?: HttpRequestDefinition): HttpWorkspaceState {
  return {
    environmentDocuments: [],
    collectionDocuments: [],
    documents: request ? [createDocument(request)] : [],
    activeDocumentId: request?.id ?? "",
    activePane: request ? "url" : "navigation",
    navigationView: "collection",
    navigationOpen: !request,
    overlay: null,
    history: [],
    historySelection: [],
  }
}

function executionMatches(
  document: HttpDocumentState,
  executionId: string,
  requestRevision: number,
) {
  return (
    document.execution.status === "running" &&
    document.execution.executionId === executionId &&
    document.execution.requestId === document.request.id &&
    document.execution.requestRevision === requestRevision
  )
}

function updateDocument(
  state: HttpWorkspaceState,
  documentId: string,
  update: (document: HttpDocumentState) => HttpDocumentState,
) {
  if (!state.documents.some((document) => document.request.id === documentId)) return state
  return {
    ...state,
    documents: state.documents.map((document) =>
      document.request.id === documentId ? update(document) : document,
    ),
  }
}

function addHistory(state: HttpWorkspaceState, entry: HttpHistoryEntry) {
  return { ...state, history: budgetHttpHistory([entry, ...state.history]) }
}

function reduceHttpExecution(state: HttpWorkspaceState, action: HttpExecutionAction) {
  if (action.type === "start-execution") {
    const next = updateDocument(state, action.documentId, (document) => ({
      ...document,
      execution: {
        status: "running",
        executionId: action.executionId,
        requestId: document.request.id,
        requestRevision: action.requestRevision,
      },
    }))
    return next === state ? state : { ...next, activePane: "response" as const }
  }
  const document = state.documents.find((candidate) => candidate.request.id === action.documentId)
  const executionId =
    action.type === "finish-execution" ? action.response.executionId : action.executionId
  const requestRevision =
    action.type === "finish-execution" ? action.response.requestRevision : action.requestRevision
  if (!document || !executionMatches(document, executionId, requestRevision)) return state

  if (action.type === "cancel-execution") {
    return updateDocument(state, action.documentId, (candidate) => ({
      ...candidate,
      execution: {
        status: "cancelled",
        executionId,
        requestId: candidate.request.id,
        requestRevision,
      },
    }))
  }
  if (action.type === "finish-execution") {
    if (action.response.requestId !== document.request.id) return state
    const next = updateDocument(state, action.documentId, (candidate) => ({
      ...candidate,
      execution: { status: "success" as const, response: action.response },
      responseView: "pretty" as const,
      responsePresentation: {
        ...candidate.responsePresentation,
        searchMatchIndex: 0,
        jsonSelectedPath: null,
        jsonCollapsedPaths: [],
      },
    }))
    if (action.historyEntry === null) return next
    return addHistory(
      next,
      action.historyEntry ?? createHttpSuccessHistoryEntry(document, action.response, null),
    )
  }

  const next = updateDocument(state, action.documentId, (candidate) => ({
    ...candidate,
    execution: {
      status: "error" as const,
      executionId,
      requestId: candidate.request.id,
      requestRevision,
      kind: action.kind,
      message: action.message,
    },
  }))
  if (action.historyEntry === null) return next
  return addHistory(
    next,
    action.historyEntry ?? createHttpErrorHistoryEntry(document, executionId, action.message, null),
  )
}
export function httpWorkspaceReducer(
  state: HttpWorkspaceState,
  action: HttpWorkspaceAction,
): HttpWorkspaceState {
  if (isCollectionSettingsAction(action)) return reduceCollectionSettings(state, action)
  if (isHttpHistoryAction(action)) return reduceHttpHistoryAction(state, action)
  if (
    action.type === "open-environment-document" ||
    action.type === "update-environment-document" ||
    action.type === "close-environment-document" ||
    action.type === "clear-environment-documents"
  )
    return reduceEnvironmentDocument(state, action)
  switch (action.type) {
    case "add-document":
      if (state.documents.some((document) => document.request.id === action.request.id)) {
        return { ...state, activeDocumentId: action.request.id }
      }
      if (
        state.documents.length >= HTTP_DOCUMENT_LIMIT &&
        state.documents.at(-1)?.revision !== state.documents.at(-1)?.savedRevision
      )
        return state
      return {
        ...state,
        documents: [
          ...state.documents.slice(0, HTTP_DOCUMENT_LIMIT - 1),
          createDocument(action.request),
        ],
        activeDocumentId: action.request.id,
        activePane: "url",
      }
    case "select-document":
      return state.collectionDocuments.some((document) => document.id === action.documentId) ||
        state.environmentDocuments.some((document) => document.id === action.documentId) ||
        state.documents.some((document) => document.request.id === action.documentId)
        ? { ...state, activeDocumentId: action.documentId }
        : state
    case "close-document": {
      const index = state.documents.findIndex(
        (document) => document.request.id === action.documentId,
      )
      if (index < 0) return state
      const documents = state.documents.filter(
        (document) => document.request.id !== action.documentId,
      )
      const fallback = documents[Math.min(index, documents.length - 1)]
      return {
        ...state,
        documents,
        activeDocumentId:
          state.activeDocumentId === action.documentId
            ? (fallback?.request.id ??
              state.environmentDocuments.at(-1)?.id ??
              state.collectionDocuments.at(-1)?.id ??
              "")
            : state.activeDocumentId,
      }
    }
    case "rebase-collection-variable":
    case "commit-saved-document":
      return commitHttpSavedDocument(state, action)
    case "update-request":
      return updateDocument(state, action.documentId, (document) =>
        (document.request.source.kind === "file" && document.request.source.supported === false) ||
        requestPatchIsUnchanged(document.request, action.patch)
          ? document
          : {
              ...document,
              request: { ...document.request, ...action.patch },
              revision: document.revision + 1,
            },
      )
    case "select-request-view":
      return updateDocument(state, action.documentId, (document) => ({
        ...document,
        requestView: action.view,
      }))
    case "select-request-more-view":
      return updateDocument(state, action.documentId, (document) => ({
        ...document,
        requestMoreView: action.view,
      }))
    case "select-response-view":
      return updateDocument(state, action.documentId, (document) => ({
        ...document,
        responseView: action.view,
      }))
    case "update-response-presentation":
      return updateDocument(state, action.documentId, (document) => ({
        ...document,
        responsePresentation: { ...document.responsePresentation, ...action.patch },
      }))
    case "select-pane":
      return { ...state, activePane: action.pane, navigationOpen: action.pane === "navigation" }
    case "set-split-ratio":
      return updateDocument(state, action.documentId, (document) => ({
        ...document,
        splitRatio: action.ratio,
      }))
    case "toggle-maximize":
      return updateDocument(state, action.documentId, (document) => ({
        ...document,
        maximizedPane: document.maximizedPane === action.pane ? null : action.pane,
      }))
    case "select-navigation-view":
      return { ...state, navigationView: action.view }
    case "toggle-navigation": {
      const view = action.view ?? state.navigationView
      return {
        ...state,
        navigationView: view,
        navigationOpen: !(state.navigationOpen && view === state.navigationView),
      }
    }
    case "close-navigation":
      return { ...state, navigationOpen: false, activePane: "request" }
    case "open-overlay":
      return { ...state, overlay: action.overlay }
    case "close-overlay":
      return { ...state, overlay: null }
    case "start-execution":
    case "finish-execution":
    case "fail-execution":
    case "cancel-execution":
      return reduceHttpExecution(state, action)
    default:
      return state
  }
}
