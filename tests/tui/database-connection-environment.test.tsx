import "./setup"
import { afterEach, expect, test } from "bun:test"
import { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { DatabaseConnectionModal } from "../../packages/feature-database/src/ui/DatabaseConnectionModal"

let tui: TestRendererSetup | undefined
const variables = ["TUIMINAL_FIXTURE_DB_HOST", "TUIMINAL_FIXTURE_DB_PORT"]
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const name of variables) delete process.env[name]
})

async function mount(height = 40) {
  process.env.TUIMINAL_FIXTURE_DB_HOST = "fictional-hidden-value"
  process.env.TUIMINAL_FIXTURE_DB_PORT = "5432"
  tui = await testRender(
    <DatabaseConnectionModal
      open
      connections={[]}
      selectedConnectionId={null}
      startInForm
      onClose={() => undefined}
      onSelect={() => undefined}
      onCreated={() => undefined}
      onDeleted={() => undefined}
    />,
    { width: 100, height },
  )
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (tui.renderer.currentFocusedRenderable?.id === "db-connection-name") break
  }
}

function input(id: string) {
  const field = tui?.renderer.root.findDescendantById(`db-connection-${id}`)
  if (!(field instanceof InputRenderable)) throw new Error(`Missing ${id}`)
  act(() => {
    field.value = ""
    field.focus()
  })
  return field
}

test("connection autocomplete accepts with Tab, navigates suggestions and hides environment values", async () => {
  await mount()
  const host = input("host")
  await act(async () => tui?.mockInput.typeText("{TUIMINAL_FIXTURE_DB_"))
  await currentTui().renderOnce()
  expect(currentTui().captureCharFrame()).toContain("{TUIMINAL_FIXTURE_DB_HOST}")
  expect(currentTui().captureCharFrame()).not.toContain("fictional-hidden-value")
  await act(async () => tui?.mockInput.pressArrow("down"))
  await act(async () => tui?.mockInput.pressKey("TAB"))
  expect(host.value).toBe("{TUIMINAL_FIXTURE_DB_PORT}")
  expect(currentTui().renderer.currentFocusedRenderable?.id).toBe(host.id)
  await act(async () => tui?.mockInput.pressKey("TAB"))
  expect(currentTui().renderer.currentFocusedRenderable?.id).toBe("db-connection-port")
})

test.each(["port", "password"])(
  "%s supports references and Enter accepts without submitting",
  async (field) => {
    await mount()
    const target = input(field)
    await act(async () => tui?.mockInput.typeText("{TUIMINAL_FIXTURE_DB_P"))
    await act(async () => tui?.mockInput.pressKey("RETURN"))
    await currentTui().renderOnce()
    expect(target.value).toBe("{TUIMINAL_FIXTURE_DB_PORT}")
    expect(currentTui().renderer.currentFocusedRenderable?.id).toBe(target.id)
    expect(currentTui().captureCharFrame()).not.toContain("fictional-hidden-value")
    if (field === "password")
      expect(currentTui().captureCharFrame()).not.toContain("{TUIMINAL_FIXTURE_DB_PORT}")
  },
)

test("Escape dismisses suggestions before leaving the input", async () => {
  await mount()
  const host = input("host")
  await act(async () => tui?.mockInput.typeText("{TUIMINAL_FIXTURE_DB_"))
  await act(async () => tui?.mockInput.pressEscape())
  await waitUntil(() => !currentTui().captureCharFrame().includes("{TUIMINAL_FIXTURE_DB_HOST}"))
  expect(host.focused).toBe(true)
  expect(currentTui().captureCharFrame()).not.toContain("{TUIMINAL_FIXTURE_DB_HOST}")
  await act(async () => tui?.mockInput.pressEscape())
  await waitUntil(() => !host.focused)
  expect(host.focused).toBe(false)
})

test("password suggestions stay visible in a short terminal and accept mouse selection", async () => {
  await mount(24)
  const password = input("password")
  await act(async () => tui?.mockInput.typeText("{TUIMINAL_FIXTURE_DB_"))
  await waitUntil(() => currentTui().captureCharFrame().includes("{TUIMINAL_FIXTURE_DB_HOST}"))
  const suggestion = currentTui().renderer.root.findDescendantById(
    "db-connection-password-environment-0",
  )
  if (!suggestion) throw new Error("Missing suggestion")
  expect(suggestion.screenY).toBeLessThan(24)
  await act(async () => tui?.mockMouse.click(suggestion.screenX + 2, suggestion.screenY))
  expect(password.value).toBe("{TUIMINAL_FIXTURE_DB_HOST}")
  expect(password.focused).toBe(true)
  await currentTui().renderOnce()
  expect(currentTui().captureCharFrame()).not.toContain("fictional-hidden-value")
})

test("completing a reference inside text preserves its suffix", async () => {
  await mount()
  const host = input("host")
  await act(async () => tui?.mockInput.typeText("prefix/{}:5432"))
  act(() => {
    host.cursorOffset = 8
  })
  await act(async () => tui?.mockInput.typeText("TUIMINAL_FIXTURE_DB_H"))
  await act(async () => tui?.mockInput.pressTab())
  expect(host.value).toBe("prefix/{TUIMINAL_FIXTURE_DB_HOST}:5432")
})

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => Bun.sleep(10))
    await currentTui().renderOnce()
    if (predicate()) return
  }
  expect(predicate()).toBe(true)
}

function currentTui() {
  if (!tui) throw new Error("Missing renderer")
  return tui
}
