import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, setDefaultTimeout, test } from "bun:test"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { AssertionsEditor } from "../../packages/feature-http/src/ui/HttpAssertionsEditor"
import type { HttpAssertionDefinition } from "../../packages/feature-http/src/model/types"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const selectionId = "http-assertions-selection-http-scratch-1"
const footerId = "http-assertions-footer-http-scratch-1"
const formId = "http-automation-form-assertions-http-scratch-1"
setDefaultTimeout(20_000)

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
function node(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  return target
}
async function click(id: string) {
  const target = node(id)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY)
    await tui?.renderOnce()
  })
}
async function key(name: string, modifiers: { shift?: boolean; ctrl?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, modifiers)
    await Bun.sleep(name === "ESCAPE" ? 70 : 10)
    await tui?.renderOnce()
  })
}
async function type(value: string) {
  await act(async () => tui?.mockInput.typeText(value))
}
function fieldId(input: InputRenderable) {
  return input.id.replace("http-automation-assertion-", "http-assertion-field-")
}
async function selected(input: InputRenderable) {
  await settle(
    () =>
      tui?.renderer.currentFocusedRenderable?.id === selectionId &&
      !!tui?.renderer.root.findDescendantById(`${fieldId(input)}-focus-selection-tint`),
  )
}
async function mount(count: number, width = 100, height = 38) {
  tui = await testRender(
    <HttpClient active initialUrlRequest={{ id: 1, url: "https://api.example.test/users" }} />,
    { width, height },
  )
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await click("http-request-view-more")
  await click("http-request-more-assertions")
  const inputs: InputRenderable[] = []
  for (let index = 0; index < count; index++) {
    await key("n")
    await settle(
      () =>
        (tui?.renderer.currentFocusedRenderable?.id.startsWith("http-automation-assertion-") ??
          false) &&
        !inputs.includes(tui?.renderer.currentFocusedRenderable as InputRenderable),
    )
    const input = tui?.renderer.currentFocusedRenderable as InputRenderable
    inputs.push(input)
    await key("HOME")
    await key("END", { shift: true })
    await key("BACKSPACE")
    await type(`status == ${200 + index}`)
    await key("ESCAPE")
  }
  await click("http-request-more-chaining")
  await click("http-request-more-assertions")
  // Switching nested tabs remounts their controls while preserving expressions.
  return inputs.map((input) => node(input.id) as InputRenderable)
}

test("the empty Assertions selector owns N without a workspace keyboard fallback", async () => {
  function Editor() {
    const [assertions, setAssertions] = useState<HttpAssertionDefinition[]>([])
    return (
      <AssertionsEditor
        requestId="http-scratch-1"
        assertions={assertions}
        focused
        keyRef={{ current: null }}
        onFocus={() => {}}
        onChange={setAssertions}
      />
    )
  }
  tui = await testRender(<Editor />, { width: 80, height: 24 })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === selectionId)
  await key("n")
  await settle(
    () =>
      tui?.renderer.currentFocusedRenderable?.id.startsWith("http-automation-assertion-") ?? false,
  )
  const input = tui?.renderer.currentFocusedRenderable as InputRenderable
  expect(input.value).toBe("status == 200")
  await type("n")
  expect(input.value).toContain("n")
  expect((node(formId) as ScrollBoxRenderable).content.getChildren()).toHaveLength(1)
  await key("ESCAPE")
  await selected(input)
  await key("d", { ctrl: true })
  await settle(() => !tui?.renderer.root.findDescendantById(input.id))
  await key("n")
  await settle(
    () =>
      tui?.renderer.currentFocusedRenderable?.id.startsWith("http-automation-assertion-") ?? false,
  )
  expect((node(formId) as ScrollBoxRenderable).content.getChildren()).toHaveLength(1)
})

test("Assertions adds its first row after navigating to the tab entirely by keyboard", async () => {
  tui = await testRender(
    <HttpClient active initialUrlRequest={{ id: 1, url: "https://api.example.test/users" }} />,
    { width: 100, height: 38 },
  )
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("a")
  await settle(
    () => !!tui?.renderer.root.findDescendantById("http-request-options-options-http-scratch-1"),
  )
  await key("v")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === selectionId)
  await key("n")
  await settle(
    () =>
      tui?.renderer.currentFocusedRenderable?.id.startsWith("http-automation-assertion-") ?? false,
  )
  expect((node(formId) as ScrollBoxRenderable).content.getChildren()).toHaveLength(1)
})

for (const layout of ["framed", "compact"] as const) {
  test(`Assertions enters selection and returns from editing in ${layout}`, async () => {
    updateUiSettings({ layout })
    const [first, second] = (await mount(2)) as [InputRenderable, InputRenderable]
    await selected(first)
    await key("k")
    await selected(first)
    await key("j")
    await selected(second)
    await key("ARROW_DOWN")
    await selected(second)
    await key("ARROW_UP")
    await selected(first)
    await key("RETURN")
    await settle(() => tui?.renderer.currentFocusedRenderable === first)
    await key("END")
    await type("jk")
    expect(first.value).toBe("status == 200jk")
    expect(second.value).toBe("status == 201")
    await key("ESCAPE")
    await selected(first)
    await key("j")
    await key("RETURN")
    await settle(() => tui?.renderer.currentFocusedRenderable === second)
    await key("RETURN")
    await selected(second)
    await key("RETURN")
    await key("TAB")
    await selected(first)
    await key("RETURN")
    await key("TAB", { shift: true })
    await selected(second)
    await key("k")
    await selected(first)
    await click(`${fieldId(first)}-focus-selection`)
    await settle(() => tui?.renderer.currentFocusedRenderable === first)
    await click("http-url-input")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await click(first.id)
    await settle(() => tui?.renderer.currentFocusedRenderable === first)
    await click("http-url-input")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("ESCAPE")
    await selected(first)
    expect(first.value).toBe("status == 200jk")
    await key("v")
    await settle(() => !!tui?.renderer.root.findDescendantById("http-extraction-add"))
  })
}

test("Assertions deletion selects a surviving row and handles the empty list", async () => {
  const [first, second] = (await mount(2)) as [InputRenderable, InputRenderable]
  await selected(first)
  await key("d", { ctrl: true })
  await selected(second)
  expect(tui?.renderer.root.findDescendantById(first.id)).toBeUndefined()
  await key("RETURN")
  await key("d", { ctrl: true })
  await settle(() => !tui?.renderer.root.findDescendantById(second.id))
  expect(tui?.captureCharFrame()).toContain("Nenhuma assertion")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(selectionId)
  await key("j")
  await key("RETURN")
  await click("http-assertion-add")
  await settle(
    () =>
      tui?.renderer.currentFocusedRenderable?.id.startsWith("http-automation-assertion-") ?? false,
  )
  const created = tui?.renderer.currentFocusedRenderable as InputRenderable
  await key("ESCAPE")
  await selected(created)
  await click(created.id.replace("http-automation-assertion-", "http-assertion-delete-"))
  await settle(() => !tui?.renderer.root.findDescendantById(created.id))
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(selectionId)
})

test("Assertions footer stays at the pane bottom while selected rows scroll and resize", async () => {
  const inputs = await mount(7)
  const first = inputs[0] as InputRenderable
  const last = inputs.at(-1) as InputRenderable
  const footerY = node(footerId).screenY
  await selected(first)
  for (let index = 1; index < inputs.length; index++) await key("j")
  await selected(last)
  expect(node(footerId).screenY).toBe(footerY)
  expect((node(formId) as ScrollBoxRenderable).scrollTop).toBeGreaterThan(0)
  for (const [width, height] of [
    [52, 30],
    [160, 28],
    [100, 38],
  ] as const) {
    await act(async () => tui?.resize(width, height))
    await settle(() => {
      const viewport = (node(formId) as ScrollBoxRenderable).viewport
      return last.screenY >= viewport.screenY && last.screenY < viewport.screenY + viewport.height
    })
    const footer = node(footerId)
    const pane = node(selectionId)
    const viewport = (node(formId) as ScrollBoxRenderable).viewport
    expect(footer.screenY + footer.height).toBe(pane.screenY + pane.height)
    expect(viewport.screenY + viewport.height).toBeLessThanOrEqual(footer.screenY)
    expect(last.screenX + last.width).toBeLessThanOrEqual(viewport.screenX + viewport.width)
    expect(tui?.captureCharFrame()).toContain("EXEMPLOS")
    expect(tui?.captureCharFrame().replace(/[\s│]/g, "")).toContain("jsonpath$.idexists")
    await selected(last)
    await key("RETURN")
    await settle(() => tui?.renderer.currentFocusedRenderable === last)
    expect(last.value).toBe("status == 206")
    await key("ESCAPE")
  }
})
