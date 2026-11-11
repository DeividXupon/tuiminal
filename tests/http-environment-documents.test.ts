import { expect, test } from "bun:test"
import {
  createHttpWorkspaceState,
  createScratchRequest,
  httpWorkspaceReducer,
} from "../packages/feature-http/src/model/workspace"
import {
  environmentDocumentsBusy,
  httpWorkspaceTabs,
  type HttpEnvironmentDocument,
} from "../packages/feature-http/src/model/environment-documents"

const environment: HttpEnvironmentDocument = {
  id: "env-tab",
  scope: "local",
  key: "@globals",
  name: "Global",
  rows: [],
  baseline: "[]",
  revision: 0,
  savedRevision: 0,
}

test("environment and request tabs share selection without manufacturing requests", () => {
  let state = createHttpWorkspaceState()
  state = httpWorkspaceReducer(state, { type: "open-environment-document", document: environment })
  expect(state.documents).toEqual([])
  expect(state.activeDocumentId).toBe(environment.id)
  state = httpWorkspaceReducer(state, {
    type: "add-document",
    request: createScratchRequest("explicit-request"),
  })
  expect(httpWorkspaceTabs(state).map((tab) => tab.id)).toEqual(["explicit-request", "env-tab"])
  state = httpWorkspaceReducer(state, { type: "select-document", documentId: environment.id })
  expect(state.activeDocumentId).toBe(environment.id)
  state = httpWorkspaceReducer(state, { type: "close-environment-document", id: environment.id })
  expect(state.activeDocumentId).toBe("explicit-request")
})

test("closing the final request selects an environment; closing the final tab restores the empty canvas", () => {
  let state = createHttpWorkspaceState(createScratchRequest("request"))
  state = httpWorkspaceReducer(state, { type: "open-environment-document", document: environment })
  state = httpWorkspaceReducer(state, { type: "select-document", documentId: "request" })
  state = httpWorkspaceReducer(state, { type: "close-document", documentId: "request" })
  expect(state.activeDocumentId).toBe(environment.id)
  state = httpWorkspaceReducer(state, { type: "close-environment-document", id: environment.id })
  expect(state.activeDocumentId).toBe("")
  expect(state.documents).toEqual([])
})

test("dirty or saving environments block workspace changes and old async results cannot resurrect closed tabs", () => {
  let state = httpWorkspaceReducer(createHttpWorkspaceState(), {
    type: "open-environment-document",
    document: environment,
  })
  expect(environmentDocumentsBusy(state)).toBe(false)
  state = httpWorkspaceReducer(state, {
    type: "update-environment-document",
    id: environment.id,
    patch: { revision: 1 },
  })
  expect(environmentDocumentsBusy(state)).toBe(true)
  state = httpWorkspaceReducer(state, {
    type: "update-environment-document",
    id: environment.id,
    patch: { savedRevision: 1, busy: true },
  })
  expect(environmentDocumentsBusy(state)).toBe(true)
  state = httpWorkspaceReducer(state, { type: "clear-environment-documents" })
  state = httpWorkspaceReducer(state, {
    type: "update-environment-document",
    id: environment.id,
    patch: { rows: [{ id: "late", name: "late", value: "value" }] },
  })
  expect(state.environmentDocuments).toEqual([])
  expect(environmentDocumentsBusy(state)).toBe(false)
})
