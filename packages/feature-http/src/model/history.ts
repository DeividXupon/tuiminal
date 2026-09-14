import type {
  HttpDocumentState,
  HttpHistoryEntry,
  HttpPrivacyContext,
  HttpResponseSnapshot,
} from "./types"
import type { HttpWorkspaceState } from "./types"
import { diffHttpText, responseBodyText } from "./response"
import { redactHttpHistoryEntry } from "./history-privacy"
import { combineHttpPrivacy, requestHttpPrivacy } from "./secrets"
export { redactHttpDiagnostic, redactHttpHistoryUrl } from "./history-privacy"

export const HTTP_SESSION_HISTORY_LIMIT = 30
export const HTTP_SESSION_BODY_BUDGET = 12_000_000

export type HttpHistoryAction =
  | { type: "hydrate-history"; entries: HttpHistoryEntry[] }
  | { type: "toggle-history-selection"; entryId: string }
  | { type: "clear-history-selection" }
  | { type: "open-history-entry"; entryId: string }

export function isHttpHistoryAction(action: { type: string }): action is HttpHistoryAction {
  return [
    "hydrate-history",
    "toggle-history-selection",
    "clear-history-selection",
    "open-history-entry",
  ].includes(action.type)
}

export function reduceHttpHistoryAction(
  state: HttpWorkspaceState,
  action: HttpHistoryAction,
): HttpWorkspaceState {
  if (action.type === "hydrate-history") {
    const ids = new Set(state.history.map((entry) => entry.id))
    return {
      ...state,
      history: budgetHttpHistory([
        ...state.history,
        ...action.entries.filter((entry) => !ids.has(entry.id)),
      ]),
    }
  }
  if (action.type === "toggle-history-selection") {
    if (!state.history.some((entry) => entry.id === action.entryId && entry.response?.body)) {
      return state
    }
    const selected = state.historySelection.includes(action.entryId)
    const historySelection = selected
      ? state.historySelection.filter((id) => id !== action.entryId)
      : [...state.historySelection, action.entryId].slice(-2)
    return { ...state, historySelection }
  }
  if (action.type === "clear-history-selection") return { ...state, historySelection: [] }
  const entry = state.history.find((candidate) => candidate.id === action.entryId)
  const response = entry?.response
  const body = response?.body
  if (!entry || !response || !body) return state
  return {
    ...state,
    activeDocumentId: entry.requestId,
    activePane: "response",
    navigationOpen: false,
    documents: state.documents.map((document) =>
      document.request.id === entry.requestId
        ? { ...document, execution: { status: "success", response: { ...response, body } } }
        : document,
    ),
  }
}

export function createHttpSuccessHistoryEntry(
  document: HttpDocumentState,
  response: HttpResponseSnapshot,
  environmentName: string | null,
  createdAt = Date.now(),
): HttpHistoryEntry {
  return redactHttpHistoryEntry({
    privacy: combineHttpPrivacy(response.privacy, requestHttpPrivacy(document.request)),
    id: response.executionId,
    createdAt,
    requestId: document.request.id,
    requestName: document.request.name,
    environmentName,
    method: document.request.method,
    url: response.url,
    status: response.status,
    durationMs: response.timings.totalMs,
    error: null,
    response: { ...response, body: response.body },
    bodyDiscarded: false,
    persisted: false,
  })
}

export function createHttpErrorHistoryEntry(
  document: HttpDocumentState,
  executionId: string,
  error: string,
  environmentName: string | null,
  createdAt = Date.now(),
  privacy?: HttpPrivacyContext,
): HttpHistoryEntry {
  return redactHttpHistoryEntry({
    privacy: combineHttpPrivacy(privacy, requestHttpPrivacy(document.request)),
    id: executionId,
    createdAt,
    requestId: document.request.id,
    requestName: document.request.name,
    environmentName,
    method: document.request.method,
    url: document.request.url,
    status: null,
    durationMs: null,
    error,
    bodyDiscarded: false,
    persisted: false,
  })
}

export function budgetHttpHistory(
  entries: HttpHistoryEntry[],
  bodyBudget = HTTP_SESSION_BODY_BUDGET,
): HttpHistoryEntry[] {
  let remaining = Math.max(0, bodyBudget)
  return entries.slice(0, HTTP_SESSION_HISTORY_LIMIT).map((entry) => {
    const response = entry.response
    const body = response?.body
    if (!body || !response) return entry
    if (body.length <= remaining) {
      remaining -= body.length
      return entry
    }
    const { body: _discarded, ...metadata } = response
    return { ...entry, response: metadata, bodyDiscarded: true }
  })
}

export function httpHistoryBodyText(entry: HttpHistoryEntry) {
  if (!entry.response?.body) return null
  return responseBodyText(entry.response as HttpResponseSnapshot, true)
}

export function diffHttpHistoryEntries(left: HttpHistoryEntry, right: HttpHistoryEntry) {
  const before = httpHistoryBodyText(left)
  const after = httpHistoryBodyText(right)
  if (before === null || after === null) return null
  return diffHttpText(before, after)
}

export function selectedHttpHistoryEntries(entries: HttpHistoryEntry[], ids: string[]) {
  const selected = ids
    .map((id) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is HttpHistoryEntry => Boolean(entry))
  return selected.length === 2
    ? ([selected[0]!, selected[1]!] as [HttpHistoryEntry, HttpHistoryEntry])
    : null
}

export function groupHttpHistoryByRequest(entries: HttpHistoryEntry[]) {
  const groups = new Map<
    string,
    { requestId: string; requestName: string; entries: HttpHistoryEntry[] }
  >()
  for (const entry of entries) {
    const group = groups.get(entry.requestId)
    if (group) group.entries.push(entry)
    else {
      groups.set(entry.requestId, {
        requestId: entry.requestId,
        requestName: entry.requestName,
        entries: [entry],
      })
    }
  }
  return [...groups.values()]
}
