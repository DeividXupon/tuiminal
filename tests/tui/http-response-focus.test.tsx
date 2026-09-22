import "./setup"
import { expect, test } from "bun:test"
import type { ScrollBoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { useHttpResponseFocus } from "../../packages/feature-http/src/hooks/use-http-response-focus"
import type { HttpDocumentState } from "../../packages/feature-http/src/model/types"
import {
  createHttpWorkspaceState,
  createScratchRequest,
} from "../../packages/feature-http/src/model/workspace"
import type { HttpDocumentRefs } from "../../packages/feature-http/src/runtime"

function successfulDocument(): HttpDocumentState {
  const document = createHttpWorkspaceState(
    createScratchRequest("focus", "http://127.0.0.1/fixture"),
  ).documents[0]
  if (!document) throw new Error("Missing focus fixture document")
  return {
    ...document,
    execution: {
      status: "success",
      response: {
        executionId: "focus-fixture",
        requestId: document.request.id,
        requestRevision: 0,
        url: document.request.url,
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
        timings: { headersMs: 0, downloadMs: 0, totalMs: 0 },
      },
    },
  }
}

test.each(["searchOpen", "jsonPathOpen"] as const)(
  "response completion does not take focus from an open %s input",
  async (control) => {
    const document = successfulDocument()
    let focusCount = 0
    let setOpen: ((open: boolean) => void) | undefined
    const refs: HttpDocumentRefs = {
      headers: null,
      body: null,
      raw: null,
      response: { focus: () => focusCount++ } as unknown as ScrollBoxRenderable,
      responseSearch: null,
    }
    function Harness() {
      const [open, updateOpen] = useState(true)
      setOpen = updateOpen
      useHttpResponseFocus({
        active: true,
        document: {
          ...document,
          responsePresentation: { ...document.responsePresentation, [control]: open },
        },
        pane: "response",
        refsFor: () => refs,
      })
      return <text content={open ? "input open" : "input closed"} />
    }
    const tui = await testRender(<Harness />, { width: 40, height: 8 })
    try {
      await act(async () => Bun.sleep(20))
      expect(focusCount).toBe(0)
      await act(async () => setOpen?.(false))
      await act(async () => Bun.sleep(20))
      expect(focusCount).toBe(1)
    } finally {
      act(() => tui.renderer.destroy())
    }
  },
)
