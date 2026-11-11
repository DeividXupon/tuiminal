import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { BaseRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { TabsTabRenderable } from "@tuiparts/core/tabs"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import * as terminal from "../../packages/feature-terminal/src/services/terminal"
import { openLocalHttp } from "./http-source"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const onlyTab = process.env.TUIMINAL_ONLY_TAB
const initialTab = process.env.TUIMINAL_INITIAL_TAB
const handles: terminal.TermAgentsProcessHandle[] = []
const startProcess = terminal.startTermAgentsProcess
let startSpy: ReturnType<typeof spyOn<typeof terminal, "startTermAgentsProcess">> | undefined

afterEach(async () => {
  await act(async () => {
    tui?.renderer.destroy()
    await Promise.all(handles.splice(0).map((handle) => handle.stop()))
  })
  tui = undefined
  startSpy?.mockRestore()
  updateUiSettings(settings)
  if (onlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = onlyTab
  if (initialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = initialTab
})

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (until()) return
  }
  throw new Error(
    `Focus: ${tui?.renderer.currentFocusedRenderable?.id}\n${tui?.captureCharFrame()}`,
  )
}

async function key(name: string, options: { ctrl?: boolean; meta?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name === "SPACE" ? " " : name, options)
    await Bun.sleep(name === "ESCAPE" ? 60 : 0)
    await tui?.renderOnce()
  })
}

function navigationTab(root: BaseRenderable, value: string): TabsTabRenderable | undefined {
  if (root instanceof TabsTabRenderable && root.value === value) return root
  for (const child of root.getChildren()) {
    const match = navigationTab(child, value)
    if (match) return match
  }
  return undefined
}

test.each([
  ["SPACE", "mouse"],
  ["RETURN", "mouse"],
  ["SPACE", "keyboard"],
  ["RETURN", "keyboard"],
] as const)(
  "%s belongs only to the active terminal after leaving HTTP through %s navigation",
  async (activation, navigation) => {
    delete process.env.TUIMINAL_ONLY_TAB
    process.env.TUIMINAL_INITIAL_TAB = "terminal"
    updateUiSettings({ language: "en", terminalMasterKey: "Ctrl+B" })
    const input: string[][] = []
    startSpy = spyOn(terminal, "startTermAgentsProcess").mockImplementation((command, options) => {
      const handle = startProcess(command, options)
      const write = handle.write.bind(handle)
      const received: string[] = []
      input.push(received)
      handle.write = (data) => {
        received.push(typeof data === "string" ? data : new TextDecoder().decode(data))
        write(data)
      }
      handles.push(handle)
      return handle
    })
    tui = await testRender(<App />, { width: 120, height: 30, kittyKeyboard: true })
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("terminal-sidebar-new")))
    const create = tui.renderer.root.findDescendantById("terminal-sidebar-new")
    if (!create) throw new Error("Missing terminal action")
    await act(async () => tui?.mockMouse.click(create.screenX + 1, create.screenY))
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id.startsWith("term-agents-") ?? false,
    )
    const firstPane = tui.renderer.currentFocusedRenderable
    await act(async () => tui?.mockMouse.click(create.screenX + 1, create.screenY))
    await settle(
      () =>
        handles.length === 2 &&
        tui?.renderer.currentFocusedRenderable !== firstPane &&
        (tui?.renderer.currentFocusedRenderable?.id.startsWith("term-agents-") ?? false),
    )
    const pane = tui.renderer.currentFocusedRenderable
    await key("b", { ctrl: true })
    await key("4", { meta: true })
    await openLocalHttp(tui)
    const httpTab = navigationTab(tui.renderer.root, "http")
    if (!httpTab) throw new Error("Missing HTTP tab")
    await act(async () => tui?.mockMouse.click(httpTab.screenX + 2, httpTab.screenY))
    await settle(() => tui?.renderer.currentFocusedRenderable === httpTab)
    if (navigation === "keyboard") await key("5", { meta: true })
    else {
      const terminalTab = navigationTab(tui.renderer.root, "terminal")
      if (!terminalTab) throw new Error("Missing Terminal tab")
      await act(async () => tui?.mockMouse.click(terminalTab.screenX + 2, terminalTab.screenY))
    }
    await settle(() => tui?.renderer.currentFocusedRenderable === pane)
    for (const received of input) received.length = 0
    await key(activation)
    expect(tui.renderer.currentFocusedRenderable?.id).toBe(pane?.id)
    expect(httpTab.focused).toBe(false)
    expect(input[0]?.join("")).toBe("")
    expect(input[1]?.join("")).toBe(activation === "SPACE" ? " " : "\r")
    await act(async () => tui?.mockInput.pasteBracketedText("prompt with spaces"))
    expect(tui.renderer.currentFocusedRenderable?.id).toBe(pane?.id)
    expect(input[0]?.join("")).toBe("")
    expect(input[1]?.join("")).toContain("prompt with spaces")
    expect(startSpy).toHaveBeenCalledTimes(2)
  },
  15_000,
)
