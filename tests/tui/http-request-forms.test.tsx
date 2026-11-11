import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { writeFileSync } from "node:fs"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
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
async function mount(width = 100, height = 38) {
  tui = await testRender(
    <HttpClient active initialUrlRequest={{ id: 1, url: "https://api.example.test/users" }} />,
    { width, height },
  )
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
}
function withinForm(id: string, form: string) {
  const input = node(id)
  const viewport = (node(`http-automation-form-${form}-http-scratch-1`) as ScrollBoxRenderable)
    .viewport
  expect(input.screenX).toBeGreaterThanOrEqual(viewport.screenX)
  expect(input.screenX + input.width).toBeLessThanOrEqual(viewport.screenX + viewport.width)
  expect(input.screenY).toBeGreaterThanOrEqual(viewport.screenY)
  expect(input.screenY + input.height).toBeLessThanOrEqual(viewport.screenY + viewport.height)
  expect(input.width).toBeGreaterThan(form === "options" ? 5 : 15)
}

for (const layout of ["framed", "compact"] as const) {
  test(`auth fields preserve values and focus through Tab and resize in ${layout}`, async () => {
    updateUiSettings({ layout })
    await mount()
    await click("http-request-view-auth")
    await click("http-auth-kind-basic")
    const username = "http-auth-username-http-scratch-1"
    const password = "http-auth-password-http-scratch-1"
    await key("RETURN")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === username)
    await type("fixture-user")
    await key("TAB")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === password)
    await type("fixture-password")
    const input = node(password) as InputRenderable
    expect(input.value).toBe("fixture-password")
    expect(tui?.captureCharFrame()).not.toContain("fixture-password")
    for (const [width, height] of [
      [52, 30],
      [160, 28],
      [100, 38],
    ] as const) {
      await act(async () => tui?.resize(width, height))
      await settle(() => {
        const view = (node("http-automation-form-auth-http-scratch-1") as ScrollBoxRenderable)
          .viewport
        return (
          input.width > 15 &&
          input.screenY >= view.screenY &&
          input.screenY < view.screenY + view.height
        )
      })
      withinForm(password, "auth")
      expect(node(password)).toBe(input)
      expect(tui?.renderer.currentFocusedRenderable).toBe(input)
      expect(input.value).toBe("fixture-password")
      writeFileSync(`/tmp/http-auth-${layout}-${width}.txt`, tui?.captureCharFrame() ?? "")
    }
    await key("TAB", { shift: true })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === username)
    expect((node(username) as InputRenderable).value).toBe("fixture-user")
    await click("http-auth-kind-basic")
    expect((node(password) as InputRenderable).value).toBe("fixture-password")
    await key("ESCAPE")
    await click("http-request-view-params")
    await click("http-request-view-auth")
    expect((node(password) as InputRenderable).value).toBe("fixture-password")
  })
}

test("API key placement and bearer credentials remain editable without clearing on reselection", async () => {
  await mount(52, 44)
  await click("http-request-view-auth")
  await click("http-auth-kind-bearer")
  await click("http-auth-token-http-scratch-1")
  await type("fixture-bearer")
  await click("http-auth-kind-bearer")
  expect((node("http-auth-token-http-scratch-1") as InputRenderable).value).toBe("fixture-bearer")
  expect(tui?.captureCharFrame()).not.toContain("fixture-bearer")
  await click("http-auth-kind-api-key")
  await click("http-auth-key-name-http-scratch-1")
  await key("HOME")
  await key("END", { shift: true })
  await key("BACKSPACE")
  await type("X-Demo-Key")
  await key("TAB")
  await settle(
    () => tui?.renderer.currentFocusedRenderable?.id === "http-auth-key-value-http-scratch-1",
  )
  await type("fixture-api-value")
  await click("http-auth-placement-query")
  await click("http-request-view-more")
  await click("http-request-more-preview")
  await settle(() => tui?.captureCharFrame().includes("REQUISIÇÃO PREPARADA") ?? false)
  const preview = tui?.captureCharFrame().replace(/[\s│█]/g, "") ?? ""
  expect(preview).toContain("?X-Demo-Key=")
  expect(preview).not.toContain("fixture-api-value")
  // Returning to the editor preserves the unsent credential draft.
  await click("http-request-view-auth")
  expect((node("http-auth-key-name-http-scratch-1") as InputRenderable).value).toContain(
    "X-Demo-Key",
  )
  expect((node("http-auth-key-value-http-scratch-1") as InputRenderable).value).toBe(
    "fixture-api-value",
  )
})

test("More fields scroll into view and retain edits while Tab navigates the form", async () => {
  await mount(100, 28)
  await click("http-request-view-more")
  await key("RETURN")
  for (let index = 0; index < 5; index++) await key("j")
  await key("RETURN")
  await settle(
    () => tui?.renderer.currentFocusedRenderable?.id === "http-request-proxy-http-scratch-1",
  )
  await type("http://proxy.example:8080")
  await key("TAB")
  const name = "http-request-name-http-scratch-1"
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === name)
  withinForm(name, "options")
  await type("-renamed")
  await key("TAB")
  const method = "http-custom-method-http-scratch-1"
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === method)
  withinForm(method, "options")
  await key("TAB")
  await settle(
    () => tui?.renderer.currentFocusedRenderable?.id === "http-request-proxy-http-scratch-1",
  )
  withinForm("http-request-proxy-http-scratch-1", "options")
  expect((node(name) as InputRenderable).value).toContain("-renamed")
  expect((node("http-request-proxy-http-scratch-1") as InputRenderable).value).toBe(
    "http://proxy.example:8080",
  )
})

test("Assertions and Chaining focus new rows and retain full-width editable fields", async () => {
  await mount(52, 36)
  await click("http-request-view-more")
  await click("http-request-more-assertions")
  await click("http-assertion-add")
  await settle(
    () =>
      tui?.renderer.currentFocusedRenderable?.id.startsWith("http-automation-assertion-") ?? false,
  )
  const assertion = tui?.renderer.currentFocusedRenderable as InputRenderable
  await type("status == 201")
  withinForm(assertion.id, "assertions")
  await key("ESCAPE")
  await key("n")
  await settle(
    () =>
      (tui?.renderer.currentFocusedRenderable?.id.startsWith("http-automation-assertion-") ??
        false) &&
      tui?.renderer.currentFocusedRenderable !== assertion,
  )
  const second = tui?.renderer.currentFocusedRenderable as InputRenderable
  withinForm(second.id, "assertions")
  await key("d", { ctrl: true })
  await settle(() => !tui?.renderer.root.findDescendantById(second.id))
  expect((node(assertion.id) as InputRenderable).value).toContain("status == 201")
  await key("ESCAPE")
  await click("http-request-more-chaining")
  await click("http-extraction-add")
  const name = "http-automation-extraction-name-http-scratch-1-0"
  const path = "http-automation-extraction-path-http-scratch-1-0"
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === name)
  await type("sessionToken")
  await key("TAB")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === path)
  withinForm(path, "chaining")
  writeFileSync("/tmp/http-chaining-52.txt", tui?.captureCharFrame() ?? "")
  await type(".value")
  await key("ESCAPE")
  await click("http-request-more-options")
  await click("http-request-more-chaining")
  expect((node(name) as InputRenderable).value).toContain("sessionToken")
  expect((node(path) as InputRenderable).value).toContain(".value")
})
