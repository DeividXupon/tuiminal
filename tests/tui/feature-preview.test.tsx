import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { FeatureInstaller } from "../../apps/cli/src/features/FeatureInstaller"
import { FeaturePreview } from "../../apps/cli/src/features/FeaturePreview"
import { FEATURE_IDS, type FeatureId } from "../../apps/cli/src/features/model"
import { FEATURE_PREVIEW_INTERVAL } from "../../apps/cli/src/features/presentation"
import { COLORS, getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const cleanup: Array<() => void> = []
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const dispose of cleanup.splice(0).reverse()) dispose()
  updateUiSettings(settings)
})
async function settle(predicate: (frame: string) => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui!.renderOnce()
    if (predicate(tui!.captureCharFrame())) return
  }
  throw new Error(`Preview did not settle:\n${tui!.captureCharFrame()}`)
}
async function hover(id: FeatureId) {
  const row = tui!.renderer.root.findDescendantById(`feature-option-${id}`)!
  await act(async () => {
    await tui!.mockMouse.moveTo(row.screenX + 8, row.screenY + 1)
    await Bun.sleep(15)
  })
  await tui!.renderOnce()
}
async function key(name: string) {
  await act(async () => {
    tui!.mockInput.pressKey(name)
    await Bun.sleep(15)
  })
  await tui!.renderOnce()
}

for (const layout of ["framed", "compact"] as const) {
  test(`hover previews all tools without activation and keeps keyboard multiselection: ${layout}`, async () => {
    updateUiSettings({ language: "en", layout })
    const installs: FeatureId[][] = []
    const opens: FeatureId[] = []
    let block = (_value: boolean) => {}
    function Harness() {
      const [blocked, setBlocked] = useState(false)
      block = setBlocked
      return (
        <FeatureInstaller
          state={{ ready: true, installed: [], busy: null, progress: null, error: "" }}
          selected="database"
          blocked={blocked}
          previewStep={0}
          onInstall={(ids) => installs.push(ids)}
          onUninstall={() => {}}
          onOpen={(id) => opens.push(id)}
          onClose={() => {}}
          onCancel={() => {}}
          onSettings={() => {}}
        />
      )
    }
    tui = await testRender(<Harness />, { width: 140, height: 34 })
    await settle((frame) => frame.includes("|`-----------'|"))
    expect(tui.captureCharFrame()).not.toContain("Preview")
    const animation = tui.renderer.root.findDescendantById("feature-preview-animation")
    const rows = FEATURE_IDS.map((id) =>
      tui!.renderer.root.findDescendantById(`feature-option-${id}`),
    )
    expect(tui.captureCharFrame().replace(/[\s│]+/g, " ")).toContain(
      "Filter results, edit records and review changes before saving.",
    )
    for (const [id, expected] of [
      ["git", "├─────────╯"],
      ["runner", "████████▸"],
      ["http", "'──┬──'"],
      ["terminal", "├─────────────────┤"],
      ["database", "|`-----------'|"],
    ] as const) {
      await hover(id)
      expect(tui.captureCharFrame()).toContain(expected)
      expect(tui.renderer.root.findDescendantById("feature-preview-animation")).toBe(animation)
    }
    expect(installs).toEqual([])
    expect(opens).toEqual([])
    expect(
      FEATURE_IDS.map((id) => tui!.renderer.root.findDescendantById(`feature-option-${id}`)),
    ).toEqual(rows)
    await key(" ")
    await key("j")
    expect(tui.captureCharFrame()).toContain("├─────────╯")
    await key(" ")
    await hover("http")
    act(() => block(true))
    await hover("terminal")
    await key("k")
    await key("i")
    expect(tui.captureCharFrame()).toContain("'──┬──'")
    expect(installs).toEqual([])
    act(() => block(false))
    await key("i")
    expect(installs).toEqual([["database", "git"]])
    await key("j")
    await settle((frame) => frame.includes("├─────────────────┤"))
    act(() => tui!.resize(58, 17))
    await settle((frame) => frame.includes("[Enter] Install"))
    const frame = tui.captureCharFrame()
    expect(frame).toContain("Open shell sessions in your project directory.")
    expect(frame).toContain("╰─❯")
    expect(frame).not.toContain("Preview")
    expect(frame).toContain("[I] Install selected")
    expect(frame).toContain("[Esc] Exit")
  })
}

test("the visible preview owns one clock, retires it on selection, pauses and cleans up", async () => {
  const intervals = spyOn(globalThis, "setInterval")
  const clears = spyOn(globalThis, "clearInterval")
  cleanup.push(() => {
    intervals.mockRestore()
    clears.mockRestore()
  })
  let select = (_id: FeatureId) => {}
  let pause = (_value: boolean) => {}
  function Harness() {
    const [id, setId] = useState<FeatureId>("terminal")
    const [paused, setPaused] = useState(false)
    select = setId
    pause = setPaused
    return <FeaturePreview id={id} compact={false} paused={paused} />
  }
  const clocks = () =>
    intervals.mock.calls.flatMap((args, index) =>
      args[1] === FEATURE_PREVIEW_INTERVAL ? [intervals.mock.results[index]!.value] : [],
    )
  tui = await testRender(<Harness />, { width: 60, height: 20 })
  await settle((frame) => frame.includes("├─────────────────┤"))
  const firstFrame = tui.captureCharFrame()
  expect(clocks()).toHaveLength(1)
  await settle((frame) => frame !== firstFrame)
  act(() => select("http"))
  await settle((frame) => frame.includes("'──┬──'"))
  expect(clocks()).toHaveLength(2)
  expect(clears).toHaveBeenCalledWith(clocks()[0])
  act(() => pause(true))
  await tui.renderOnce()
  expect(clears).toHaveBeenCalledWith(clocks()[1])
  const pausedFrame = tui.captureCharFrame()
  await act(async () => Bun.sleep(FEATURE_PREVIEW_INTERVAL + 30))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toBe(pausedFrame)
  expect(clocks()).toHaveLength(2)
  act(() => pause(false))
  await settle((frame) => frame.includes("'──┬──'"))
  expect(clocks()).toHaveLength(3)
  act(() => tui!.renderer.destroy())
  tui = undefined
  expect(clears).toHaveBeenCalledWith(clocks()[2])
})

for (const layout of ["framed", "compact"] as const) {
  test(`installation fills only its own row with real progress and clears on completion: ${layout}`, async () => {
    updateUiSettings({ language: "en", layout })
    type ProgressState = import("../../apps/cli/src/features/controller").FeatureState
    let update = (_patch: Partial<ProgressState>) => {}
    function Harness() {
      const [state, setState] = useState<ProgressState>({
        ready: true,
        installed: [],
        busy: "runner",
        progress: { received: 0, total: 100 },
        error: "",
      })
      update = (patch) => setState((value) => ({ ...value, ...patch }))
      return (
        <FeatureInstaller
          state={state}
          selected="git"
          blocked={false}
          previewStep={0}
          onInstall={() => {}}
          onUninstall={() => {}}
          onOpen={() => {}}
          onClose={() => {}}
          onCancel={() => {}}
          onSettings={() => {}}
        />
      )
    }
    tui = await testRender(<Harness />, { width: 140, height: 34 })
    await settle((frame) => frame.includes("Installing… 0%"))
    const row = tui.renderer.root.findDescendantById("feature-option-runner")!
    const fill = tui.renderer.root.findDescendantById("feature-install-progress-runner")!
    const rowHeight = row.height
    expect(fill.visible).toBe(false)
    for (const id of ["database", "git", "http", "terminal"]) {
      expect(tui.renderer.root.findDescendantById(`feature-install-progress-${id}`)).toBeUndefined()
    }
    const widths: number[] = []
    for (const received of [25, 50, 75, 100]) {
      act(() => update({ progress: { received, total: 100 } }))
      await settle((frame) => frame.includes(`Installing… ${received}%`))
      widths.push(fill.width)
      expect(fill.visible).toBe(true)
      expect(tui.renderer.root.findDescendantById("feature-option-runner")).toBe(row)
      expect(tui.renderer.root.findDescendantById("feature-install-progress-runner")).toBe(fill)
      expect(row.height).toBe(rowHeight)
      expect(fill.screenX).toBeGreaterThanOrEqual(row.screenX)
      expect(fill.screenX + fill.width).toBeLessThanOrEqual(row.screenX + row.width)
      expect(tui.captureCharFrame()).toContain(
        "Discover project scripts and run multiple commands.",
      )
      const paintedText = tui
        .captureSpans()
        .lines[row.screenY + 1]!.spans.find((span) => span.text.includes("Discover"))
      expect(paintedText).toBeDefined()
      expect(paintedText!.fg.toInts()).toEqual(RGBA.fromHex(COLORS.muted).toInts())
      expect(paintedText!.fg).not.toEqual(paintedText!.bg)
    }
    for (const [index, width] of widths.entries())
      expect(Math.abs(width - widths[3]! * ((index + 1) / 4))).toBeLessThanOrEqual(1)
    act(() => update({ progress: null }))
    await settle((frame) => frame.includes("Loading feature…"))
    expect(tui.renderer.root.findDescendantById("feature-install-progress-runner")).toBeUndefined()
    act(() => update({ busy: null, installed: ["runner"] }))
    await settle((frame) => frame.includes("Open"))
    expect(tui.renderer.root.findDescendantById("feature-install-progress-runner")).toBeUndefined()
    expect(tui.renderer.root.findDescendantById("feature-option-runner")).toBe(row)
  })
}
