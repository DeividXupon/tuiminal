import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})
const node = (id: string) => tui?.renderer.root.findDescendantById(id)
async function settle(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(`HTTP did not settle:\n${tui?.captureCharFrame()}`)
}
async function key(name: string, shift = false) {
  await act(async () => {
    if (name === "ENTER") tui?.mockInput.pressEnter()
    else tui?.mockInput.pressKey(name, { shift })
    await Bun.sleep(name === "ESCAPE" ? 60 : 5)
  })
  await tui?.renderOnce()
}
async function click(id: string) {
  const target = node(id)
  if (!target) throw new Error(`Missing ${id}`)
  await act(async () =>
    tui?.mockMouse.click(target.screenX + Math.min(1, target.width - 1), target.screenY),
  )
  await tui?.renderOnce()
}
async function mount(width = 160, height = 36) {
  tui = await testRender(<HttpClient active />, { width, height })
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
}
const request = "http-request-pane-http-scratch-1"
const response = "http-response-pane-http-scratch-1"

test("M selects visible boxes spatially and Shift+M changes the method", async () => {
  await mount()
  const method = node("http-method-button")
  expect(tui?.captureCharFrame().split("\n")[method?.screenY ?? 0]).toContain("GET     [Shift+M]")
  await key("ESCAPE")
  await key("m")
  await settle(() => Boolean(node(`${request}-focus-selection-tint`)))
  expect(node("http-box-selection")).toBeDefined()
  await key("l")
  await settle(() => Boolean(node(`${response}-focus-selection-tint`)))
  await key("ENTER")
  await settle(() => !node("http-box-selection"))
  await key("m", true)
  expect(tui?.captureCharFrame()).toContain("POST")
  await key("m")
  await settle(() => Boolean(node(`${response}-focus-selection-tint`)))
  await key("h")
  await key("ESCAPE")
  await key("m")
  await settle(() => Boolean(node(`${response}-focus-selection-tint`)))
  await key("m")
  await settle(() => !node("http-box-selection"))
})

test("Escape cancels a request after leaving its input and preserves the draft for retry", async () => {
  const originalFetch = globalThis.fetch
  let sent = 0
  let aborted = 0
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    sent++
    if (sent > 1) return Response.json({ retried: true })
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          aborted++
          reject(new DOMException("Aborted", "AbortError"))
        },
        { once: true },
      )
    })
  }) as typeof fetch
  try {
    await mount()
    const input = node("http-url-input") as InputRenderable
    await act(async () => tui?.mockInput.typeText("https://example.invalid/draft"))
    const draft = input.value
    await click("http-send-button")
    await settle(() => sent === 1)
    await click("http-url-input")
    await key("ESCAPE")
    expect(aborted).toBe(0)
    await key("ESCAPE")
    await settle(() => tui?.captureCharFrame().includes("REQUISIÇÃO CANCELADA") ?? false)
    expect(aborted).toBe(1)
    expect(input.value).toBe(draft)
    expect(node("http-document-http-scratch-1")).toBeDefined()
    await key("s")
    await settle(() => tui?.captureCharFrame().includes("retried") ?? false)
    expect(sent).toBe(2)
    expect(input.value).toBe(draft)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("mouse buttons open actions and box selection while URL typing retains m and ?", async () => {
  await mount()
  const input = node("http-url-input") as InputRenderable
  const before = input.value
  await act(async () => tui?.mockInput.typeText("m?"))
  expect(input.value).toBe(`${before}m?`)
  expect(node("http-action-palette")).toBeUndefined()
  expect(node("http-box-selection")).toBeUndefined()
  await click("http-action-palette-open")
  await settle(() => Boolean(node("http-action-palette")))
  await key("ESCAPE")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await click("http-jump-button")
  await settle(() => Boolean(node("http-url-pane-focus-selection")))
  await click(`${response}-focus-selection`)
  await settle(() => !node("http-box-selection"))
  await key("m")
  await settle(() => Boolean(node(`${response}-focus-selection-tint`)))
})

test("question mark opens searchable actions and executing a result closes the palette", async () => {
  await mount()
  await key("ESCAPE")
  await key("?")
  await settle(() => Boolean(node("http-action-palette")))
  await key("/")
  await act(async () => tui?.mockInput.typeText("Nova request"))
  await settle(() => Boolean(node("http-action-palette-row-new")))
  expect(node("http-action-palette-row-send")).toBeUndefined()
  await key("ENTER")
  await settle(() => !node("http-action-palette"))
  expect(node("http-document-http-scratch-2")).toBeDefined()
})

test.each([52, 80, 120])("box selection at %s columns excludes hidden panes", async (width) => {
  await mount(width, 30)
  await key("ESCAPE")
  await key("m")
  await settle(() => Boolean(node("http-box-selection")))
  expect(node(`${request}-focus-selection-tint`)).toBeDefined()
  const navigation = node("http-navigation-pane")
  if (width < 96) expect(navigation?.visible).toBe(false)
  if (width === 52) {
    expect(node(response)?.visible).toBe(false)
    await key("l")
    expect(node(`${request}-focus-selection-tint`)).toBeDefined()
  } else {
    await key("j")
    await settle(() => Boolean(node(`${response}-focus-selection-tint`)))
  }
  await key("ESCAPE")
  await settle(() => !node("http-box-selection"))
})

test("the box action transfers focus from the palette to the selector", async () => {
  await mount()
  await click("http-action-palette-open")
  await settle(() => Boolean(node("http-action-palette")))
  await click("http-action-palette-row-boxes")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-box-selection")
  expect(node("http-action-palette")).toBeUndefined()
  await key("ESCAPE")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
})

test("the action palette preserves a request table editor and its draft", async () => {
  await mount()
  await key("ESCAPE")
  await key("ENTER")
  await settle(() =>
    (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-name-"),
  )
  await act(async () => tui?.mockInput.typeText("m?"))
  await settle(() => (tui?.renderer.currentFocusedRenderable as InputRenderable)?.value === "m?")
  const input = tui?.renderer.currentFocusedRenderable as InputRenderable
  expect(input.value).toBe("m?")
  expect(node("http-action-palette")).toBeUndefined()
  await click("http-action-palette-open")
  await settle(() => Boolean(node("http-action-palette")))
  await key("ESCAPE")
  await settle(() => tui?.renderer.currentFocusedRenderable === input)
  expect(input.value).toBe("m?")
})

test("HTTP action and selection dialogs consume Escape before application exit", async () => {
  const previousOnlyTab = process.env.TUIMINAL_ONLY_TAB
  process.env.TUIMINAL_ONLY_TAB = "http"
  try {
    tui = await testRender(<App />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("ESCAPE")
    await key("?")
    await settle(() => Boolean(node("http-action-palette")))
    await key("ESCAPE")
    await settle(() => !node("http-action-palette"))
    expect(tui.renderer.isDestroyed).toBe(false)
    expect(node("unsaved-changes-exit-modal")).toBeUndefined()
    await key("m")
    await settle(() => Boolean(node("http-box-selection")))
    await key("ESCAPE")
    await settle(() => !node("http-box-selection"))
    expect(tui.renderer.isDestroyed).toBe(false)
    expect(node("unsaved-changes-exit-modal")).toBeUndefined()
    await click("http-url-input")
    await act(async () => tui?.mockInput.typeText("https://example.invalid/last-draft"))
    await key("ESCAPE")
    await act(async () => tui?.mockInput.pressKey("w", { ctrl: true }))
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-discard-document-modal")
    await key("ESCAPE")
    await settle(() => !node("http-discard-document-modal"))
    expect(node("unsaved-changes-exit-modal")).toBeUndefined()
    expect(tui.renderer.isDestroyed).toBe(false)
    expect((node("http-url-input") as InputRenderable).value).toBe(
      "https://example.invalid/last-draft",
    )
  } finally {
    if (previousOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
    else process.env.TUIMINAL_ONLY_TAB = previousOnlyTab
  }
})
