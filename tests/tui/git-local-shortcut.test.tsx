import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { useKeyboard } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { useLocalConfigurationShortcut } from "../../src/features/git/hooks/use-local-configuration-shortcut"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

async function mount({
  active = true,
  enabled = true,
  consume = false,
  focusId = "git-base-diff",
} = {}) {
  let opened = 0
  function Harness() {
    useKeyboard((key) => {
      if (consume) key.preventDefault()
    })
    useLocalConfigurationShortcut(active, enabled ? () => (opened += 1) : undefined)
    return <box id={focusId} focusable height={1} />
  }
  tui = await testRender(<Harness />, { width: 80, height: 20, kittyKeyboard: true })
  act(() => tui?.renderer.root.findDescendantById(focusId)?.focus())
  await tui.renderOnce()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe(focusId)
  return () => opened
}

async function press(
  options: { ctrl?: boolean; shift?: boolean; meta?: boolean } = { ctrl: true },
) {
  act(() => tui?.mockInput.pressKey("p", options))
  await tui?.renderOnce()
}

test.each(["git-base-diff", "git-file-list-row-0", "git-compare-project"])(
  "local configuration opens from the %s workspace focus",
  async (focusId) => {
    const opened = await mount({ focusId })
    await press()
    expect(opened()).toBe(1)
  },
)

test.each([
  "git-command-input",
  "git-discard-changes-modal",
  "git-configuration-modal",
  "git-local-target-search",
  "git-compare-branch-list",
  "git-pr-section-editor-query",
  "git-gh-guidance-terminal",
  "git-partial-stage-available",
  "git-partial-stage-selected",
])("local configuration does not escape the %s owner", async (focusId) => {
  const opened = await mount({ focusId })
  await press()
  expect(opened()).toBe(0)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(focusId)
})

test.each([{ active: false }, { enabled: false }, { consume: true }])(
  "local configuration respects availability and earlier event consumption: %j",
  async (options) => {
    const opened = await mount(options)
    await press()
    expect(opened()).toBe(0)
  },
)

test("local configuration accepts only the exact non-repeated Ctrl+P shortcut", async () => {
  const opened = await mount()
  await press({})
  await press({ ctrl: true, shift: true })
  await press({ ctrl: true, meta: true })
  act(() => tui?.mockInput.pressKey("\x1b[112;5:2u"))
  await tui?.renderOnce()
  expect(opened()).toBe(0)
  await press()
  expect(opened()).toBe(1)
})
