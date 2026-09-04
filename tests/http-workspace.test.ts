import { describe, expect, test } from "bun:test"
import type { HttpResponseSnapshot, HttpWorkspaceOverlay } from "../src/features/http/model/types"
import { resolveHttpKeyboardCommand } from "../src/features/http/model/keyboard"
import { createHttpSuccessHistoryEntry } from "../src/features/http/model/history"
import {
  cycleHttpRequestRedirects,
  cycleHttpRequestTimeout,
  nextHttpTimeout,
} from "../src/features/http/model/request-options"
import {
  COMMON_HTTP_HEADER_NAMES,
  completeHttpKeyValueName,
  httpHeaderSensitivity,
} from "../src/features/http/model/key-value"
import {
  createHttpWorkspaceState,
  createScratchRequest,
  hasUnsavedHttpDocuments,
  HTTP_DOCUMENT_LIMIT,
  httpDocumentNeedsDiscardConfirmation,
  httpWorkspaceReducer,
  nextHttpMethod,
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
    encoding: "utf-8",
    redirects: [],
    timings: { headersMs: 1, downloadMs: 1, totalMs: 2 },
  } satisfies HttpResponseSnapshot
}

describe("HTTP workspace state", () => {
  test("cycles standard methods predictably after a custom method", () => {
    expect(nextHttpMethod("PROPFIND", 1)).toBe("GET")
    expect(nextHttpMethod("PROPFIND", -1)).toBe("OPTIONS")
  })

  test("cycles request timeouts and normalizes custom values", () => {
    expect(nextHttpTimeout(5_000)).toBe(10_000)
    expect(nextHttpTimeout(120_000)).toBe(5_000)
    expect(nextHttpTimeout(17_000)).toBe(5_000)
  })

  test("cycles request options through explicit values and back to workspace inheritance", () => {
    let timeout = { timeoutMs: 30_000, followRedirects: true }
    timeout = cycleHttpRequestTimeout(timeout)
    expect(timeout).toMatchObject({ timeoutMs: 5_000, timeoutExplicit: true })
    for (let index = 0; index < 4; index += 1) timeout = cycleHttpRequestTimeout(timeout)
    expect(timeout).toMatchObject({ timeoutMs: 120_000, timeoutExplicit: true })
    expect(cycleHttpRequestTimeout(timeout)).toEqual({
      timeoutMs: 30_000,
      followRedirects: true,
      timeoutExplicit: false,
    })

    let redirects = { timeoutMs: 30_000, followRedirects: true }
    redirects = cycleHttpRequestRedirects(redirects)
    expect(redirects).toMatchObject({ followRedirects: true, followRedirectsExplicit: true })
    redirects = cycleHttpRequestRedirects(redirects)
    expect(redirects).toMatchObject({ followRedirects: false, followRedirectsExplicit: true })
    expect(cycleHttpRequestRedirects(redirects)).toEqual({
      timeoutMs: 30_000,
      followRedirects: true,
      followRedirectsExplicit: false,
    })
  })

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

  test("requires confirmation only before closing a dirty non-final document", () => {
    let state = createHttpWorkspaceState(createScratchRequest("one"))
    expect(httpDocumentNeedsDiscardConfirmation(state.documents, "one")).toBe(false)
    state = httpWorkspaceReducer(state, {
      type: "add-document",
      request: createScratchRequest("two"),
    })
    expect(httpDocumentNeedsDiscardConfirmation(state.documents, "two")).toBe(false)
    state = httpWorkspaceReducer(state, {
      type: "update-request",
      documentId: "two",
      patch: { url: "https://example.test" },
    })
    expect(httpDocumentNeedsDiscardConfirmation(state.documents, "two")).toBe(true)
    expect(httpDocumentNeedsDiscardConfirmation(state.documents, "missing")).toBe(false)
    expect(hasUnsavedHttpDocuments(state.documents)).toBe(true)
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

  test("can finish a no-log execution without adding session history", () => {
    let state = createHttpWorkspaceState(createScratchRequest("private"))
    state = httpWorkspaceReducer(state, {
      type: "start-execution",
      documentId: "private",
      executionId: "private-execution",
      requestRevision: 0,
    })
    state = httpWorkspaceReducer(state, {
      type: "finish-execution",
      documentId: "private",
      response: response("private-execution", "private", 0),
      historyEntry: null,
    })
    expect(state.documents[0]?.execution.status).toBe("success")
    expect(state.history).toEqual([])
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

  test("keeps the More subview mounted per document", () => {
    let state = createHttpWorkspaceState(createScratchRequest("one"))
    state = httpWorkspaceReducer(state, {
      type: "select-request-more-view",
      documentId: "one",
      view: "assertions",
    })
    state = httpWorkspaceReducer(state, {
      type: "add-document",
      request: createScratchRequest("two"),
    })
    expect(state.documents.find((document) => document.request.id === "one")?.requestMoreView).toBe(
      "assertions",
    )
    expect(state.documents.find((document) => document.request.id === "two")?.requestMoreView).toBe(
      "options",
    )
  })

  test("keeps response inspection preferences and two history selections in workspace state", () => {
    let state = createHttpWorkspaceState(createScratchRequest("request"))
    state = httpWorkspaceReducer(state, {
      type: "update-response-presentation",
      documentId: "request",
      patch: { wrap: true, lineNumbers: true, foldDepth: 2 },
    })
    expect(state.documents[0]?.responsePresentation).toMatchObject({
      wrap: true,
      lineNumbers: true,
      foldDepth: 2,
    })
    const document = state.documents[0]!
    state = httpWorkspaceReducer(state, {
      type: "hydrate-history",
      entries: ["one", "two", "three"].map((id) =>
        createHttpSuccessHistoryEntry(document, response(id, "request", 0), null),
      ),
    })
    for (const entryId of ["one", "two", "three"]) {
      state = httpWorkspaceReducer(state, { type: "toggle-history-selection", entryId })
    }
    expect(state.historySelection).toEqual(["two", "three"])
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
    overlay: HttpWorkspaceOverlay = null,
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
    expect(command({ name: "e" })).toEqual({ kind: "open-environment-manager" })
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

  test("keeps environment creation inputs isolated inside their overlay", () => {
    expect(
      command({ name: "escape" }, "http-environment-create-secret", false, "environment-manager"),
    ).toEqual({ kind: "blur-editor" })
    expect(command({ name: "escape" }, "", false, "environment-manager")).toEqual({
      kind: "close-overlay",
    })
    expect(command({ name: "n" }, "", false, "environment-manager")).toEqual({ kind: "ignore" })
  })

  test("keeps workspace header editing isolated inside the settings overlay", () => {
    expect(
      command({ name: "escape" }, "http-key-value-name-workspace-0", false, "workspace-settings"),
    ).toEqual({ kind: "blur-editor" })
    expect(command({ name: "escape" }, "", false, "workspace-settings")).toEqual({
      kind: "close-overlay",
    })
    expect(command({ name: "t" }, "", false, "workspace-settings")).toEqual({ kind: "ignore" })
  })

  test("maps every external conflict resolution and keeps Escape non-destructive", () => {
    expect(command({ name: "r" }, "", false, "external-conflict")).toEqual({
      kind: "resolve-external-conflict",
      resolution: "reload",
    })
    expect(command({ name: "l" }, "", false, "external-conflict")).toEqual({
      kind: "resolve-external-conflict",
      resolution: "apply-local",
    })
    expect(command({ name: "c" }, "", false, "external-conflict")).toEqual({
      kind: "resolve-external-conflict",
      resolution: "save-copy",
    })
    expect(command({ name: "escape" }, "", false, "external-conflict")).toEqual({
      kind: "close-overlay",
    })
  })

  test("keeps response search contextual and lets its input close one layer", () => {
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "f", ctrl: true },
        focusedId: "http-response-scroll-request",
        navigationOpen: false,
        running: false,
        minimum: false,
        activePane: "response",
      }),
    ).toEqual({ kind: "open-response-search" })
    expect(command({ name: "escape" }, "http-response-search-request")).toEqual({
      kind: "close-response-control",
      control: "search",
    })
  })

  test("owns collection search and guarded file actions", () => {
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "f" },
        focusedId: "http-navigation-collection",
        navigationOpen: true,
        running: false,
        minimum: false,
        activePane: "navigation",
        navigationView: "collection",
      }),
    ).toEqual({ kind: "focus-collection-search" })
    expect(command({ name: "escape" }, "http-collection-search", true)).toEqual({
      kind: "blur-navigation-control",
    })
    expect(command({ name: "m", ctrl: true })).toEqual({
      kind: "open-overlay",
      overlay: "request-move",
    })
    expect(command({ name: "delete", ctrl: true })).toEqual({
      kind: "open-overlay",
      overlay: "request-delete",
    })
    expect(
      command({ name: "enter", ctrl: true }, "http-request-move-input", false, "request-move"),
    ).toEqual({ kind: "apply-overlay" })
    expect(command({ name: "d" }, "http-request-delete-confirm", false, "request-delete")).toEqual({
      kind: "apply-overlay",
    })
  })

  test("keeps collection import and request More actions contextual", () => {
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "i" },
        focusedId: "http-navigation-collection",
        navigationOpen: true,
        running: false,
        minimum: false,
        activePane: "navigation",
        navigationView: "collection",
      }),
    ).toEqual({ kind: "open-overlay", overlay: "collection-import" })
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "i" },
        focusedId: "",
        navigationOpen: false,
        running: false,
        minimum: false,
        activePane: "request",
        requestView: "more",
      }),
    ).toEqual({ kind: "open-overlay", overlay: "curl-import" })
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "2" },
        focusedId: "",
        navigationOpen: false,
        running: false,
        minimum: false,
        activePane: "request",
        requestView: "more",
      }),
    ).toEqual({ kind: "request-more-view", view: "assertions" })
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "4" },
        focusedId: "",
        navigationOpen: false,
        running: false,
        minimum: false,
        activePane: "request",
        requestView: "more",
      }),
    ).toEqual({ kind: "request-more-view", view: "preview" })
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "n" },
        focusedId: "",
        navigationOpen: false,
        running: false,
        minimum: false,
        activePane: "request",
        requestView: "more",
        requestMoreView: "assertions",
      }),
    ).toEqual({ kind: "add-automation-row" })
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "d" },
        focusedId: "",
        navigationOpen: false,
        running: false,
        minimum: false,
        activePane: "request",
        requestView: "more",
        requestMoreView: "chaining",
      }),
    ).toEqual({ kind: "none" })
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "n" },
        focusedId: "",
        navigationOpen: false,
        running: false,
        minimum: false,
        activePane: "request",
        requestView: "more",
        requestMoreView: "preview",
      }),
    ).toEqual({ kind: "none" })
    for (const [name, kind] of [
      ["t", "cycle-request-timeout"],
      ["r", "toggle-request-redirects"],
      ["l", "toggle-request-no-log"],
    ] as const) {
      expect(
        resolveHttpKeyboardCommand({
          key: { name },
          focusedId: "",
          navigationOpen: false,
          running: false,
          minimum: false,
          activePane: "request",
          requestView: "more",
          requestMoreView: "options",
        }),
      ).toEqual({ kind })
    }
    expect(command({ name: "escape" }, "http-automation-assertion-one", false)).toEqual({
      kind: "blur-control",
    })
    expect(
      command({ name: "f" }, "http-collection-import-source", false, "collection-import"),
    ).toEqual({
      kind: "ignore",
    })
    expect(
      command({ name: "escape" }, "http-collection-import-source", false, "collection-import"),
    ).toEqual({
      kind: "blur-editor",
    })
    expect(command({ name: "enter", ctrl: true }, "", false, "collection-import")).toEqual({
      kind: "apply-overlay",
    })
    expect(command({ name: "f" }, "", false, "collection-import")).toEqual({
      kind: "toggle-import-format",
    })
    expect(command({ name: "b" }, "", false, "collection-import")).toEqual({
      kind: "back-import-preview",
    })
    expect(
      resolveHttpKeyboardCommand({
        key: { name: "r" },
        focusedId: "http-navigation-collection",
        navigationOpen: true,
        running: false,
        minimum: false,
        activePane: "navigation",
        navigationView: "collection",
      }),
    ).toEqual({ kind: "open-overlay", overlay: "collection-runner" })
    expect(command({ name: "t" }, "", false, "collection-runner")).toEqual({
      kind: "cycle-runner-target",
    })
    expect(command({ name: "c" }, "", false, "collection-runner")).toEqual({
      kind: "cycle-runner-concurrency",
    })
    expect(command({ name: "x" }, "", false, "collection-runner")).toEqual({
      kind: "apply-overlay",
    })
    expect(
      command({ name: "t" }, "http-collection-runner-dataset", false, "collection-runner"),
    ).toEqual({ kind: "ignore" })
  })

  test("isolates dirty-document confirmation keys", () => {
    expect(command({ name: "d" }, "", false, "discard-document")).toEqual({
      kind: "apply-overlay",
    })
    expect(command({ name: "escape" }, "", false, "discard-document")).toEqual({
      kind: "close-overlay",
    })
    expect(command({ name: "x" }, "", false, "discard-document")).toEqual({ kind: "ignore" })
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
