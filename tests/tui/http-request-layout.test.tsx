import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { InputRenderable, Renderable, ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => Bun.sleep(10))
    await act(async () => tui?.renderOnce())
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
function node(id: string) {
  const result = tui?.renderer.root.findDescendantById(id)
  if (!result) throw new Error(`Missing ${id}`)
  return result
}
async function key(name: string) {
  await act(async () => tui?.mockInput.pressKey(name))
  await act(async () => tui?.renderOnce())
}
async function click(id: string) {
  const target = node(id)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await act(async () => tui?.renderOnce())
}
function descendants(root: Renderable): Renderable[] {
  return root.getChildren().flatMap((child) => [child, ...descendants(child)])
}
function checkColumns(section: string) {
  const root = node(`http-key-value-section-${section}`)
  for (const field of ["name", "value"]) {
    const heading = node(`http-key-value-${field}-heading-${section}`)
    const inputs = descendants(root).filter(
      (child) => child.id.startsWith(`http-key-value-${field}-`) && !child.id.includes("heading"),
    )
    expect(inputs.length).toBeGreaterThan(0)
    for (const input of inputs) {
      expect(input.screenX).toBe(heading.screenX)
      expect(input.width, input.id).toBe(heading.width)
      expect(input.width).toBeGreaterThan(0)
    }
  }
  for (const child of descendants(root).filter((child) =>
    child.id.startsWith("http-key-value-delete-"),
  )) {
    expect(child.screenX + child.width).toBeLessThanOrEqual(root.screenX + root.width)
  }
}

for (const layout of ["framed", "compact"] as const) {
  test(`request columns align saved and draft rows through resize in ${layout} layout`, async () => {
    updateUiSettings({ layout })
    tui = await testRender(
      <HttpClient
        active
        initialUrlRequest={{ id: 1, url: "https://example.test/users?limit=10&name=sample" }}
      />,
      { width: 100, height: 48 },
    )
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await click("http-key-value-enter-http-scratch-1-query")
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id ===
        "http-key-value-section-http-scratch-1-query",
    )
    for (const width of [100, 52, 160]) {
      await act(async () => tui?.resize(width, 48))
      await settle(() => node("http-key-value-name-heading-http-scratch-1-query").width > 0)
      checkColumns("http-scratch-1-query")
    }
    await key("RETURN")
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id ===
        "http-key-value-name-http-scratch-1-url-query-0",
    )
    const input = node("http-key-value-name-http-scratch-1-url-query-0") as InputRenderable
    await act(async () => tui?.mockInput.typeText("x"))
    const value = input.value
    await act(async () => tui?.resize(52, 48))
    await settle(() => input.width > 0)
    expect(node(input.id)).toBe(input)
    expect(input.value).toBe(value)
    expect(tui.renderer.currentFocusedRenderable).toBe(input)
  })
}

test("table navigation reveals the selected row and draft in a short request pane", async () => {
  const query = Array.from({ length: 18 }, (_, i) => `field${i}=value${i}`).join("&")
  tui = await testRender(
    <HttpClient active initialUrlRequest={{ id: 2, url: `https://example.test/users?${query}` }} />,
    { width: 120, height: 30 },
  )
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await click("http-key-value-enter-http-scratch-1-query")
  await settle(
    () =>
      tui?.renderer.currentFocusedRenderable?.id === "http-key-value-section-http-scratch-1-query",
  )
  const scroll = node("http-key-value-scroll-http-scratch-1-query") as ScrollBoxRenderable
  for (let i = 1; i <= 18; i++) {
    await key("ARROW_DOWN")
    const inputs = descendants(node("http-key-value-section-http-scratch-1-query")).filter(
      (child) => child.id.startsWith("http-key-value-name-") && !child.id.includes("heading"),
    )
    const selected = inputs[i]
    expect(selected).toBeDefined()
    await settle(() =>
      Boolean(
        selected &&
          selected.screenY >= scroll.viewport.screenY &&
          selected.screenY < scroll.viewport.screenY + scroll.viewport.height,
      ),
    )
  }
  await key("RETURN")
  await settle(() =>
    (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
      "http-key-value-name-http-scratch-1-query-",
    ),
  )
  await act(async () => tui?.mockInput.typeText("newField"))
  await key("TAB")
  await settle(() =>
    (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-value-"),
  )
  await act(async () => tui?.mockInput.typeText("created"))
  await settle(
    () => (tui?.renderer.currentFocusedRenderable as InputRenderable)?.value === "created",
  )
  const valueId = tui.renderer.currentFocusedRenderable?.id ?? ""
  await click("http-request-view-headers")
  await click("http-request-view-params")
  expect((node(valueId) as InputRenderable).value).toBe("created")
  expect(
    (node(valueId.replace("http-key-value-value-", "http-key-value-name-")) as InputRenderable)
      .value,
  ).toBe("newField")
})

test.each(["form", "multipart"])(
  "%s keeps type, name, value and actions aligned while adding rows",
  async (kind) => {
    tui = await testRender(<HttpClient active />, { width: 100, height: 48 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await click("http-request-view-body")
    await click(`http-body-kind-${kind}`)
    await click(`http-key-value-enter-http-scratch-1-${kind}`)
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-name-"),
    )
    await act(async () => tui?.mockInput.typeText("attachment"))
    await settle(
      () => (tui?.renderer.currentFocusedRenderable as InputRenderable)?.value === "attachment",
    )
    await key("TAB")
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-value-"),
    )
    await act(async () => tui?.mockInput.typeText("sample.txt"))
    await settle(
      () => (tui?.renderer.currentFocusedRenderable as InputRenderable)?.value === "sample.txt",
    )
    await key("ESCAPE")
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id ===
        `http-key-value-section-http-scratch-1-${kind}`,
    )
    for (const width of [100, 52, 160]) {
      await act(async () => tui?.resize(width, 48))
      await settle(() => node(`http-key-value-name-heading-http-scratch-1-${kind}`).width > 1)
      checkColumns(`http-scratch-1-${kind}`)
    }
    await key(" ")
    await settle(() => tui?.captureCharFrame().includes("0/1") ?? false)
    if (kind === "multipart") {
      expect(tui?.captureCharFrame()).toContain(" Text ")
      await key("f")
      await settle(() => tui?.captureCharFrame().includes(" File ") ?? false)
      checkColumns(`http-scratch-1-${kind}`)
    }
  },
)
