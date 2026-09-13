import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getUiSettings, updateUiSettings } from "../../src/core/settings/theme"
import { DEMO_INBOX_NOTIFICATIONS } from "../../src/features/git/model/inbox/fixtures"
import { InboxList } from "../../src/features/git/ui/inbox/InboxList"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})

function fixture() {
  updateUiSettings({ language: "pt-BR", palette: "prime" })
  const seed = DEMO_INBOX_NOTIFICATIONS[0]
  if (!seed) throw new Error("Missing Inbox fixture")
  let reads = 0
  const items = Array.from({ length: 100 }, (_, index) => ({
    ...seed,
    id: String(index),
    get title() {
      reads += 1
      return `Entry ${index}`
    },
  }))
  type State = { index: number; width: number; saved: Set<string>; pulse: number }
  let update: ((change: (current: State) => State) => void) | undefined
  function Harness() {
    const [state, setState] = useState<State>({ index: 0, width: 130, saved: new Set(), pulse: 0 })
    update = setState
    return (
      <InboxList
        items={items}
        selectedIndex={state.index}
        focused
        width={state.width}
        savedIds={state.saved}
        loadingMore={state.pulse > 0}
        loadingFrame={String(state.pulse)}
        onSelect={(index) => setState((current) => ({ ...current, index }))}
      />
    )
  }
  return {
    Harness,
    reads: () => reads,
    reset: () => {
      reads = 0
    },
    change: (change: (current: State) => State) => act(() => update?.(change)),
  }
}

test("Inbox does not reformat unchanged rows during navigation or loading animation", async () => {
  const h = fixture()
  tui = await testRender(<h.Harness />, { width: 130, height: 20 })
  await tui.renderOnce()
  expect(h.reads()).toBe(100)
  h.reset()
  h.change((current) => ({ ...current, index: 40, pulse: 1 }))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("Entry 40")
  expect(h.reads()).toBe(0)
})

test("Inbox invalidates formatting only for changed saved markers, widths and language", async () => {
  const h = fixture()
  tui = await testRender(<h.Harness />, { width: 130, height: 20 })
  h.reset()
  h.change((current) => ({ ...current, saved: new Set(["0"]) }))
  await tui.renderOnce()
  expect(h.reads()).toBe(1)
  expect(tui.captureCharFrame()).toContain("★")
  h.reset()
  h.change((current) => ({ ...current, width: 110 }))
  expect(h.reads()).toBe(100)
  h.reset()
  act(() => updateUiSettings({ language: "en" }))
  h.change((current) => ({ ...current }))
  await tui.renderOnce()
  expect(h.reads()).toBe(100)
  expect(tui.captureCharFrame()).toContain("09/08")
  h.reset()
  act(() => updateUiSettings({ palette: "nord" }))
  h.change((current) => ({ ...current }))
  expect(h.reads()).toBe(0)
})
