import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { HttpRequestDocs } from "../../packages/feature-http/src/ui/HttpRequestDocs"
import { importPostmanCollection } from "../../packages/feature-http/src/importing/postman"
import {
  parseHttpFile,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../../packages/feature-http/src/model/http-file"
import { writePostmanProvenance } from "../../packages/feature-http/src/postman/sync"
import {
  loadPostmanAccount,
  removePostmanAccount,
  savePostmanAccount,
} from "../../packages/feature-http/src/postman/account"

let tui: TestRendererSetup | undefined
let requestScope = ""
const root = process.env.TUIMINAL_HTTP_HOME
if (!root) throw new Error("Missing isolated HTTP home")
const paths: string[] = []
afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  requestScope = ""
  await Promise.all(paths.splice(0).map((path) => rm(path, { force: true })))
})
function node(id: string) {
  const pane = tui?.renderer.root.findDescendantById(requestScope)
  return pane?.findDescendantById(id) ?? tui?.renderer.root.findDescendantById(id)
}
async function settle(check: () => boolean) {
  for (let index = 0; index < 100; index++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
async function click(id: string) {
  await settle(() => Boolean(node(id)?.width))
  const target = node(id)
  if (!target) throw new Error(`Missing ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(
      target.screenX + Math.floor(target.width / 2),
      target.screenY + Math.floor(target.height / 2),
    )
    await tui?.renderOnce()
  })
}
async function key(name: string, ctrl = false) {
  await act(async () => {
    tui?.mockInput.pressKey(name, { ctrl })
    if (name === "ESCAPE") await Bun.sleep(70)
    await tui?.renderOnce()
  })
}

test("Docs shows imported Markdown, scrolls, survives resize, and preserves saved state and tab navigation", async () => {
  const description =
    "# List customers\n\nReturns **active customers**.\n\n" +
    Array.from({ length: 65 }, (_, index) => `- Documented field ${index}`).join("\n")
  const request = importPostmanCollection({
    item: [
      {
        name: "Documented",
        request: { method: "GET", url: "https://example.invalid", description },
      },
    ],
  }).requests[0]
  if (!request) throw new Error("Missing imported request")
  const path = "request-docs-ui.http"
  const absolute = resolve(root, path)
  paths.push(absolute)
  const source = serializeHttpRequestBlock(request)
  await writeFile(absolute, source)
  let setActive: (value: boolean) => void = () => {}
  function Harness() {
    const [active, update] = useState(true)
    setActive = update
    return <HttpClient active={active} />
  }
  tui = await testRender(<Harness />, { width: 120, height: 36 })
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("c")
  const requestId = `${path}#documented`
  requestScope = `http-request-pane-${requestId}`
  await click(`http-navigation-project-${requestId}`)
  await click("http-request-view-more")
  await click("http-request-more-docs")
  await settle(() => tui?.captureCharFrame().includes("Returns active customers.") ?? false)
  expect(tui.captureCharFrame()).not.toContain("MODIFICADO")
  const scroll = node(`http-request-docs-${requestId}`) as ScrollBoxRenderable
  await settle(() => tui?.renderer.currentFocusedRenderable === scroll)
  await key("ARROW_DOWN")
  await settle(() => scroll.scrollTop > 0)
  const top = scroll.scrollTop
  await act(async () => tui?.resize(52, 36))
  await settle(() => scroll.viewport.width > 0 && scroll.viewport.width < 52)
  expect(tui.renderer.currentFocusedRenderable).toBe(scroll)
  expect(scroll.scrollTop).toBeGreaterThanOrEqual(top)
  const docsTab = node("http-request-more-docs")
  const pane = node(`http-request-pane-${requestId}`)
  if (!docsTab || !pane) throw new Error("Missing request pane")
  expect(docsTab.screenX + docsTab.width).toBeLessThanOrEqual(pane.screenX + pane.width)
  expect(node("http-request-view-docs")).toBeUndefined()
  await key("v")
  await settle(() => tui?.captureCharFrame().includes("OPÇÕES DA REQUISIÇÃO") ?? false)
  expect(tui.renderer.currentFocusedRenderable).not.toBe(scroll)
  await key("z")
  await settle(() => tui?.renderer.currentFocusedRenderable === scroll)
  await click("http-request-view-auth")
  await settle(
    () => tui?.captureCharFrame().includes("Nenhuma credencial configurada nesta aba.") ?? false,
  )
  await click("http-request-view-more")
  await click("http-request-more-docs")
  await settle(() => tui?.renderer.currentFocusedRenderable === scroll)
  await act(async () => setActive(false))
  await settle(() => tui?.renderer.currentFocusedRenderable !== scroll)
  const inactiveTop = scroll.scrollTop
  await key("ARROW_DOWN")
  expect(scroll.scrollTop).toBe(inactiveTop)
  await act(async () => setActive(true))
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await click("http-request-view-more")
  await click("http-request-more-docs")
  await settle(() => tui?.renderer.currentFocusedRenderable === scroll)
  await key("TAB")
  await settle(() => tui?.renderer.currentFocusedRenderable !== scroll)
  expect(await readFile(absolute, "utf8")).toBe(source)
}, 15_000)

test("older Postman docs retry and ignore stale reads, and editing starts with the fetched text", async () => {
  const path = "postman/request-docs-legacy.http"
  const absolute = resolve(root, path)
  paths.push(absolute, `${absolute}.postman.json`)
  await mkdir(resolve(root, "postman"), { recursive: true })
  const source = "### Legacy\n# @name legacy\nGET https://example.invalid\n"
  await writeFile(absolute, source)
  const remote = {
    item: [
      {
        id: "docs-r1",
        name: "Legacy",
        request: {
          method: "GET",
          url: "https://example.invalid",
          description: "# Remote docs\n\nFrom the linked request.",
        },
      },
    ],
  }
  await writePostmanProvenance(root, path, "docs-c1", remote, "docs-w1")
  const sidecar = await readFile(`${absolute}.postman.json`, "utf8")
  const file = parseHttpFile(source, path)
  const block = file.requests[0]
  if (!block) throw new Error("Missing request block")
  const request = requestFromHttpFile(file, block)
  const originalAccount = await loadPostmanAccount()
  const originalFetch = globalThis.fetch
  let calls = 0
  const changes: string[] = []
  let setVisible: (value: boolean) => void = () => {}
  function Harness() {
    const [visible, update] = useState(true)
    const [current, updateRequest] = useState(request)
    setVisible = update
    return (
      <HttpRequestDocs
        request={current}
        visible={visible}
        focused={visible}
        onFocus={() => {}}
        onChange={(description) => {
          changes.push(description)
          updateRequest({ ...current, description })
        }}
      />
    )
  }
  let release: (() => void) | undefined
  let fail = true
  let wait: Promise<void> | undefined = new Promise((resolve) => {
    release = resolve
  })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(new URL(String(input)).pathname).toBe("/collections/docs-c1")
    expect(init?.method).toBe("GET")
    calls += 1
    await wait
    return fail ? new Response("failure", { status: 503 }) : Response.json({ collection: remote })
  }) as typeof fetch
  try {
    await savePostmanAccount({ apiKey: "PMAK-docs-fixture", region: "us" })
    tui = await testRender(<Harness />, { width: 80, height: 24 })
    await settle(
      () => calls === 1 && Boolean(tui?.captureCharFrame().includes("Carregando documentação")),
    )
    await key("RETURN")
    expect(node(`http-docs-editor-${request.id}`)).toBeUndefined()
    await act(async () => setVisible(false))
    release?.()
    await act(async () => {
      await Bun.sleep(20)
      await tui?.renderOnce()
    })
    expect(tui.captureCharFrame()).not.toContain("HTTP 503")
    expect(tui.renderer.currentFocusedRenderable?.id).not.toBe(`http-request-docs-${request.id}`)
    await act(async () => setVisible(true))
    await settle(() => tui?.captureCharFrame().includes("HTTP 503") ?? false)
    fail = false
    wait = undefined
    await click(`http-request-docs-retry-${request.id}`)
    await settle(() => tui?.captureCharFrame().includes("From the linked request.") ?? false)
    expect(calls).toBe(3)
    await click(`http-request-docs-edit-${request.id}`)
    const editor = node(`http-docs-editor-${request.id}`) as TextareaRenderable
    expect(editor.plainText).toBe("# Remote docs\n\nFrom the linked request.")
    expect(changes).toEqual([])
    await act(async () => tui?.mockInput.typeText("Changed "))
    await settle(() => changes.length > 0)
    expect(changes.at(-1)).toContain("From the linked request.")
    expect(await readFile(absolute, "utf8")).toBe(source)
    expect(await readFile(`${absolute}.postman.json`, "utf8")).toBe(sidecar)
  } finally {
    release?.()
    act(() => tui?.renderer.destroy())
    tui = undefined
    globalThis.fetch = originalFetch
    if (originalAccount) await savePostmanAccount(originalAccount)
    else await removePostmanAccount()
  }
})

test("Docs edits Markdown, owns text shortcuts, preserves drafts across tabs and saves the full text", async () => {
  const path = "request-docs-edit-ui.http"
  const absolute = resolve(root, path)
  paths.push(absolute)
  const initial = "# Original\n\nDescrição original 日本語."
  await writeFile(
    absolute,
    `### Editable\n# @name editable\n# @description ${JSON.stringify(initial)}\nGET https://example.invalid\n`,
  )
  const requestId = `${path}#editable`
  requestScope = `http-request-pane-${requestId}`
  const editorId = `http-docs-editor-${requestId}`
  tui = await testRender(<HttpClient active />, { width: 120, height: 36, kittyKeyboard: true })
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await click(`http-navigation-project-${requestId}`)
  await click("http-request-view-more")
  await click("http-request-more-docs")
  await click(`http-request-docs-edit-${requestId}`)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === editorId)
  const editor = node(editorId) as TextareaRenderable
  expect(editor.plainText).toBe(initial)
  expect(tui.captureCharFrame()).not.toContain("MODIFICADO")
  const markdown = "# Updated documentation\n\nDescrição **editada** 日本語.\n\n"
  await act(async () => {
    editor.selectAll()
    await tui?.mockInput.pasteBracketedText(markdown)
  })
  await act(async () => tui?.mockInput.typeText("afes?m"))
  await key("TAB")
  const expected = `${markdown}afes?m  `
  await settle(() => editor.plainText === expected)
  expect(tui.renderer.currentFocusedRenderable).toBe(editor)
  expect(tui.captureCharFrame()).toContain("MODIFICADO")
  expect(node("http-environment-manager-modal")).toBeUndefined()
  await act(async () => tui?.resize(52, 36))
  await settle(() => editor.width > 0 && editor.width < 52)
  expect(node(editorId)).toBe(editor)
  await click("http-request-view-headers")
  await settle(() => tui?.renderer.currentFocusedRenderable !== editor)
  await click("http-request-view-more")
  await click("http-request-more-docs")
  await settle(() => tui?.renderer.currentFocusedRenderable === editor)
  expect(editor.plainText).toBe(expected)
  await key("ESCAPE")
  await settle(
    () => tui?.renderer.currentFocusedRenderable?.id === `http-request-docs-${requestId}`,
  )
  await settle(() => tui?.captureCharFrame().includes("Updated documentation") ?? false)
  await key("RETURN")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === editorId)
  expect((node(editorId) as TextareaRenderable).plainText).toBe(expected)
  await key("s", true)
  await settle(() => tui?.captureCharFrame().includes("SALVO") ?? false)
  const saved = parseHttpFile(await readFile(absolute, "utf8"), path)
  expect(saved.requests[0]?.description).toBe(expected)
  expect(tui.captureCharFrame()).not.toContain("MODIFICADO")
  act(() => tui?.renderer.destroy())
  tui = undefined
  tui = await testRender(<HttpClient active />, { width: 120, height: 36 })
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await click(`http-navigation-project-${requestId}`)
  await click("http-request-view-more")
  await click("http-request-more-docs")
  await click(`http-request-docs-edit-${requestId}`)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === editorId)
  expect((node(editorId) as TextareaRenderable).plainText).toBe(expected)
}, 15_000)
