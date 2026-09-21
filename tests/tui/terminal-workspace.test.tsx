import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { EmbeddedTerminalRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { rmSync } from "node:fs"
import { FreeTerminal } from "../../packages/feature-terminal/src/TerminalWorkspace"
import { App } from "../../apps/cli/src/App"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import * as processes from "../../packages/feature-terminal/src/services/terminal"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"
import type { ProcessIdentity } from "../../packages/feature-terminal/src/model/agent-detection"
import {
  saveTerminalWorkspaceState,
  terminalWorkspaceStatePath,
} from "../../packages/feature-terminal/src/services/terminal-workspace-state"
import {
  resetPinnedTerminalSidebarForTests,
  terminalSidebarSnapshot,
} from "../../packages/feature-terminal/src/model/pinned-sidebar"

const originalSettings = getUiSettings()
const originalOnlyTab = process.env.TUIMINAL_ONLY_TAB
const originalWorkspaceState = process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
let tui: TestRendererSetup | undefined
let spawnSpy: ReturnType<typeof spyOn<typeof processes, "startFreeTerminalProcess">> | undefined
let inspectionSpy: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
const inputs: string[][] = []
const starts: Parameters<typeof processes.startFreeTerminalProcess>[1][] = []
let snapshot: ProcessIdentity[] = []

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  spawnSpy?.mockRestore()
  inspectionSpy?.mockRestore()
  inputs.length = 0
  starts.length = 0
  snapshot = []
  resetPinnedTerminalSidebarForTests()
  updateUiSettings(originalSettings)
  if (originalOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = originalOnlyTab
  if (originalWorkspaceState === undefined) delete process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
  else process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = originalWorkspaceState
  rmSync(terminalWorkspaceStatePath(processes.FREE_TERMINAL_WORKING_DIRECTORY), {
    force: true,
  })
})

async function mount(app = false, width = 120, height = 30) {
  updateUiSettings({ terminalMasterKey: "Ctrl+B", language: "pt-BR", layout: "framed" })
  inspectionSpy = spyOn(inspection, "readTerminalProcesses").mockImplementation(
    async () => snapshot,
  )
  spawnSpy = spyOn(processes, "startFreeTerminalProcess").mockImplementation(
    (_command, options) => {
      starts.push(options)
      const input: string[] = []
      inputs.push(input)
      return {
        pid: 100 + starts.length,
        write: (data) =>
          input.push(typeof data === "string" ? data : new TextDecoder().decode(data)),
        resize: () => undefined,
        stop: async () => undefined,
      }
    },
  )
  if (app) process.env.TUIMINAL_ONLY_TAB = "terminal"
  tui = await testRender(app ? <App /> : <FreeTerminal active />, { width, height })
  await tui.renderOnce()
}
async function key(name: string, ctrl = false) {
  await act(async () => {
    if (name === "enter") tui?.mockInput.pressEnter()
    else if (name === "escape") tui?.mockInput.pressEscape()
    else if (name === "backspace") tui?.mockInput.pressBackspace()
    else if (name === "tab") tui?.mockInput.pressTab()
    else tui?.mockInput.pressKey(name, { ctrl })
    if (name === "escape") await Bun.sleep(70)
  })
  await tui?.renderOnce()
}
async function leader(action: string) {
  await key("b", true)
  await key(action)
}
async function click(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}`)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}
function focusedTerminal() {
  return tui?.renderer.currentFocusedRenderable as EmbeddedTerminalRenderable
}
async function text(value: string) {
  await act(async () => tui?.mockInput.typeText(value))
  await key("enter")
}

test("Master Key reveals bottom actions and Escape cancels without sending bytes or closing App", async () => {
  await mount(true)
  await leader("c")
  const terminal = focusedTerminal()
  const height = terminal.height
  await key("b", true)
  expect(tui?.captureCharFrame()).toContain("Master Key")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")?.screenY).toBeGreaterThan(10)
  expect(terminal.height).toBeLessThan(height)
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  expect(focusedTerminal()).toBe(terminal)
  expect(terminal.height).toBe(height)
  expect(inputs[0]).toEqual([])
  await key("b", true)
  await key("b", true)
  expect(inputs[0]?.join("")).toBe("\u0002")
})

test("Master Key pins one global sidebar and returns it to the Terminal workspace", async () => {
  await mount(true)
  await leader("c")
  const workspace = tui!.renderer.root.findDescendantById("terminal-workspace")!
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(panes.screenX).toBeGreaterThan(workspace.screenX)
  await leader("b")
  expect(terminalSidebarSnapshot().pinned).toBe(true)
  expect(workspace.screenX).toBeGreaterThan(0)
  expect(panes.screenX).toBe(workspace.screenX)
  await leader("b")
  expect(terminalSidebarSnapshot().pinned).toBe(false)
  expect(workspace.screenX).toBe(0)
  expect(panes.screenX).toBeGreaterThan(workspace.screenX)
})

test("Master Key can move keyboard focus from a terminal into the sidebar", async () => {
  await mount()
  await leader("c")
  await leader("l")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
})

test("returning from the pinned sidebar redraws and keeps the terminal visible", async () => {
  await mount(true)
  await leader("c")
  const terminal = focusedTerminal()
  await act(async () => starts[0]?.onData(new TextEncoder().encode("visible prompt")))
  await tui?.renderOnce()
  expect(terminal.screen().text).toContain("visible prompt")
  const invalidate = spyOn(terminal, "invalidate")

  await leader("b")
  await leader("l")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
  await key("enter")

  expect(focusedTerminal()).toBe(terminal)
  expect(terminal.visible).toBe(true)
  expect(terminal.screen().text).toContain("visible prompt")
  expect(invalidate).toHaveBeenCalled()
})

test("two panes fill one compact section and a third split is refused", async () => {
  await mount()
  await leader("c")
  const first = focusedTerminal()
  await leader("v")
  const second = focusedTerminal()
  expect(starts).toHaveLength(2)
  expect(first.screenY).toBe(second.screenY)
  const frame = tui?.renderer.root.findDescendantById(
    `terminal-pane-frame-${first.id.replace("free-terminal-", "")}`,
  )
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(first.height).toBe(frame!.height)
  expect(first.screenX).toBe(panes.screenX)
  expect(first.screenY).toBe(panes.screenY)
  expect(first.height).toBe(panes.height)
  expect(second.screenX).toBe(first.screenX + first.width + 1)
  expect(first.width + second.width + 1).toBe(panes.width)
  expect(tui?.captureCharFrame()).toContain("│")
  await leader("s")
  expect(starts).toHaveLength(2)
  await key("escape")
  const splitWidth = second.width
  await leader("x")
  expect(first.width).toBeGreaterThan(splitWidth)
  for (const old of ["❯ FREE TERMINAL", "CMD", "Seção 2×2", "Split lado", "vivas ·"]) {
    expect(tui?.captureCharFrame()).not.toContain(old)
  }
  expect(starts).toHaveLength(2)
})

test.each(["keyboard", "mouse"])("new terminals stay separate via %s", async (method) => {
  await mount()
  const create = () => (method === "keyboard" ? leader("n") : click("terminal-sidebar-new"))
  await create()
  const first = focusedTerminal()
  await create()
  const second = focusedTerminal()
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(second).not.toBe(first)
  expect(second.width).toBe(panes.width)
  expect(second.height).toBe(panes.height)
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-2")).toBeDefined()
  await leader("a")
  expect(focusedTerminal()).toBe(first)
  expect(first.width).toBe(panes.width)
  expect(first.height).toBe(panes.height)
  await leader("f")
  expect(focusedTerminal()).toBe(second)
  await leader("v")
  const third = focusedTerminal()
  expect(second.width + third.width + 1).toBe(panes.width)
  expect(third.screenX).toBe(second.screenX + second.width + 1)
  expect(
    tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-3"),
  ).toBeUndefined()
  expect(starts).toHaveLength(3)
  expect(inputs).toEqual([[], [], []])
})

test("folders and paired sidebar rows support mouse selection and moving sections", async () => {
  await mount()
  await click("terminal-sidebar-new-folder")
  await text("Services")
  expect(tui?.captureCharFrame()).toContain("Services")
  await click("terminal-sidebar-new")
  const first = focusedTerminal()
  await leader("s")
  const second = focusedTerminal()
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(second.screenY).toBe(first.screenY + first.height + 1)
  expect(first.height + second.height + 1).toBe(panes.height)
  expect(first.width).toBe(panes.width)
  expect(second.width).toBe(panes.width)
  await leader("e")
  await key("END")
  for (let i = 0; i < "Terminal 2".length; i++) await key("backspace")
  await text("API")
  expect(tui?.captureCharFrame()).toContain("API")
  await leader("o")
  await click("terminal-dialog-folder-folder-1")
  const folder = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-folder-1")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  expect(section.parent).toBe(folder.parent)
  const firstId = first.id.replace("free-terminal-", "")
  await click(`terminal-sidebar-pane-${firstId}`)
  expect(focusedTerminal()).toBe(first)
  expect(starts).toHaveLength(2)
})

test("custom folders return when the Terminal workspace is mounted again", async () => {
  process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "1"
  saveTerminalWorkspaceState(processes.FREE_TERMINAL_WORKING_DIRECTORY, {
    folders: [{ id: "folder-7", name: "Services" }],
    assignments: {},
  })

  await mount()

  const folder = tui?.renderer.root.findDescendantById("terminal-sidebar-folder-folder-7")
  expect(folder).toBeDefined()
  expect(tui?.captureCharFrame().split("\n")[folder!.screenY]).toContain("Services")
})

test("changing Master Key in contextual settings takes effect and keeps shell input intact", async () => {
  await mount(true)
  await click("tutorial-settings-button")
  expect(tui?.renderer.root.findDescendantById("configuration-section-terminal")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("configuration-section-layout")).toBeUndefined()
  await click("configuration-terminal-Ctrl+A")
  expect(getUiSettings().terminalMasterKey).toBe("Ctrl+A")
  await key("escape")
  await key("a", true)
  await key("c")
  expect(starts).toHaveLength(1)
  await key("b", true)
  expect(inputs[0]?.join("")).toBe("\u0002")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  await key("a", true)
  await key("escape")
  expect(inputs[0]?.join("")).toBe("\u0002")
})

test("an agent launched under a shell keeps its pair in Tuiminais without restarting", async () => {
  await mount()
  await leader("c")
  await leader("v")
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("free-terminal-", "")
  const agentId = `terminal-agent-${sessionId}`
  const paneId = `terminal-sidebar-pane-${sessionId}`
  const separatorId = `terminal-sidebar-separator-section-1-${sessionId}`
  const folder = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  const originalY = section.screenY
  expect(section.parent).toBe(folder.parent)
  expect(section.findDescendantById(paneId)).toBeDefined()
  expect(section.findDescendantById(separatorId)).toBeDefined()
  snapshot = [
    { pid: 101, parentPid: 1, executable: "sh", command: "sh" },
    { pid: 102, parentPid: 1, executable: "sh", command: "sh" },
    {
      pid: 103,
      parentPid: 102,
      executable: "node",
      command: "node /opt/@openai/codex/bin/codex.js",
    },
  ]
  async function waitForAgent(present: boolean) {
    for (let i = 0; i < 60; i++) {
      await act(async () => Bun.sleep(50))
      await tui?.renderOnce()
      if (Boolean(tui?.renderer.root.findDescendantById(agentId)) === present) return
    }
    throw new Error("Agent sidebar did not update")
  }
  await waitForAgent(true)
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-ai")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById(paneId)).toBeUndefined()
  expect(tui!.captureCharFrame().split("\n")[section.screenY]).toContain("sh")
  expect(section.findDescendantById(separatorId)).toBeUndefined()
  expect(section.parent).toBe(folder.parent)
  expect(section.screenY).toBe(originalY)
  expect(focusedTerminal()).toBe(terminal)
  await click(agentId)
  expect(focusedTerminal()).toBe(terminal)
  expect(starts).toHaveLength(2)
  snapshot = snapshot.slice(0, 2)
  await waitForAgent(false)
  expect(section.findDescendantById(paneId)).toBeDefined()
  expect(section.findDescendantById(separatorId)).toBeDefined()
  expect(section.parent).toBe(folder.parent)
  expect(section.screenY).toBe(originalY)
  expect(focusedTerminal()).toBe(terminal)
  expect(starts).toHaveLength(2)
}, 10_000)

test.each(["IA", "AI"])("%s can be created while new terminals stay in Tuiminais", async (name) => {
  await mount()
  await leader("d")
  await text(name)
  expect(tui?.renderer.root.findDescendantById("terminal-dialog")).toBeUndefined()
  const folder = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-folder-1")!
  expect(folder).toBeDefined()
  expect(tui?.captureCharFrame().split("\n")[folder.screenY]).toContain(`▾ ${name}`)
  await click("terminal-sidebar-new")
  const owned = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  expect(section.parent).toBe(owned.parent)
  expect(starts).toHaveLength(1)
})

test("narrow workspaces retain the sidebar, modal Escape and native input", async () => {
  await mount(true, 58, 18)
  await leader("c")
  const terminal = focusedTerminal()
  await leader("/")
  await key("escape")
  expect(focusedTerminal()).toBe(terminal)
  await act(async () => tui?.mockInput.typeText("echo fixture"))
  expect(inputs[0]?.join("")).toBe("echo fixture")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar")?.width).toBeGreaterThan(0)
})

test("new sections return to Tuiminais and keep the workspace session limit", async () => {
  await mount()
  await leader("c")
  await leader("d")
  await text("Other")
  await click("terminal-sidebar-new")
  const owned = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  expect(section.parent).toBe(owned.parent)
  const panes = tui?.renderer.root.findDescendantById("terminal-panes")
  expect(focusedTerminal().width).toBe(panes!.width)
  for (let i = 2; i < 12; i++) await leader("c")
  expect(starts).toHaveLength(12)
  await leader("c")
  expect(starts).toHaveLength(12)
})

test("settings agent-command input consumes typing and its own Escape", async () => {
  await mount(true)
  await click("tutorial-settings-button")
  await key("i")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("configuration-terminal-agent-input")
  await text("private-assistant")
  expect(getUiSettings().terminalAgentCommands).toEqual(["private-assistant"])
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeDefined()
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeUndefined()
})

test("prefix navigation switches among live sections without relaunching their processes", async () => {
  await mount()
  await leader("c")
  const first = focusedTerminal()
  await leader("c")
  const second = focusedTerminal()
  await leader("a")
  expect(focusedTerminal()).toBe(first)
  await leader("f")
  expect(focusedTerminal()).toBe(second)
  await leader("p")
  expect(focusedTerminal()).toBe(first)
  await leader("tab")
  expect(focusedTerminal()).toBe(second)
  expect(starts).toHaveLength(2)
  expect(inputs).toEqual([[], []])
})

test("terminals fill every available edge at all sizes without replacing the native process", async () => {
  await mount()
  await leader("c")
  const terminal = focusedTerminal()
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  const sidebar = tui!.renderer.root.findDescendantById("terminal-sidebar")!
  const workspace = tui!.renderer.root.findDescendantById("terminal-workspace")!
  const expectFullArea = () => {
    expect(terminal.screenX).toBe(sidebar.screenX + sidebar.width)
    expect(terminal.screenY).toBe(workspace.screenY)
    expect(terminal.width).toBe(panes.width)
    expect(terminal.height).toBe(panes.height)
    expect(terminal.screenX + terminal.width).toBe(workspace.screenX + workspace.width)
    expect(terminal.screenY + terminal.height).toBe(workspace.screenY + workspace.height)
  }
  expectFullArea()
  await act(async () => tui?.resize(58, 18))
  await tui?.renderOnce()
  expect(focusedTerminal()).toBe(terminal)
  expectFullArea()
  await act(async () => tui?.resize(120, 30))
  await tui?.renderOnce()
  expect(focusedTerminal()).toBe(terminal)
  expectFullArea()
  expect(starts).toHaveLength(1)
})
