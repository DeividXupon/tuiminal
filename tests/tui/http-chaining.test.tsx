import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, setDefaultTimeout, test } from "bun:test"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { HttpRequestChainingEditor } from "../../packages/feature-http/src/ui/HttpRequestChainingEditor"
import { createScratchRequest } from "../../packages/feature-http/src/model/workspace"
import { httpChainingRequests } from "../../packages/feature-http/src/model/chaining"
import { responseTableFixture } from "../fixtures/http-response-table"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import type { HttpRequestDefinition } from "../../packages/feature-http/src/model/types"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const selector = "http-chaining-selection-current"
const nameId = "http-automation-extraction-name-current-0"
const pathId = "http-automation-extraction-path-current-0"
let latest: HttpRequestDefinition
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
  throw new Error(
    `Focus: ${tui?.renderer.currentFocusedRenderable?.id}\n${tui?.captureCharFrame()}`,
  )
}
function node(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}\n${tui?.captureCharFrame()}`)
  return target
}
async function key(name: string, options: { ctrl?: boolean; shift?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, options)
    await Bun.sleep(name === "ESCAPE" ? 70 : 10)
  })
  await act(async () => tui?.renderOnce())
}
async function text(value: string) {
  await act(async () => tui?.mockInput.typeText(value))
}
async function replace(value: string) {
  await key("HOME")
  await key("END", { shift: true })
  await key("BACKSPACE")
  await text(value)
}
async function click(id: string) {
  const target = node(id)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY)
  })
  await act(async () => tui?.renderOnce())
}
async function mount(width = 80, height = 24, cycle = false) {
  const login = { ...createScratchRequest("login"), name: "Login" }
  const otherLogin = { ...createScratchRequest("other-login"), name: "Login" }
  if (cycle) login.chain = { dependsOn: "current", extract: [] }
  const document = responseTableFixture()
  if (document.execution.status !== "success") throw new Error("Missing response fixture")
  const response = {
    ...document.execution.response,
    headers: [
      ...document.execution.response.headers,
      ["Location", "/users/42"] as [string, string],
    ],
    body: new TextEncoder().encode('{"token":"fixture-token","id":42}'),
  }
  function Editor() {
    const [request, setRequest] = useState({ ...createScratchRequest("current"), name: "User" })
    latest = request
    return (
      <HttpRequestChainingEditor
        request={request}
        requests={httpChainingRequests([], [login, otherLogin, request])}
        response={response}
        focused
        keyRef={{ current: null }}
        onFocus={() => {}}
        onChange={(chain) => setRequest((current) => ({ ...current, chain }))}
      />
    )
  }
  tui = await testRender(<Editor />, { width, height })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === selector)
}

test.each(["framed", "compact"] as const)(
  "guided chaining searches dependencies and restores focus in %s",
  async (layout) => {
    updateUiSettings({ layout })
    await mount()
    await key("RETURN")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-chain-picker-search")
    await text("Login")
    await key("ARROW_DOWN")
    await key("ARROW_DOWN")
    await key("RETURN")
    await settle(() => !tui?.renderer.root.findDescendantById("http-chain-picker-modal"))
    expect(latest.chain?.dependsOn).toBe("other-login")
    expect(tui?.renderer.currentFocusedRenderable?.id).toBe(selector)
    expect(tui?.captureCharFrame()).toContain("GET Login → GET User")
    await key("RETURN")
    await key("ESCAPE")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === selector)
    expect(latest.chain?.dependsOn).toBe("other-login")
    await key("RETURN")
    await key("RETURN")
    await settle(() => !tui?.renderer.root.findDescendantById("http-chain-picker-modal"))
    expect(latest.chain?.dependsOn).toBeUndefined()
  },
)

test("guided chaining owns empty N, field navigation, source/secret/enable actions and deletion", async () => {
  await mount()
  await key("n")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === nameId)
  expect((node(nameId) as InputRenderable).value).toBe("value_1")
  await replace("token")
  await key("TAB")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === pathId)
  await replace("$.token")
  await key("ESCAPE")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === selector)
  expect(tui?.captureCharFrame()).toContain("{{token}} → fixture-token")
  await key("l") // source
  await key("l") // privacy
  await key("RETURN")
  expect(latest.chain?.extract[0]?.secret).toBe(true)
  expect(tui?.captureCharFrame()).not.toContain("fixture-token")
  await key("h")
  await key("RETURN") // JSONPath -> header
  expect(latest.chain?.extract[0]?.source).toBe("header")
  expect(latest.chain?.extract[0]?.jsonPath).toBe("Location")
  await key("RETURN") // header -> status
  expect(latest.chain?.extract[0]?.source).toBe("status")
  await key("l")
  await key("l")
  await key("RETURN")
  expect(latest.chain?.extract[0]?.enabled).toBe(false)
  await key("d", { ctrl: true })
  expect(latest.chain?.extract).toHaveLength(0)
  await key("n")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === nameId)
  expect(latest.chain?.extract).toHaveLength(1)
})

test("chaining keeps field geometry and drafts through resizing and scrolls to new rows", async () => {
  await mount(80, 24)
  for (let index = 0; index < 5; index++) {
    await key("n")
    await key("ESCAPE")
  }
  const inputId = "http-automation-extraction-name-current-4"
  const input = node(inputId) as InputRenderable
  await key("RETURN")
  await settle(() => tui?.renderer.currentFocusedRenderable === input)
  for (const [width, height] of [
    [52, 18],
    [120, 28],
    [80, 24],
  ] as const) {
    await act(async () => tui?.resize(width, height))
    await settle(() => {
      const view = (node("http-automation-form-chaining-current") as ScrollBoxRenderable).viewport
      return input.screenY >= view.screenY && input.screenY < view.screenY + view.height
    })
    const view = (node("http-automation-form-chaining-current") as ScrollBoxRenderable).viewport
    const footer = node("http-chain-footer-current")
    expect(input.screenX + input.width).toBeLessThanOrEqual(view.screenX + view.width)
    expect(footer.screenY + footer.height).toBe(height)
    expect(tui?.renderer.currentFocusedRenderable).toBe(input)
    expect(input.value).toBe("value_5")
  }
  await key("ESCAPE")
  await click("http-extraction-source-current-4")
  expect(latest.chain?.extract[4]?.source).toBe("header")
})

test("the workspace routes Chaining keyboard actions and its picker owns Escape", async () => {
  tui = await testRender(
    <HttpClient active initialUrlRequest={{ id: 1, url: "https://api.example.test/users" }} />,
    { width: 100, height: 38 },
  )
  await openLocalHttp(tui)
  const selectionId = "http-chaining-selection-http-scratch-1"
  const inputId = "http-automation-extraction-name-http-scratch-1-0"
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("a")
  await settle(
    () => !!tui?.renderer.root.findDescendantById("http-request-options-options-http-scratch-1"),
  )
  await key("v")
  await settle(
    () => tui?.renderer.currentFocusedRenderable?.id === "http-assertions-selection-http-scratch-1",
  )
  await key("v")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === selectionId)
  await key("n")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === inputId)
  expect(
    tui?.renderer.root.findDescendantById("http-extraction-row-http-scratch-1-1"),
  ).toBeUndefined()
  await replace("value_jk")
  await key("ESCAPE")
  await key("k")
  await key("RETURN")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-chain-picker-search")
  await text("njk")
  expect((node("http-chain-picker-search") as InputRenderable).value).toBe("njk")
  expect(
    tui?.renderer.root.findDescendantById("http-extraction-row-http-scratch-1-1"),
  ).toBeUndefined()
  await key("ESCAPE")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === selectionId)
  await key("j")
  await key("RETURN")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === inputId)
  expect((node(inputId) as InputRenderable).value).toBe("value_jk")
})

test("dependency picker rejects cycles and mouse search restores text input", async () => {
  await mount(80, 24, true)
  await key("RETURN")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-chain-picker-search")
  await key("TAB")
  await key("j")
  await key("RETURN")
  expect(tui?.captureCharFrame()).toContain("Ciclo de dependência")
  expect(latest.chain?.dependsOn).toBeUndefined()
  expect(node("http-chain-picker-modal")).toBeDefined()
  await click("http-chain-picker-search")
  await text("jk")
  expect((node("http-chain-picker-search") as InputRenderable).value).toBe("jk")
  await key("ESCAPE")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === selector)
})
