import "./setup"
import { afterEach, describe, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { useHttpResponse } from "../../src/features/http/hooks/use-http-response"
import type { HttpDocumentState } from "../../src/features/http/model/types"
import {
  createHttpWorkspaceState,
  createScratchRequest,
} from "../../src/features/http/model/workspace"
import * as downloads from "../../src/features/http/services/download"
import { DEFAULT_HTTP_WORKSPACE_CONFIG } from "../../src/features/http/storage/config"

let tui: TestRendererSetup | undefined
const cleanups: Array<() => void> = []
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function responseDocument(id: string): HttpDocumentState {
  const document = createHttpWorkspaceState(createScratchRequest(id, "http://fixture.test/data"))
    .documents[0]
  if (!document) throw new Error("Missing document fixture")
  return {
    ...document,
    execution: {
      status: "success",
      response: {
        executionId: id,
        requestId: id,
        requestRevision: 0,
        url: document.request.url,
        status: 200,
        statusText: "OK",
        headers: [],
        body: new Uint8Array([1]),
        bodyKind: "binary",
        contentType: "application/octet-stream",
        capturedBytes: 1,
        truncated: true,
        encoding: "utf-8",
        redirects: [],
        timings: { headersMs: 0, downloadMs: 0, totalMs: 0 },
      },
    },
  }
}

function fixture() {
  const first = responseDocument("first")
  const second = responseDocument("second")
  const requests: Array<{ signal: AbortSignal; finish(): void; fail(error: Error): void }> = []
  const notices: string[] = []
  const reader = spyOn(downloads, "downloadCompleteHttpResponse").mockImplementation(
    ({ signal }) =>
      new Promise((resolve, reject) => {
        requests.push({
          signal,
          finish: () =>
            resolve({
              path: "fixture.bin",
              bytes: 4,
              status: 200,
              url: "http://fixture.test/data",
            }),
          fail: reject,
        })
      }),
  )
  cleanups.push(() => reader.mockRestore())
  let api: ReturnType<typeof useHttpResponse>
  let setDocuments: (documents: HttpDocumentState[]) => void
  function Harness() {
    const [documents, update] = useState([first, second])
    setDocuments = update
    api = useHttpResponse({
      documents,
      activeRequest: documents[0]?.request,
      environmentName: null,
      clipboard: { copyToClipboardOSC52: () => true },
      setNotice: (notice) => notices.push(notice),
      workspaceConfig: DEFAULT_HTTP_WORKSPACE_CONFIG,
      variablesForRequest: () => new Map(),
      isInsecureTlsApproved: () => false,
      authorizeRedirect: () => false,
    })
    return <text content={api.downloadingDocumentId ?? "idle"} />
  }
  return {
    Harness,
    first,
    second,
    notices,
    requests,
    get api() {
      return api
    },
    replace: (documents: HttpDocumentState[]) => act(() => setDocuments(documents)),
  }
}

describe("HTTP download UI ownership", () => {
  test("three activations before a render start only one download", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 60, height: 6 })
    let pending: Promise<void>[] = []
    act(() => {
      pending = Array.from({ length: 3 }, () => h.api.downloadComplete("first"))
    })
    expect(h.requests).toHaveLength(1)
    await act(async () => {
      h.requests[0]?.finish()
      await Promise.all(pending)
    })
    expect(h.api.downloadingDocumentId).toBeNull()
    expect(h.notices.filter((notice) => notice.startsWith("DOWNLOAD COMPLETO"))).toHaveLength(1)
  })

  test.each(["success", "failure"] as const)(
    "unmount aborts and suppresses a late %s",
    async (result) => {
      const h = fixture()
      tui = await testRender(<h.Harness />, { width: 60, height: 6 })
      const retained = h.api.downloadComplete
      let pending: Promise<void> | undefined
      act(() => {
        pending = retained("first")
      })
      act(() => tui?.renderer.destroy())
      tui = undefined
      expect(h.requests[0]?.signal.aborted).toBe(true)
      h.notices.length = 0
      await act(async () => {
        if (result === "success") h.requests[0]?.finish()
        else h.requests[0]?.fail(new Error("obsolete failure"))
        await pending
        await retained("second")
      })
      expect(h.requests).toHaveLength(1)
      expect(h.notices).toEqual([])
    },
  )

  test("closing the owning document cancels its download but changing selection does not", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 60, height: 6 })
    let pending: Promise<void> | undefined
    act(() => {
      pending = h.api.downloadComplete("first")
    })
    h.replace([h.second, h.first])
    expect(h.requests[0]?.signal.aborted).toBe(false)
    h.replace([h.second])
    expect(h.requests[0]?.signal.aborted).toBe(true)
    await act(async () => {
      h.requests[0]?.finish()
      await pending
    })
    expect(h.api.downloadingDocumentId).toBeNull()
    expect(h.notices.some((notice) => notice.startsWith("DOWNLOAD COMPLETO"))).toBe(false)
  })

  test("failure releases the guard for an explicit retry", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 60, height: 6 })
    let pending: Promise<void> | undefined
    act(() => {
      pending = h.api.downloadComplete("first")
    })
    await act(async () => {
      h.requests[0]?.fail(new Error("synthetic failure"))
      await pending
    })
    expect(h.api.downloadingDocumentId).toBeNull()
    act(() => {
      pending = h.api.downloadComplete("second")
    })
    expect(h.requests).toHaveLength(2)
    await act(async () => {
      h.requests[1]?.finish()
      await pending
    })
    expect(h.api.downloadingDocumentId).toBeNull()
  })
})
