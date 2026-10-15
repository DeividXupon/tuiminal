import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { fileURLToPath } from "node:url"
import type { EmbeddedTerminalRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import * as terminal from "../../packages/feature-terminal/src/services/terminal"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const onlyTab = process.env.TUIMINAL_ONLY_TAB
const initialTab = process.env.TUIMINAL_INITIAL_TAB
const handles: terminal.TermAgentsProcessHandle[] = []
const listenerWarnings: string[] = []
const recordWarning = (warning: Error) => {
  if (warning.name === "MaxListenersExceededWarning") listenerWarnings.push(warning.message)
}
const startProcess = terminal.startTermAgentsProcess
let startSpy: ReturnType<typeof spyOn<typeof terminal, "startTermAgentsProcess">> | undefined

afterEach(async () => {
  await act(async () => {
    tui?.renderer.destroy()
    await Promise.all(handles.splice(0).map((handle) => handle.stop()))
  })
  tui = undefined
  startSpy?.mockRestore()
  process.off("warning", recordWarning)
  listenerWarnings.length = 0
  updateUiSettings(settings)
  if (onlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = onlyTab
  if (initialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = initialTab
})

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (until()) return
  }
  throw new Error(`TUI did not settle: ${tui?.captureCharFrame()}`)
}

async function key(name: string, options: { ctrl?: boolean; meta?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, options)
    if (name === "ESCAPE") await Bun.sleep(60)
  })
  await tui?.renderOnce()
}

test("a native terminal keeps its process and output across repeated feature switches", async () => {
  delete process.env.TUIMINAL_ONLY_TAB
  process.env.TUIMINAL_INITIAL_TAB = "terminal"
  process.on("warning", recordWarning)
  updateUiSettings({ language: "pt-BR", terminalMasterKey: "Ctrl+B" })
  const decoder = new TextDecoder()
  let output = ""
  startSpy = spyOn(terminal, "startTermAgentsProcess").mockImplementation((command, options) => {
    const handle = startProcess(command, {
      ...options,
      onData(data) {
        output += decoder.decode(data, { stream: true })
        options.onData(data)
      },
    })
    handles.push(handle)
    return handle
  })
  tui = await testRender(<App />, { width: 120, height: 30, kittyKeyboard: true })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("terminal-sidebar-new")))
  const command = tui.renderer.root.findDescendantById("terminal-sidebar-new")
  if (!command) throw new Error("Missing new terminal control")
  await act(async () => tui?.mockMouse.click(command.screenX + 1, command.screenY))
  await settle(() => tui?.renderer.currentFocusedRenderable?.id.startsWith("term-agents-") ?? false)
  const fixture = fileURLToPath(new URL("../fixtures/terminal-render-echo.ts", import.meta.url))
  await act(async () => {
    await tui?.mockInput.typeText(`"${process.execPath}" "${fixture}"`)
  })
  await act(async () => tui?.mockInput.pressEnter())
  await settle(() => tui?.captureCharFrame().includes("STATUS=READY") ?? false)
  const pane = tui.renderer.currentFocusedRenderable as EmbeddedTerminalRenderable
  const handle = handles[0]
  if (!handle) throw new Error("Missing native terminal process")
  const pid = handle.pid
  const listenerCounts: number[] = []

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await act(async () => tui?.mockInput.typeText(`cycle${cycle}`))
    await settle(() => tui?.captureCharFrame().includes(`cycle${cycle}`) ?? false)
    await key("b", { ctrl: true })
    await key("2", { meta: true })
    await settle(() => tui?.captureCharFrame().includes("[C] DIFFS") ?? false)
    expect(tui.captureCharFrame()).not.toContain("STATUS=")
    expect(tui.captureCharFrame()).not.toContain(`cycle${cycle}`)
    output = ""
    // Ask the owned fixture to publish output while Git owns the UI and keyboard.
    await act(async () => handle.write("\x14"))
    await settle(() => output.includes("STATUS=RESUMED"))
    await act(async () => tui?.resize(120 - cycle * 5, 30 + cycle))
    await key("1", { meta: true })
    if (cycle === 0) {
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")
      await key("ESCAPE")
      await key("ESCAPE")
    }
    listenerCounts.push(tui.renderer.keyInput.listenerCount("keypress"))
    await key("3", { meta: true })
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))
    await key("4", { meta: true })
    await settle(() => tui?.captureCharFrame().includes("GET Scratch") ?? false)
    await key("ESCAPE")
    await key("5", { meta: true })
    await settle(() => tui?.captureCharFrame().includes("STATUS=RESUMED") ?? false)
    expect(tui.renderer.root.findDescendantById(pane.id)).toBe(pane)
    expect(tui.renderer.currentFocusedRenderable).toBe(pane)
    expect(tui.captureCharFrame()).toContain(`cycle${cycle}`)
    expect(() => process.kill(pid, 0)).not.toThrow()
    listenerCounts.push(tui.renderer.keyInput.listenerCount("keypress"))
  }
  expect(startSpy).toHaveBeenCalledTimes(1)
  expect(Math.max(...listenerCounts)).toBeLessThanOrEqual(10)
  expect(listenerWarnings).toEqual([])
}, 30_000)
