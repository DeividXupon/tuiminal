import { translateUi } from "../../packages/core/src/i18n/index"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import {
  getDefaultShortcuts,
  setToolShortcuts,
  validateShortcuts,
} from "../../packages/core/src/keyboard/bindings"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  setToolShortcuts("global", getDefaultShortcuts("global"))
})

test("global settings rebinding updates hints and respects modal ownership", async () => {
  setToolShortcuts(
    "global",
    validateShortcuts("global", { workspace: { settings: "F6", quit: null, escape: null } }),
  )
  tui = await testRender(<App />, { width: 120, height: 36 })
  await act(async () => {
    await Bun.sleep(80)
    await tui?.renderOnce()
  })
  expect(tui.captureCharFrame()).toContain("[F6]")
  expect(tui.captureCharFrame()).not.toContain("[Q]")
  expect(tui.captureCharFrame()).toContain(translateUi("Sair"))
  await act(async () => {
    tui?.mockInput.pressKey(",")
    await Bun.sleep(20)
  })
  await tui.renderOnce()
  expect(tui.renderer.root.findDescendantById("configuration-modal")).toBeUndefined()
  await act(async () => {
    tui?.mockInput.pressKey("F6")
    await Bun.sleep(20)
  })
  await tui.waitForFrame(() =>
    Boolean(tui?.renderer.root.findDescendantById("configuration-modal")),
  )
  // Disabling application Escape must not disable the settings dialog's own Escape.
  await act(async () => {
    tui?.mockInput.pressKey("ESCAPE")
    await Bun.sleep(20)
  })
  await tui.renderOnce()
  expect(tui.renderer.root.findDescendantById("configuration-modal")).toBeUndefined()
  expect(tui.renderer.root.findDescendantById("tutorial-app-header")).toBeDefined()
})
