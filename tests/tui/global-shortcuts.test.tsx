import "./setup"
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import * as terminal from "../../packages/feature-terminal/src/services/terminal"
import { terminalActionKey } from "../../packages/feature-terminal/src/ui/TerminalActions"
import { resolveRunnerSessionScope } from "../../packages/feature-runner/src/services/runner"
import {
  loadRunnerSession,
  saveRunnerSession,
} from "../../packages/feature-runner/src/storage/runner-config"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const initialOnlyTab = process.env.TUIMINAL_ONLY_TAB
const initialTab = process.env.TUIMINAL_INITIAL_TAB
const handles: terminal.TermAgentsProcessHandle[] = []
const startProcess = terminal.startTermAgentsProcess
let startSpy: ReturnType<typeof spyOn<typeof terminal, "startTermAgentsProcess">> | undefined
const runnerScope = resolveRunnerSessionScope()
let runnerSession: ReturnType<typeof loadRunnerSession>

beforeEach(() => {
  runnerSession = loadRunnerSession(runnerScope)
})

afterEach(async () => {
  await act(async () => {
    tui?.renderer.destroy()
    await Promise.all(handles.splice(0).map((handle) => handle.stop()))
  })
  tui = undefined
  saveRunnerSession(runnerScope, runnerSession)
  startSpy?.mockRestore()
  startSpy = undefined
  updateUiSettings(initialSettings)
  if (initialOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = initialOnlyTab
  if (initialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = initialTab
})

async function mount(tool = "runner", kittyKeyboard = false, isolated = false) {
  if (isolated) process.env.TUIMINAL_ONLY_TAB = tool
  else delete process.env.TUIMINAL_ONLY_TAB
  process.env.TUIMINAL_INITIAL_TAB = tool
  updateUiSettings({ language: "en" })
  tui = await testRender(<App />, { width: 120, height: 30, kittyKeyboard })
  return tui
}

async function settle(until: () => boolean) {
  if (!tui) throw new Error("TUI not mounted")
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(`TUI did not settle: ${tui.captureCharFrame()}`)
}

async function key(name: string, modifiers?: { ctrl?: boolean; meta?: boolean }) {
  await act(async () => {
    tui?.mockInput.pressKey(name, modifiers)
    if (name === "ESCAPE") await Bun.sleep(60)
  })
  await tui?.renderOnce()
}

function visible(id: string) {
  return Boolean(tui?.renderer.root.findDescendantById(id)?.visible)
}

test("Master Key maps all five Option symbols and rejects extra modifiers", () => {
  for (const [index, symbol] of [..."¡™£¢∞"].entries()) {
    for (const key of [
      { name: symbol },
      { name: "", sequence: symbol },
      { name: "", raw: symbol },
    ]) {
      expect(terminalActionKey(key)).toBe(`alt+${index + 1}`)
      expect(terminalActionKey({ ...key, ctrl: true })).toBeNull()
      expect(terminalActionKey({ ...key, shift: true })).toBeNull()
      expect(terminalActionKey({ ...key, super: true })).toBeNull()
    }
  }
})

test("Ghostty Option symbols switch tools through the native input parser", async () => {
  await mount()
  await settle(() => visible("runner-command-list"))
  await key("™")
  await settle(() => tui?.captureCharFrame().includes("[C] DIFFS") ?? false)
  await key("¢")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("¡")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")
  await key("ESCAPE")
  await key("ESCAPE")
  await key("£")
  await settle(
    () => (tui?.captureCharFrame().includes("RUNNER") ?? false) && visible("runner-command-list"),
  )
  await key("∞")
  await settle(() => visible("terminal-sidebar-new"))
})

for (const kittyKeyboard of [false, true]) {
  test(`Alt numbers still switch tools with ${kittyKeyboard ? "Kitty" : "legacy"} input`, async () => {
    saveRunnerSession(runnerScope, {
      ...runnerSession,
      openedProjects: [runnerScope, join(runnerScope, "other-2"), join(runnerScope, "other-3")],
    })
    await mount("runner", kittyKeyboard)
    await settle(() => visible("runner-command-list"))
    await key("2", { meta: true })
    await settle(() => tui?.captureCharFrame().includes("[C] DIFFS") ?? false)
    await key("3", { meta: true })
    await settle(() => visible("runner-command-list"))
    expect(tui?.captureCharFrame()).not.toContain("[C] DIFFS")
  })
}

test("Option symbols remain text in focused inputs and connection dialogs", async () => {
  await mount("http")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  const url = tui?.renderer.currentFocusedRenderable as InputRenderable
  const before = url.value
  for (const symbol of "¡™£¢∞") await key(symbol)
  expect(url.value).toBe(`${before}¡™£¢∞`)
  expect(tui?.renderer.currentFocusedRenderable).toBe(url)
  expect(visible("runner-command-list")).toBe(false)
  await act(async () => tui?.mockInput.pasteBracketedText("¡™£¢∞"))
  expect(url.value).toBe(`${before}¡™£¢∞¡™£¢∞`)

  await key("ESCAPE")
  await key("¡")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")
  const name = tui?.renderer.currentFocusedRenderable as InputRenderable
  const originalName = name.value
  for (const symbol of "¡™£¢∞") await key(symbol)
  expect(name.value).toBe(`${originalName}¡™£¢∞`)
  expect(tui?.renderer.currentFocusedRenderable).toBe(name)
  expect(visible("runner-command-list")).toBe(false)
})

test("bracketed paste does not become global navigation", async () => {
  await mount()
  await settle(() => visible("runner-command-list"))
  await act(async () => tui?.mockInput.pasteBracketedText("¡™£¢∞"))
  await tui?.renderOnce()
  expect(visible("runner-command-list")).toBe(true)
  expect(visible("http-url-input")).toBe(false)
  expect(visible("terminal-sidebar-new")).toBe(false)
})

test("a focused PTY receives Option symbols until the Master Key releases its input", async () => {
  startSpy = spyOn(terminal, "startTermAgentsProcess").mockImplementation((command, options) => {
    const handle = startProcess(command, options)
    handles.push(handle)
    return handle
  })
  updateUiSettings({ terminalMasterKey: "Ctrl+B" })
  await mount("terminal")
  await settle(() => visible("terminal-sidebar-new"))
  const command = tui?.renderer.root.findDescendantById("terminal-sidebar-new")
  if (!command) throw new Error("Missing new terminal control")
  await act(async () => tui?.mockMouse.click(command.screenX + 1, command.screenY))
  await settle(() => tui?.renderer.currentFocusedRenderable?.id.startsWith("term-agents-") ?? false)
  const fixture = fileURLToPath(new URL("../fixtures/terminal-render-echo.ts", import.meta.url))
  await act(async () => tui?.mockInput.typeText(`"${process.execPath}" "${fixture}"`))
  await act(async () => tui?.mockInput.pressEnter())
  await settle(() => tui?.captureCharFrame().includes("STATUS=READY") ?? false)
  const pane = tui?.renderer.currentFocusedRenderable
  for (const symbol of "¡™£¢∞") await key(symbol)
  await settle(() => tui?.captureCharFrame().includes("INPUT=¡™£¢∞") ?? false)
  expect(tui?.renderer.currentFocusedRenderable).toBe(pane)
  expect(visible("runner-command-list")).toBe(false)
  await key("b", { ctrl: true })
  await key("/")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "terminal-action-search")
  for (const symbol of "¡™£¢∞") await key(symbol)
  const search = tui?.renderer.currentFocusedRenderable as InputRenderable | undefined
  expect(search?.value).toBe("¡™£¢∞")
  expect(visible("runner-command-list")).toBe(false)
  await key("ESCAPE")
  await key("£")
  await settle(() => visible("runner-command-list"))
  expect(tui?.captureCharFrame()).not.toContain("STATUS=READY")
})

test("settings and isolated tools block Option symbol navigation", async () => {
  await mount("runner", false, true)
  await settle(() => visible("runner-command-list"))
  for (const symbol of "¡™¢∞") await key(symbol)
  expect(visible("runner-command-list")).toBe(true)
  expect(visible("terminal-sidebar-new")).toBe(false)

  act(() => tui?.renderer.destroy())
  tui = undefined
  tui = await mount()
  await settle(() => visible("runner-command-list"))
  await key(",")
  await settle(() => visible("configuration-modal"))
  for (const symbol of "¡™£¢∞") await key(symbol)
  expect(visible("configuration-modal")).toBe(true)
  expect(visible("http-url-input")).toBe(false)
  expect(visible("terminal-sidebar-new")).toBe(false)
  await key("ESCAPE")
  expect(tui?.captureCharFrame()).toContain("RUNNER")
})
