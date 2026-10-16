import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { useRenderer } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { useHttpResponse } from "../../packages/feature-http/src/hooks/use-http-response"
import type { HttpDocumentState } from "../../packages/feature-http/src/model/types"
import {
  createHttpWorkspaceState,
  createScratchRequest,
} from "../../packages/feature-http/src/model/workspace"
import { DEFAULT_HTTP_WORKSPACE_CONFIG } from "../../packages/feature-http/src/storage/config"
import { HttpResponsePane } from "../../packages/feature-http/src/ui/HttpResponsePane"
import { httpResponseContent } from "../../packages/feature-http/src/ui/http-response-content"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

function responseDocument(source: string): HttpDocumentState {
  const document = createHttpWorkspaceState(
    createScratchRequest("copy", "http://fixture.test/response"),
  ).documents[0]
  if (!document) throw new Error("Missing response fixture")
  const body = new TextEncoder().encode(source)
  return {
    ...document,
    execution: {
      status: "success",
      response: {
        executionId: "copy-fixture",
        requestId: document.request.id,
        requestRevision: 0,
        url: document.request.url,
        status: 200,
        statusText: "OK",
        headers: [["content-type", "application/json"]],
        body,
        bodyKind: "json",
        contentType: "application/json",
        capturedBytes: body.length,
        truncated: false,
        encoding: "utf-8",
        redirects: [],
        timings: { headersMs: 0, downloadMs: 0, totalMs: 0 },
      },
    },
  }
}

function Harness({ initial }: { initial: HttpDocumentState }) {
  const [document, setDocument] = useState(initial)
  const [notice, setNotice] = useState("")
  const response = useHttpResponse({
    documents: [document],
    activeRequest: document.request,
    environmentName: null,
    clipboard: useRenderer(),
    setNotice,
    workspaceConfig: DEFAULT_HTTP_WORKSPACE_CONFIG,
    variablesForRequest: () => new Map(),
    isInsecureTlsApproved: () => false,
    authorizeRedirect: () => false,
  })
  return (
    <box width="100%" height="100%">
      <text id="request-panel-label" content="QUERY PARAMS HEADERS NOME VALOR" />
      <text id="copy-notice" content={notice} />
      <HttpResponsePane
        document={document}
        visible
        focused
        position={{ left: 0, top: 3, width: 140, height: 24 }}
        cookies={[]}
        registerScroll={() => {}}
        registerSearchInput={() => {}}
        onSelectView={(responseView) => setDocument((current) => ({ ...current, responseView }))}
        onPresentationChange={(patch) =>
          setDocument((current) => ({
            ...current,
            responsePresentation: { ...current.responsePresentation, ...patch },
          }))
        }
        onFocus={() => {}}
        onCopy={(content, label) => response.copyResponse(document.request.id, content, label)}
        onSave={() => {}}
        onOpen={() => {}}
        onDownload={() => {}}
        onCancelDownload={() => {}}
        downloading={false}
      />
    </box>
  )
}

async function clickLabel(label: string) {
  if (!tui) throw new Error("Missing TUI")
  await tui.renderOnce()
  const lines = tui.captureCharFrame().split("\n")
  const y = lines.findIndex((line) => line.includes(` ${label} `))
  const x = lines[y]?.indexOf(` ${label} `) ?? -1
  if (x < 0) throw new Error(`Missing button: ${label}`)
  await act(async () => tui?.mockMouse.click(x + 2, y))
  await tui.renderOnce()
}

const largeValue = {
  items: Array.from({ length: 1_200 }, (_, id) => ({
    id,
    name: `ação 中文 ${id}`,
    text: "x".repeat(40),
  })),
  final: "complete response",
}

test.each(["pretty", "raw"] as const)(
  "Copy includes the full large %s response beyond the display limit",
  async (responseView) => {
    const source = JSON.stringify(largeValue)
    const document = { ...responseDocument(source), responseView }
    expect(httpResponseContent(document, [])).toContain("EXIBIÇÃO LIMITADA")
    tui = await testRender(<Harness initial={document} />, { width: 140, height: 30 })
    const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
    await clickLabel("Copiar")
    expect(copy).toHaveBeenCalledTimes(1)
    const copied = copy.mock.calls[0]?.[0] ?? ""
    expect(copied.length).toBeGreaterThan(50_000)
    expect(JSON.parse(copied)).toEqual(largeValue)
    expect(copied).toBe(responseView === "raw" ? source : JSON.stringify(largeValue, null, 2))
    expect(tui.captureCharFrame()).toContain("BODY DA RESPOSTA COPIADO")
  },
)

test.each(["mouse", "keyboard"])(
  "Copy via %s ignores a native selection from the request panel",
  async (activation) => {
    const value = { message: "response only" }
    tui = await testRender(<Harness initial={responseDocument(JSON.stringify(value))} />, {
      width: 140,
      height: 30,
    })
    const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
    await tui.renderOnce()
    const label = tui.renderer.root.findDescendantById("request-panel-label")
    if (!label) throw new Error("Missing request label")
    await act(async () =>
      tui?.mockMouse.drag(label.screenX, label.screenY, label.screenX + 11, label.screenY),
    )
    expect(tui.renderer.getSelection()?.getSelectedText()).toContain("QUERY PARAMS")
    if (activation === "keyboard") {
      const button = tui.renderer.root.findDescendantById("http-response-copy-copy")
      if (!button) throw new Error("Missing copy button")
      act(() => button.focus())
      await act(async () => tui?.mockInput.pressEnter())
      await tui.renderOnce()
      expect(tui.renderer.getSelection()?.getSelectedText()).toContain("QUERY PARAMS")
    } else {
      await clickLabel("Copiar")
    }
    expect(copy).toHaveBeenCalledTimes(1)
    expect(copy).toHaveBeenCalledWith(JSON.stringify(value, null, 2))
    expect(tui.captureCharFrame()).toContain("BODY DA RESPOSTA COPIADO")
  },
)

test.each(["tree", "fold"])(
  "Copy preserves nested JSON with line numbers and %s collapsing",
  async (mode) => {
    const value = { user: { profile: { name: "Ada" } }, tags: ["one", "two"] }
    const document = responseDocument(JSON.stringify(value))
    document.responsePresentation.lineNumbers = true
    if (mode === "tree") document.responsePresentation.jsonCollapsedPaths = [""]
    else document.responsePresentation.foldDepth = 1
    tui = await testRender(<Harness initial={document} />, { width: 140, height: 30 })
    const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
    await clickLabel("Copiar")
    expect(copy).toHaveBeenCalledWith(JSON.stringify(value, null, 2))
  },
)

test("Copy keeps a large JSONPath result complete and Raw still copies the original body", async () => {
  const source = JSON.stringify(largeValue)
  const document = responseDocument(source)
  document.responsePresentation.jsonPath = "$.items"
  document.responsePresentation.foldDepth = 1
  document.responsePresentation.lineNumbers = true
  tui = await testRender(<Harness initial={document} />, { width: 140, height: 30 })
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
  await clickLabel("Copiar")
  expect(copy).toHaveBeenLastCalledWith(JSON.stringify(largeValue.items, null, 2))
  expect(tui.captureCharFrame()).toContain("VALOR JSONPATH COPIADO")
  await clickLabel("Raw")
  await clickLabel("Copiar")
  expect(copy).toHaveBeenLastCalledWith(source)
  expect(tui.captureCharFrame()).toContain("BODY DA RESPOSTA COPIADO")
  if (document.execution.status !== "success") throw new Error("Missing response")
  expect(new TextDecoder().decode(document.execution.response.body)).toBe(source)
})

test("Copy headers omits display line numbers", async () => {
  const document = responseDocument("{}")
  document.responseView = "headers"
  document.responsePresentation.lineNumbers = true
  tui = await testRender(<Harness initial={document} />, { width: 140, height: 30 })
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
  await clickLabel("Copiar")
  expect(copy).toHaveBeenCalledWith("content-type: application/json")
  expect(tui.captureCharFrame()).toContain("HEADERS COPIADOS")
})

test("Copy line copies the matched line and reports a rejected clipboard write", async () => {
  const document = responseDocument('{"message":"response line"}')
  document.responsePresentation.searchOpen = true
  document.responsePresentation.searchQuery = "response line"
  tui = await testRender(<Harness initial={document} />, { width: 140, height: 30 })
  for (let attempt = 0; attempt < 50; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (tui.renderer.currentFocusedRenderable?.id === "http-response-search-copy") break
  }
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-response-search-copy")
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(false)
  await clickLabel("Copiar linha")
  expect(copy).toHaveBeenCalledWith('  "message": "response line"')
  expect(tui.captureCharFrame()).toContain("O terminal não aceitou a cópia OSC52.")
  copy.mockReturnValue(true)
  await clickLabel("Copiar linha")
  expect(tui.captureCharFrame()).toContain("LINHA COPIADA")
})

test("Copy stays disabled for binary bodies", async () => {
  const document = responseDocument("binary fixture")
  if (document.execution.status !== "success") throw new Error("Missing response")
  document.execution.response.bodyKind = "binary"
  document.execution.response.contentType = "application/octet-stream"
  tui = await testRender(<Harness initial={document} />, { width: 140, height: 30 })
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
  await clickLabel("Copiar")
  expect(copy).not.toHaveBeenCalled()
})
