import "./setup"
import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import {
  savePostmanAccount,
  removePostmanAccount,
} from "../../packages/feature-http/src/postman/account"
import { collectionSettingsFixture } from "../fixtures/postman-collection-settings"

let tui: Awaited<ReturnType<typeof testRender>> | undefined
const originalFetch = globalThis.fetch
let fake = collectionSettingsFixture()
afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  globalThis.fetch = originalFetch
  await removePostmanAccount()
})
function node(id: string) {
  return (
    tui?.renderer.root
      .findDescendantById("http-collection-settings-pane")
      ?.findDescendantById(id) ?? tui?.renderer.root.findDescendantById(id)
  )
}
async function settle(check: () => boolean) {
  for (let i = 0; i < 150; i++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
async function click(id: string) {
  await settle(() => Boolean(node(id)?.width && node(id)?.height))
  await tui?.renderOnce()
  const control = node(id)!
  await act(async () => {
    await tui?.mockMouse.click(control.screenX + Math.floor(control.width / 2), control.screenY)
    await tui?.renderOnce()
  })
}
async function key(key: string, ctrl = false) {
  await act(async () => {
    tui?.mockInput.pressKey(key, { ctrl })
    await Bun.sleep(key === "ESCAPE" ? 70 : 10)
    await tui?.renderOnce()
  })
}
async function mount(width = 160) {
  fake = collectionSettingsFixture()
  globalThis.fetch = fake.fetch
  await savePostmanAccount({ apiKey: "PMAK-settings-fixture", region: "us" })
  tui = await testRender(
    <NotificationProvider>
      <HttpClient active />
    </NotificationProvider>,
    { width, height: 42, kittyKeyboard: true },
  )
  await click("http-source-postman-card")
  await settle(() => Boolean(node(`http-collection-file-${fake.path}`)))
}
async function settings(kind: "file" | "folder", folderId = "") {
  const rowId =
    kind === "file"
      ? `http-collection-file-${fake.path}`
      : `http-collection-folder-${fake.path}:${folderId}`
  await click(rowId)
  await key("a")
  await click("http-collection-menu-settings")
  await settle(
    () => Boolean(node("http-collection-settings-pane")) && !node("http-collection-settings-retry"),
  )
  await settle(() =>
    Boolean(
      node("http-collection-settings-pane")?.findDescendantById("http-auth-kind-bearer")?.width,
    ),
  )
}

test("collection Settings replaces request/response, saves all tabs and preserves a request draft", async () => {
  await mount()
  await click(`http-collection-file-${fake.path}`)
  await click(`http-collection-folder-${fake.path}:folder-1`)
  await click(`http-collection-folder-${fake.path}:folder-2`)
  const requestId = `${fake.path}#request-1`
  await click(`http-navigation-project-${requestId}`)
  await settle(() => Boolean(node("http-url-input")?.width))
  await click("http-url-input")
  await act(async () => tui?.mockInput.typeText("/draft"))
  const url = (node("http-url-input") as InputRenderable).value
  await settings("file")
  expect(node("http-collection-settings-tab-variables")).toBeDefined()
  expect(node("http-url-input")).toBeUndefined()
  expect(node(`http-request-pane-${requestId}`)?.visible).toBe(false)
  expect(node(`http-response-pane-${requestId}`)?.visible).toBe(false)
  const pane = node("http-collection-settings-pane")!
  expect(pane.width).toBeGreaterThan(80)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-settings-pane")
  await click("http-auth-kind-none")
  await settle(() => tui!.captureCharFrame().includes("SEM AUTENTICAÇÃO"))
  await click("http-collection-settings-tab-scripts")
  const settingsId = `collection-settings:settings-w1:file:${fake.path}`
  const editorId = `http-script-editor-preRequest-${settingsId}`
  await click(editorId)
  await act(async () => {
    ;(node(editorId) as TextareaRenderable).setText("// Collection settings script")
  })
  await click("http-collection-settings-tab-variables")
  await click("http-collection-variable-value-0")
  await act(async () => {
    const input = node("http-collection-variable-value-0") as InputRenderable
    input.value = ""
    tui?.mockInput.typeText("synthetic-edit")
  })
  fake.controls.failWrite = true
  await key("s", true)
  await settle(() => Boolean(node("http-collection-settings-error")))
  expect((node("http-collection-variable-value-0") as InputRenderable).value).toBe("synthetic-edit")
  fake.controls.failWrite = false
  await click("http-collection-settings-save")
  await settle(() => fake.writes.length === 2 && !node("http-collection-settings-error"))
  expect(fake.remote().auth).toEqual({ type: "noauth" })
  expect(fake.remote().variable).toMatchObject([{ value: "synthetic-edit" }])
  expect(JSON.stringify(fake.remote().event)).toContain("Collection settings script")
  await click(`http-document-${requestId}`)
  await settle(() => Boolean(node("http-url-input")))
  expect((node("http-url-input") as InputRenderable).value).toBe(url)
})

test("folder double click opens only Authorization/Scripts, inherit saves and dirty close requires discard", async () => {
  await mount()
  await click(`http-collection-file-${fake.path}`)
  const folder = `http-collection-folder-${fake.path}:folder-1`
  await click(folder)
  await click(folder)
  await settle(() => Boolean(node("http-collection-settings-pane")))
  await settle(() => Boolean(node("http-auth-kind-inherit")))
  expect(node("http-collection-settings-tab-variables")).toBeUndefined()
  await click("http-auth-kind-inherit")
  await key("s", true)
  await settle(() => fake.writes.length === 1)
  expect((fake.remote().item as Array<Record<string, unknown>>)[0]?.auth).toBeNull()
  await click("http-auth-kind-bearer")
  await key("w", true)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-discard-document-modal")
  await key("ESCAPE")
  await settle(() => !node("http-discard-document-modal"))
  expect(node("http-collection-settings-pane")).toBeDefined()
  await key("w", true)
  await click("http-discard-document-confirm")
  await settle(() => !node("http-collection-settings-pane"))
  expect(fake.writes).toHaveLength(1)
})

test("failed settings read offers retry and never exposes an empty editable draft", async () => {
  await mount()
  fake.controls.failRead = true
  await click(`http-collection-file-${fake.path}`)
  await key("a")
  await click("http-collection-menu-settings")
  await settle(() => Boolean(node("http-collection-settings-retry")))
  expect(node("http-auth-kind-bearer")).toBeUndefined()
  fake.controls.failRead = false
  await click("http-collection-settings-retry")
  await settle(() =>
    Boolean(
      node("http-collection-settings-pane")?.findDescendantById("http-auth-kind-bearer")?.width,
    ),
  )
  expect(node("http-collection-settings-error")).toBeUndefined()
})

test("settings support keyboard tabs and variable cells in a narrow viewport", async () => {
  await mount(72)
  await settings("file")
  await key("f")
  await settle(() => Boolean(node("http-script-tab-preRequest")))
  await key("f")
  await settle(() => Boolean(node("http-collection-variable-add")))
  await key("n")
  await settle(() =>
    Boolean(
      tui?.renderer.currentFocusedRenderable?.id.startsWith("http-collection-variable-name-"),
    ),
  )
  await act(async () => tui?.mockInput.typeText("key"))
  await key("TAB")
  expect(tui?.renderer.currentFocusedRenderable?.id).toContain("http-collection-variable-value-")
  await act(async () => tui?.mockInput.typeText("value"))
  await key("s", true)
  await settle(() => fake.writes.length === 1)
  expect(fake.remote().variable).toMatchObject([{ key: "token" }, { key: "key", value: "value" }])
  expect(node("http-collection-settings-pane")?.width).toBeLessThanOrEqual(72)
})
