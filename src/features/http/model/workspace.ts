import type {
  HttpDocumentState,
  HttpHistoryEntry,
  HttpPane,
  HttpRequestDefinition,
  HttpRequestView,
  HttpResponseSnapshot,
  HttpResponseView,
  HttpWorkspaceOverlay,
  HttpWorkspaceState,
} from "./types"

export const HTTP_DOCUMENT_LIMIT = 6
const HTTP_HISTORY_LIMIT = 30

export type HttpWorkspaceAction =
  | { type: "add-document"; request: HttpRequestDefinition }
  | { type: "select-document"; documentId: string }
  | { type: "close-document"; documentId: string }
  | {
      type: "commit-saved-document"
      documentId: string
      request: HttpRequestDefinition
    }
  | {
      type: "update-request"
      documentId: string
      patch: Partial<Omit<HttpRequestDefinition, "id">>
    }
  | { type: "select-request-view"; documentId: string; view: HttpRequestView }
  | { type: "select-response-view"; documentId: string; view: HttpResponseView }
  | { type: "select-pane"; pane: HttpPane }
  | { type: "set-split-ratio"; documentId: string; ratio: number }
  | { type: "toggle-maximize"; documentId: string; pane: "request" | "response" }
  | { type: "select-navigation-view"; view: "collection" | "history" }
  | { type: "toggle-navigation"; view?: "collection" | "history" }
  | { type: "close-navigation" }
  | { type: "open-overlay"; overlay: Exclude<HttpWorkspaceOverlay, null> }
  | { type: "close-overlay" }
  | {
      type: "start-execution"
      documentId: string
      executionId: string
      requestRevision: number
    }
  | { type: "finish-execution"; documentId: string; response: HttpResponseSnapshot }
  | {
      type: "fail-execution"
      documentId: string
      executionId: string
      requestRevision: number
      message: string
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
    responseView: "pretty",
    splitRatio: 0.4,
    maximizedPane: null,
    execution: { status: "idle" },
  }
}

export function createHttpWorkspaceState(
  request = createScratchRequest("http-scratch-1"),
): HttpWorkspaceState {
  return {
    documents: [createDocument(request)],
    activeDocumentId: request.id,
    activePane: "request",
    navigationView: "collection",
    navigationOpen: false,
    overlay: null,
    history: [],
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
  return { ...state, history: [entry, ...state.history].slice(0, HTTP_HISTORY_LIMIT) }
}

function reduceHttpExecution(state: HttpWorkspaceState, action: HttpExecutionAction) {
  if (action.type === "start-execution") {
    return updateDocument(state, action.documentId, (document) => ({
      ...document,
      execution: {
        status: "running",
        executionId: action.executionId,
        requestId: document.request.id,
        requestRevision: action.requestRevision,
      },
    }))
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
    }))
    return addHistory(next, {
      id: executionId,
      createdAt: Date.now(),
      requestId: document.request.id,
      method: document.request.method,
      url: document.request.url,
      status: action.response.status,
      durationMs: action.response.timings.totalMs,
      error: null,
    })
  }

  const next = updateDocument(state, action.documentId, (candidate) => ({
    ...candidate,
    execution: {
      status: "error" as const,
      executionId,
      requestId: candidate.request.id,
      requestRevision,
      message: action.message,
    },
  }))
  return addHistory(next, {
    id: executionId,
    createdAt: Date.now(),
    requestId: document.request.id,
    method: document.request.method,
    url: document.request.url,
    status: null,
    durationMs: null,
    error: action.message,
  })
}

export function httpWorkspaceReducer(
  state: HttpWorkspaceState,
  action: HttpWorkspaceAction,
): HttpWorkspaceState {
  switch (action.type) {
    case "add-document":
      if (state.documents.length >= HTTP_DOCUMENT_LIMIT) return state
      if (state.documents.some((document) => document.request.id === action.request.id)) {
        return { ...state, activeDocumentId: action.request.id }
      }
      return {
        ...state,
        documents: [...state.documents, createDocument(action.request)],
        activeDocumentId: action.request.id,
        activePane: "request",
      }
    case "select-document":
      return state.documents.some((document) => document.request.id === action.documentId)
        ? { ...state, activeDocumentId: action.documentId }
        : state
    case "close-document": {
      if (state.documents.length === 1) return state
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
            ? (fallback?.request.id ?? state.activeDocumentId)
            : state.activeDocumentId,
      }
    }
    case "commit-saved-document":
      return {
        ...state,
        activeDocumentId:
          state.activeDocumentId === action.documentId ? action.request.id : state.activeDocumentId,
        documents: state.documents.map((document) =>
          document.request.id === action.documentId
            ? {
                ...document,
                request: action.request,
                savedRevision: document.revision,
              }
            : document,
        ),
      }
    case "update-request":
      return updateDocument(state, action.documentId, (document) => ({
        ...document,
        request: { ...document.request, ...action.patch },
        revision: document.revision + 1,
      }))
    case "select-request-view":
      return updateDocument(state, action.documentId, (document) => ({
        ...document,
        requestView: action.view,
      }))
    case "select-response-view":
      return updateDocument(state, action.documentId, (document) => ({
        ...document,
        responseView: action.view,
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
  }
}
