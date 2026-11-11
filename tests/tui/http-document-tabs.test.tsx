import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
const node = (id: string) => tui?.renderer.root.findDescendantById(id)
async function click(id: string) {
  await settle(() => true)
  const target = node(id)
  if (!target) throw new Error(`Missing ${id}`)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}
async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    await Bun.sleep(name === "ESCAPE" ? 60 : 5)
  })
  await tui?.renderOnce()
}
async function mount(width: number) {
  tui = await testRender(<HttpClient active />, { width, height: 30 })
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
}
async function fillTabs() {
  for (let i = 2; i <= 6; i++) {
    await click("http-document-new")
    await settle(() => Boolean(node(`http-document-http-scratch-${i}`)))
  }
}

test.each([52, 160])(
  "numbered tabs and New stay reachable at %s columns; seventh replaces sixth",
  async (width) => {
    await mount(width)
    await fillTabs()
    await settle(() => tui?.captureCharFrame().includes("[6] GET Scratch") ?? false)
    const add = node("http-document-new")
    expect((add?.screenX ?? width) + (add?.width ?? 0)).toBeLessThanOrEqual(width)
    await click("http-document-new")
    await settle(() => Boolean(node("http-document-http-scratch-7")))
    expect(Boolean(node("http-document-http-scratch-6"))).toBe(false)
    for (let i = 1; i <= 5; i++) expect(Boolean(node(`http-document-http-scratch-${i}`))).toBe(true)
    expect(tui?.captureCharFrame()).toContain("[6] GET Scratch")
    await key("ESCAPE")
    await key("1")
    await settle(() => tui?.captureCharFrame().includes("[1] GET Scratch") ?? false)
    await key("6")
    await settle(() => tui?.captureCharFrame().includes("[6] GET Scratch") ?? false)
    expect(tui?.renderer.currentFocusedRenderable?.id).not.toBe("http-url-input")
    await click("http-url-input")
    const input = node("http-url-input") as InputRenderable
    const before = input.value
    await act(async () => tui?.mockInput.typeText("123"))
    expect(input.value).toContain(`${before}123`)
  },
)

test("replacing a dirty last tab can be cancelled or confirmed without losing the other tabs", async () => {
  await mount(160)
  await fillTabs()
  await click("http-url-input")
  await act(async () => tui?.mockInput.typeText("https://example.test/unsaved"))
  await click("http-document-new")
  await settle(() => Boolean(node("http-discard-document-modal")))
  expect(Boolean(node("http-document-http-scratch-6"))).toBe(true)
  expect(Boolean(node("http-document-http-scratch-7"))).toBe(false)
  await key("ESCAPE")
  await settle(() => !node("http-discard-document-modal"))
  expect((node("http-url-input") as InputRenderable).value).toContain("unsaved")
  await click("http-document-new")
  await settle(() => Boolean(node("http-discard-document-modal")))
  await key("d")
  await settle(() => Boolean(node("http-document-http-scratch-8")))
  expect(Boolean(node("http-discard-document-modal"))).toBe(false)
  expect(Boolean(node("http-document-http-scratch-6"))).toBe(false)
  for (let i = 1; i <= 5; i++) expect(Boolean(node(`http-document-http-scratch-${i}`))).toBe(true)
})

test("X closes the active tab, retains literal input and confirms dirty drafts", async () => {
  await mount(120)
  expect(tui!.captureCharFrame()).toContain("[X]")
  await key("x")
  expect((node("http-url-input") as InputRenderable).value).toContain("x")
  await key("ESCAPE")
  await key("x")
  await settle(() => Boolean(node("http-discard-document-modal")))
  await key("ESCAPE")
  await settle(() => !node("http-discard-document-modal"))
  expect(node("http-document-http-scratch-1")).toBeDefined()
  await click("http-document-new")
  await settle(() => Boolean(node("http-document-http-scratch-2")))
  await key("ESCAPE")
  await key("x")
  await settle(() => !node("http-document-http-scratch-2"))
  expect(node("http-document-http-scratch-1")).toBeDefined()
})

test("plus and minus resize the request pane through native keyboard input", async () => {
  await mount(120)
  await key("ESCAPE")
  const pane = node("http-request-pane-http-scratch-1")!
  const height = pane.height
  await key("+")
  await settle(() => pane.height > height)
  await key("-")
  await settle(() => pane.height === height)
})
