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
const originalOnlyTab = process.env.TUIMINAL_ONLY_TAB
const originalTab = process.env.TUIMINAL_INITIAL_TAB

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  setToolShortcuts("global", getDefaultShortcuts("global"))
  if (originalOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = originalOnlyTab
  if (originalTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = originalTab
})

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (until()) return
  }
  throw new Error(`TUI did not settle: ${tui?.captureCharFrame()}`)
}

async function mount() {
  process.env.TUIMINAL_ONLY_TAB = "runner"
  process.env.TUIMINAL_INITIAL_TAB = "runner"
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))
}

for (const binding of ["F6", "m"]) {
  test(`global settings ${binding} owns the key before Runner actions`, async () => {
    setToolShortcuts("global", validateShortcuts("global", { workspace: { settings: binding } }))
    await mount()
    await act(async () => tui?.mockInput.pressKey(binding))
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("configuration-modal")))
    expect(tui?.renderer.root.findDescendantById("runner-box-selection")).toBeUndefined()
    await act(async () => {
      tui?.mockInput.pressEscape()
      await Bun.sleep(60)
    })
    await tui?.renderOnce()
    expect(tui?.renderer.root.findDescendantById("runner-box-selection")).toBeUndefined()
  })
}
