import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import * as service from "../../packages/feature-runner/src/services/runner"

let tui: TestRendererSetup
const focus = () => tui.renderer.currentFocusedRenderable?.id
const node = (id: string) => tui.renderer.root.findDescendantById(id)
async function settle(until: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(`Runner did not settle: ${focus()}\n${tui.captureCharFrame()}`)
}
async function key(name: string, ctrl = false, shift = false) {
  act(() => tui.mockInput.pressKey(name, { ctrl, shift }))
  await act(async () => Bun.sleep(name === "ESCAPE" ? 65 : 10))
  await tui.renderOnce()
}
async function mount(width = 140) {
  tui = await testRender(<Runner active />, { width, height: 36, kittyKeyboard: true })
  await settle(() => focus() === "runner-command-list")
}
afterEach(() => act(() => tui?.renderer.destroy()))

test("M chooses visible command, log and history boxes with keys and mouse", async () => {
  await mount()
  await key("s")
  await key("h")
  await settle(() => focus() === "runner-command-list")
  await key("m")
  await settle(() => focus() === "runner-box-selection")
  expect(node("runner-command-panel-focus-selection-tint")).toBeDefined()
  await key("l")
  expect(node("runner-log-panel-focus-selection-tint")).toBeDefined()
  await key("j")
  expect(node("runner-history-panel-focus-selection-tint")).toBeDefined()
  await key("RETURN")
  await settle(() => focus()?.startsWith("runner-history-") ?? false)
  expect(node("runner-box-selection")).toBeUndefined()
  await key("m")
  await key("k")
  await key("ESCAPE")
  await settle(() => focus()?.startsWith("runner-history-") ?? false)
  await key("m")
  const overlay = node("runner-command-panel-focus-selection")
  if (!overlay) throw new Error("Missing command overlay")
  await act(async () => tui.mockMouse.click(overlay.screenX + 2, overlay.screenY + 2))
  await settle(() => focus() === "runner-command-list")
  expect(tui.captureCharFrame()).toContain("0 RODANDO")
  await key("m")
  await key("m")
  await settle(() => focus() === "runner-command-list")
})

test.each([60, 140])("M stays text in inputs and belongs to boxes at %i columns", async (width) => {
  await mount(width)
  await key("/")
  await key("m")
  expect(focus()).toBe("runner-command-input")
  expect(node("runner-command-input")).toHaveProperty("value", "m")
  expect(node("runner-box-selection")).toBeUndefined()
  await key("ESCAPE")
  await key("?")
  await key("m")
  expect(focus()).toBe("runner-action-palette")
  expect(node("runner-box-selection")).toBeUndefined()
  await key("ESCAPE")
  await key("m")
  await settle(() => focus() === "runner-box-selection")
  await key("m", true)
  expect(node("runner-command-panel-focus-selection-tint")).toBeDefined()
  expect(tui.captureCharFrame()).not.toContain("▣ MULTI")
  await key("ESCAPE")
  await key("m", true)
  expect(tui.captureCharFrame()).toContain("[Shift+M] Único")
  await key("m", true)
  expect(tui.captureCharFrame()).not.toContain("▣ MULTI")
})

test("Multi process boxes can receive focus without starting or stopping a command", async () => {
  let stops = 0
  const spawn = spyOn(service, "startRunnerProcess").mockImplementation(() => ({
    pid: null,
    interactive: false,
    write: () => {},
    stop: async () => {
      stops += 1
    },
  }))
  try {
    await mount()
    await key("RETURN")
    await settle(() => spawn.mock.calls.length === 1)
    await key("m", true)
    expect(tui.captureCharFrame()).toContain("▣ MULTI")
    await key("m")
    await key("ARROW_RIGHT")
    await key("RETURN")
    await settle(() => focus()?.startsWith("runner-multi-") ?? false)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(stops).toBe(0)
    await key("m")
    await key("h")
    await key("RETURN")
    await settle(() => focus() === "runner-command-list")
    await key("m", true)
    expect(tui.captureCharFrame()).not.toContain("▣ MULTI")
  } finally {
    act(() => tui.renderer.destroy())
    spawn.mockRestore()
  }
})

test.each([false, true])(
  "Shift+M toggles Multi without activating commands with Kitty keyboard %s",
  async (kittyKeyboard) => {
    let stops = 0
    const spawn = spyOn(service, "startRunnerProcess").mockImplementation(() => ({
      pid: null,
      interactive: false,
      write: () => {},
      stop: async () => {
        stops += 1
      },
    }))
    try {
      tui = await testRender(<Runner active />, { width: 140, height: 36, kittyKeyboard })
      await settle(() => focus() === "runner-command-list")
      await key("m", false, true)
      expect(tui.captureCharFrame()).toContain("[Shift+M] Único")
      expect(spawn).not.toHaveBeenCalled()
      expect(node("runner-box-selection")).toBeUndefined()
      await key("m", false, true)
      expect(tui.captureCharFrame()).not.toContain("▣ MULTI")
      await key("RETURN")
      await settle(() => spawn.mock.calls.length === 1)
      await key("m", false, true)
      expect(tui.captureCharFrame()).toContain("▣ MULTI")
      await key("m", false, true)
      expect(tui.captureCharFrame()).not.toContain("▣ MULTI")
      expect(spawn).toHaveBeenCalledTimes(1)
      expect(stops).toBe(0)
      await key("/")
      await key("m", false, true)
      expect(node("runner-command-input")).toHaveProperty("value", "M")
      expect(tui.captureCharFrame()).not.toContain("▣ MULTI")
    } finally {
      act(() => tui.renderer.destroy())
      spawn.mockRestore()
    }
  },
)
