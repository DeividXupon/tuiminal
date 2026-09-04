import { describe, expect, test } from "bun:test"
import type { HttpResponseSnapshot } from "../src/features/http/model/types"
import { resolveHttpKeyboardCommand } from "../src/features/http/model/keyboard"
import {
  COMMON_HTTP_HEADER_NAMES,
  completeHttpKeyValueName,
  httpHeaderSensitivity,
} from "../src/features/http/model/key-value"
import {
  createHttpWorkspaceState,
  createScratchRequest,
  HTTP_DOCUMENT_LIMIT,
  httpWorkspaceReducer,
} from "../src/features/http/model/workspace"

function response(executionId: string, requestId: string, requestRevision: number) {
  return {
    executionId,
    requestId,
    requestRevision,
    url: "http://example.com/",
    status: 200,
    statusText: "OK",
    headers: [],
    body: new Uint8Array(),
    bodyKind: "text",
    contentType: "text/plain",
    capturedBytes: 0,
    truncated: false,
    timings: { headersMs: 1, downloadMs: 1, totalMs: 2 },
  } satisfies HttpResponseSnapshot
}

describe("HTTP workspace state", () => {
  test("keeps document drafts isolated and selects a neighbor on close", () => {
    let state = createHttpWorkspaceState(createScratchRequest("one"))
    state = httpWorkspaceReducer(state, {
      type: "add-document",
      request: createScratchRequest("two"),
    })
    state = httpWorkspaceReducer(state, {
      type: "update-request",
      documentId: "two",
      patch: { url: "two.test" },
    })
    expect(state.documents.find((document) => document.request.id === "one")?.request.url).toBe("")
    expect(state.documents.find((document) => document.request.id === "two")?.revision).toBe(1)

    state = httpWorkspaceReducer(state, { type: "close-document", documentId: "two" })
    expect(state.activeDocumentId).toBe("one")
    expect(state.documents).toHaveLength(1)
  })

  test("enforces the document limit and never closes the final scratch", () => {
    let state = createHttpWorkspaceState(createScratchRequest("one"))
    for (let index = 2; index <= HTTP_DOCUMENT_LIMIT + 2; index += 1) {
      state = httpWorkspaceReducer(state, {
        type: "add-document",
        request: createScratchRequest(String(index)),
      })
    }
    expect(state.documents).toHaveLength(HTTP_DOCUMENT_LIMIT)
    const one = createHttpWorkspaceState(createScratchRequest("only"))
    expect(httpWorkspaceReducer(one, { type: "close-document", documentId: "only" })).toBe(one)
  })

  test("accepts only the response owned by the active execution and revision", () => {
    let state = createHttpWorkspaceState(createScratchRequest("request"))
    state = httpWorkspaceReducer(state, {
      type: "start-execution",
      documentId: "request",
      executionId: "current",
      requestRevision: 0,
    })
    const ignored = httpWorkspaceReducer(state, {
      type: "finish-execution",
      documentId: "request",
      response: response("late", "request", 0),
    })
    expect(ignored).toBe(state)

    state = httpWorkspaceReducer(state, {
      type: "finish-execution",
      documentId: "request",
      response: response("current", "request", 0),
    })
    expect(state.documents[0]?.execution.status).toBe("success")
    expect(state.history).toHaveLength(1)
  })

  test("keeps an earlier response visible after the request becomes dirty", () => {
    let state = createHttpWorkspaceState(createScratchRequest("request"))
    state = httpWorkspaceReducer(state, {
      type: "start-execution",
      documentId: "request",
      executionId: "execution",
      requestRevision: 0,
    })
    state = httpWorkspaceReducer(state, {
      type: "finish-execution",
      documentId: "request",
      response: response("execution", "request", 0),
    })
    state = httpWorkspaceReducer(state, {
      type: "update-request",
      documentId: "request",
      patch: { url: "changed.test" },
    })
    const execution = state.documents[0]?.execution
    expect(execution?.status).toBe("success")
    if (execution?.status === "success") expect(execution.response.requestRevision).toBe(0)
    expect(state.documents[0]?.revision).toBe(1)
  })

  test("keeps split and maximize preferences isolated per document", () => {
    let state = createHttpWorkspaceState(createScratchRequest("one"))
    state = httpWorkspaceReducer(state, {
      type: "add-document",
      request: createScratchRequest("two"),
    })
    state = httpWorkspaceReducer(state, {
      type: "set-split-ratio",
      documentId: "two",
      ratio: 0.55,
    })
    state = httpWorkspaceReducer(state, {
      type: "toggle-maximize",
      documentId: "two",
      pane: "response",
    })
    expect(state.documents.find((document) => document.request.id === "one")?.splitRatio).toBe(0.4)
    expect(state.documents.find((document) => document.request.id === "two")).toMatchObject({
      splitRatio: 0.55,
      maximizedPane: "response",
    })
  })

  test("opens and closes a single workspace overlay layer", () => {
    const initial = createHttpWorkspaceState(createScratchRequest("one"))
    const open = httpWorkspaceReducer(initial, { type: "open-overlay", overlay: "jump" })
    expect(open.overlay).toBe("jump")
    expect(httpWorkspaceReducer(open, { type: "close-overlay" }).overlay).toBeNull()
  })

  test("commits a saved scratch identity without losing its mounted document state", () => {
    let state = createHttpWorkspaceState(createScratchRequest("scratch"))
    state = httpWorkspaceReducer(state, {
      type: "update-request",
      documentId: "scratch",
      patch: { url: "example.test" },
    })
    const saved = {
      ...state.documents[0]!.request,
      id: "requests/example.http#example",
      source: {
        kind: "file" as const,
        path: "requests/example.http",
        blockId: "requests/example.http#example",
        sourceHash: "hash",
      },
    }
    state = httpWorkspaceReducer(state, {
      type: "commit-saved-document",
      documentId: "scratch",
      request: saved,
    })
    expect(state.activeDocumentId).toBe(saved.id)
    expect(state.documents[0]).toMatchObject({
      request: saved,
      revision: 1,
      savedRevision: 1,
      splitRatio: 0.4,
    })
  })
})

describe("HTTP keyboard ownership", () => {
  const command = (
    key: { name: string; ctrl?: boolean; option?: boolean },
    focusedId = "",
    navigationOpen = false,
    overlay: "jump" | "help" | null = null,
  ) =>
    resolveHttpKeyboardCommand({
      key,
      focusedId,
      navigationOpen,
      running: true,
      minimum: true,
      overlay,
    })

  test("inputs consume text and release one layer with Escape", () => {
    expect(command({ name: "s" }, "http-url-input")).toEqual({ kind: "ignore" })
    expect(command({ name: "escape" }, "http-url-input")).toEqual({ kind: "blur-url" })
    expect(command({ name: "enter", ctrl: true }, "http-body-editor-request")).toEqual({
      kind: "send",
    })
    expect(command({ name: "escape" }, "http-headers-editor-request")).toEqual({
      kind: "blur-editor",
    })
    expect(command({ name: "c" }, "http-key-value-name-1")).toEqual({ kind: "ignore" })
    expect(command({ name: "escape" }, "http-key-value-name-1")).toEqual({
      kind: "blur-control",
    })
    expect(command({ name: "escape" }, "http-navigation-history", true)).toEqual({
      kind: "close-navigation",
    })
  })

  test("maps document, navigation, cancellation, and minimum-pane shortcuts", () => {
    expect(command({ name: "n", ctrl: true })).toEqual({ kind: "add-document" })
    expect(command({ name: "left", option: true })).toEqual({
      kind: "cycle-document",
      direction: -1,
    })
    expect(command({ name: "escape" }, "", true)).toEqual({ kind: "close-navigation" })
    expect(command({ name: "x" })).toEqual({ kind: "cancel" })
    expect(command({ name: "2" })).toEqual({ kind: "pane", pane: "response" })
    expect(command({ name: "up", ctrl: true })).toEqual({
      kind: "resize-split",
      direction: 1,
    })
    expect(command({ name: "f10" })).toEqual({ kind: "toggle-maximize" })
    expect(command({ name: "o", ctrl: true })).toEqual({
      kind: "open-overlay",
      overlay: "jump",
    })
    expect(command({ name: "f1" })).toEqual({ kind: "open-overlay", overlay: "help" })
    expect(command({ name: "s", ctrl: true }, "http-url-input")).toEqual({
      kind: "save-document",
    })
    expect(command({ name: "e" })).toEqual({ kind: "cycle-environment" })
  })

  test("an open overlay owns every key and jump targets", () => {
    expect(command({ name: "escape" }, "http-overlay-close", false, "help")).toEqual({
      kind: "close-overlay",
    })
    expect(command({ name: "h" }, "http-overlay-close", false, "jump")).toEqual({
      kind: "jump",
      target: "headers",
    })
    expect(command({ name: "s" }, "http-overlay-close", false, "help")).toEqual({
      kind: "ignore",
    })
  })
})

test("HTTP header sensitivity follows credential-bearing names", () => {
  expect(httpHeaderSensitivity("Authorization")).toBe("literal-secret")
  expect(httpHeaderSensitivity("X-API-Key")).toBe("literal-secret")
  expect(httpHeaderSensitivity("Content-Type")).toBe("normal")
})

test("HTTP key/value names complete common headers by prefix", () => {
  expect(completeHttpKeyValueName("cont", COMMON_HTTP_HEADER_NAMES)).toBe("Content-Type")
  expect(completeHttpKeyValueName("content-type", COMMON_HTTP_HEADER_NAMES)).toBeUndefined()
  expect(completeHttpKeyValueName("x-unknown", COMMON_HTTP_HEADER_NAMES)).toBeUndefined()
})
