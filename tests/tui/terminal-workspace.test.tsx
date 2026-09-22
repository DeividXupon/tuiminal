import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { rmSync } from "node:fs"
import {
  type BoxRenderable,
  CodeRenderable,
  type DiffRenderable,
  type EmbeddedTerminalRenderable,
  LineNumberRenderable,
  RGBA,
  type ScrollBoxRenderable,
} from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import { COLORS, getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import type { ProcessIdentity } from "../../packages/feature-terminal/src/model/agent-detection"
import {
  resetPinnedTerminalSidebarForTests,
  terminalSidebarSnapshot,
} from "../../packages/feature-terminal/src/model/pinned-sidebar"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"
import * as liveDiff from "../../packages/feature-terminal/src/services/live-diff"
import * as liveDiffProjects from "../../packages/feature-terminal/src/services/live-diff-projects"
import * as processes from "../../packages/feature-terminal/src/services/terminal"
import {
  loadTerminalWorkspaceState,
  saveTerminalWorkspaceState,
  terminalWorkspaceStatePath,
} from "../../packages/feature-terminal/src/services/terminal-workspace-state"
import { FreeTerminal } from "../../packages/feature-terminal/src/TerminalWorkspace"
import { terminalActionKey } from "../../packages/feature-terminal/src/ui/TerminalActions"

const originalSettings = getUiSettings()
const originalOnlyTab = process.env.TUIMINAL_ONLY_TAB
const originalInitialTab = process.env.TUIMINAL_INITIAL_TAB
const originalWorkspaceState = process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
let tui: TestRendererSetup | undefined
let spawnSpy: ReturnType<typeof spyOn<typeof processes, "startFreeTerminalProcess">> | undefined
let inspectionSpy: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
const liveDiffSpies: Array<{ mockRestore: () => void }> = []
const inputs: string[][] = []
const starts: Parameters<typeof processes.startFreeTerminalProcess>[1][] = []
const commands: string[][] = []
let snapshot: ProcessIdentity[] = []

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  spawnSpy?.mockRestore()
  inspectionSpy?.mockRestore()
  for (const spy of liveDiffSpies.splice(0)) spy.mockRestore()
  inputs.length = 0
  starts.length = 0
  commands.length = 0
  snapshot = []
  resetPinnedTerminalSidebarForTests()
  updateUiSettings(originalSettings)
  if (originalOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = originalOnlyTab
  if (originalInitialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = originalInitialTab
  if (originalWorkspaceState === undefined) delete process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
  else process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = originalWorkspaceState
  rmSync(terminalWorkspaceStatePath(processes.FREE_TERMINAL_WORKING_DIRECTORY), {
    force: true,
  })
})

async function mount(
  app = false,
  width = 120,
  height = 30,
  actions: {
    onOpenSettings?: () => void
    onSelectTool?: (tool: "database" | "git" | "runner" | "http" | "terminal") => void
    onQuit?: () => void
  } = {},
  fullApp = false,
) {
  updateUiSettings({ terminalMasterKey: "Ctrl+B", language: "pt-BR", layout: "framed" })
  inspectionSpy = spyOn(inspection, "readTerminalProcesses").mockImplementation(
    async () => snapshot,
  )
  spawnSpy = spyOn(processes, "startFreeTerminalProcess").mockImplementation((command, options) => {
    commands.push(command)
    starts.push(options)
    const input: string[] = []
    inputs.push(input)
    return {
      pid: 100 + starts.length,
      write: (data) => input.push(typeof data === "string" ? data : new TextDecoder().decode(data)),
      resize: () => undefined,
      stop: async () => undefined,
    }
  })
  if (app) process.env.TUIMINAL_ONLY_TAB = "terminal"
  if (fullApp) {
    delete process.env.TUIMINAL_ONLY_TAB
    process.env.TUIMINAL_INITIAL_TAB = "terminal"
  }
  tui = await testRender(app || fullApp ? <App /> : <FreeTerminal active {...actions} />, {
    width,
    height,
  })
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
async function arrow(direction: "up" | "down" | "left" | "right") {
  await act(async () => tui?.mockInput.pressArrow(direction))
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

test("Master Key action parsing accepts Alt tool keys and ignores unrelated modifiers", () => {
  expect(terminalActionKey({ name: "2", meta: true })).toBe("alt+2")
  expect(terminalActionKey({ name: "3", option: true })).toBe("alt+3")
  expect(terminalActionKey({ name: "5", option: true })).toBe("alt+5")
  expect(terminalActionKey({ name: "escape", sequence: "1", option: true })).toBe("alt+1")
  expect(terminalActionKey({ name: "1", meta: true, ctrl: true })).toBeNull()
  expect(terminalActionKey({ name: "6", meta: true })).toBeNull()
  expect(terminalActionKey({ name: "q", ctrl: true })).toBeNull()
  expect(terminalActionKey({ name: "," })).toBe(",")
})

test("Master Key starts the native Codex CLI in a real terminal", async () => {
  await mount()
  await leader("a")
  expect(commands).toEqual([["codex"]])
  expect(tui?.renderer.root.findDescendantById("terminal-dialog")).toBeUndefined()
})

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

test("Master Key selects visible terminals with their single-digit sidebar keys", async () => {
  await mount()
  await leader("c")
  const first = focusedTerminal()
  await leader("c")
  const second = focusedTerminal()
  expect(second).not.toBe(first)

  await key("b", true)
  expect(tui?.captureCharFrame()).toContain("[1]")
  expect(tui?.captureCharFrame()).toContain("[2]")
  await key("1")

  expect(focusedTerminal()).toBe(first)
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
})

test("Master Key Alt numbers select the five application tools", async () => {
  const selected: string[] = []
  await mount(false, 120, 30, { onSelectTool: (tool) => selected.push(tool) })
  await leader("c")
  for (const [number, expected] of [
    ["1", "database"],
    ["2", "git"],
    ["3", "runner"],
    ["4", "http"],
    ["5", "terminal"],
  ] as const) {
    await key("b", true)
    await act(async () => tui?.mockInput.pressKey(number, { meta: true }))
    await tui?.renderOnce()
    expect(selected.at(-1)).toBe(expected)
    expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  }
  expect(inputs.every((input) => input.length === 0)).toBe(true)
})

test("Master Key Alt tool selection works through the full application", async () => {
  await mount(false, 120, 30, {}, true)
  await leader("c")
  await key("b", true)
  await act(async () => tui?.mockInput.pressKey("1", { meta: true }))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("Banco")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
})

test("Master Key comma and Q invoke application actions without sending shell input", async () => {
  let settings = 0
  let quits = 0
  await mount(false, 120, 30, {
    onOpenSettings: () => settings++,
    onQuit: () => quits++,
  })
  await leader("c")
  await leader(",")
  expect(settings).toBe(1)
  await leader("q")
  expect(quits).toBe(1)
  expect(inputs[0]).toEqual([])
})

test("Master Key comma opens application settings from the terminal", async () => {
  await mount(true)
  await leader("c")
  await leader(",")
  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  expect(inputs[0]).toEqual([])
})

test("Master Key pins one global sidebar and returns it to the Terminal workspace", async () => {
  await mount(true)
  await leader("c")
  const workspace = tui!.renderer.root.findDescendantById("terminal-workspace")!
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(
    (tui!.renderer.root.findDescendantById("terminal-sidebar") as BoxRenderable).border,
  ).toEqual(["right"])
  expect(panes.screenX).toBeGreaterThan(workspace.screenX)
  await leader("b")
  expect(terminalSidebarSnapshot().pinned).toBe(true)
  expect(workspace.screenX).toBeGreaterThan(0)
  expect(panes.screenX).toBe(workspace.screenX)
  expect((tui!.renderer.root.findDescendantById("terminal-sidebar") as BoxRenderable).border).toBe(
    false,
  )
  await leader("b")
  expect(terminalSidebarSnapshot().pinned).toBe(false)
  expect(workspace.screenX).toBe(0)
  expect(panes.screenX).toBeGreaterThan(workspace.screenX)
})

test("pinned sidebar keeps the custom command dialog accessible", async () => {
  await mount(true)
  await leader("b")
  await click("terminal-sidebar-command")
  expect(tui?.renderer.root.findDescendantById("terminal-command-input")).toBeDefined()
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog")).toBeUndefined()
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

test("mouse wheel scrolls terminal history without sending input to the shell", async () => {
  await mount()
  await leader("c")
  const terminal = focusedTerminal()
  const output = Array.from({ length: 80 }, (_, index) => `history-${index}`).join("\r\n")
  await act(async () => starts[0]?.onData(new TextEncoder().encode(`${output}\r\n`)))
  await tui?.renderOnce()
  expect(terminal.screen().text).toContain("history-79")

  await act(async () => {
    await tui?.mockMouse.scroll(terminal.screenX + 2, terminal.screenY + 2, "up")
  })
  await tui?.renderOnce()
  expect(terminal.screen().text).not.toContain("history-79")
  expect(inputs[0]).toEqual([])
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
  await click(`terminal-sidebar-pane-${first.id.replace("free-terminal-", "")}`)
  expect(focusedTerminal()).toBe(first)
  await click(`terminal-sidebar-pane-${second.id.replace("free-terminal-", "")}`)
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

test("paired sidebar rows support mouse selection", async () => {
  await mount()
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
  const folder = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  expect(section.parent).toBe(folder.parent)
  const firstId = first.id.replace("free-terminal-", "")
  await click(`terminal-sidebar-pane-${firstId}`)
  expect(focusedTerminal()).toBe(first)
  expect(starts).toHaveLength(2)
})

test("legacy custom folders cannot return to the Terminal workspace", async () => {
  process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "1"
  saveTerminalWorkspaceState(processes.FREE_TERMINAL_WORKING_DIRECTORY, {
    folders: [{ id: "folder-7", name: "Services" }],
    assignments: {},
    collapsedFolderIds: [],
  })

  await mount()

  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-folder-7")).toBeUndefined()
  await leader("c")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-folder-7")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-new-folder")).toBeUndefined()
  expect(loadTerminalWorkspaceState(processes.FREE_TERMINAL_WORKING_DIRECTORY).folders).toEqual([])
})

test("session folders collapse, persist per project, and omit empty folders", async () => {
  process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "1"
  await mount()

  for (const id of ["terminal", "tmux", "others"])
    expect(tui?.renderer.root.findDescendantById(`terminal-sidebar-folder-${id}`)).toBeUndefined()

  await leader("c")
  const folder = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  expect(folder).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1")).toBeDefined()
  await click("terminal-sidebar-folder-terminal")
  expect(
    tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1"),
  ).toBeUndefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
  expect(tui?.captureCharFrame().split("\n")[folder.screenY]).toContain("▸ Tuiminais")
  expect(loadTerminalWorkspaceState(processes.FREE_TERMINAL_WORKING_DIRECTORY)).toMatchObject({
    collapsedFolderIds: ["terminal"],
  })

  await key("enter")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1")).toBeDefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
  expect(loadTerminalWorkspaceState(processes.FREE_TERMINAL_WORKING_DIRECTORY)).toMatchObject({
    collapsedFolderIds: [],
  })

  await key("enter")
  expect(
    tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1"),
  ).toBeUndefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")

  await click("terminal-sidebar-folder-terminal")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1")).toBeDefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
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
  expect(section.screenY).toBeGreaterThan(originalY)
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

test("removed Master Key actions are absent while new terminals stay in Tuiminais", async () => {
  await mount()
  await key("b", true)
  for (const action of ["t", "tab", "p", "f", "o", "m", "/"])
    expect(tui?.renderer.root.findDescendantById(`terminal-action-${action}`)).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-action-a")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-action-g")).toBeDefined()
  for (const action of ["m", "/"]) {
    await key(action)
    expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  }
  expect(tui?.renderer.root.findDescendantById("terminal-action-d")).toBeDefined()
  await key("escape")
  await leader("d")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog")).toBeUndefined()
  await click("terminal-sidebar-new")
  const owned = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  expect(section.parent).toBe(owned.parent)
  expect(starts).toHaveLength(1)
})

test("Live Diff polls every 250 ms beside an agent without restarting its terminal", async () => {
  const root = "/fixture/live-worktree"
  const secondRoot = "/fixture/another-project"
  const fingerprints = new Map<number, string>()
  const repository = spyOn(liveDiff, "liveDiffRepositoryRoot").mockImplementation(
    async (directory) => (directory === secondRoot ? secondRoot : root),
  )
  const worktrees = spyOn(liveDiff, "liveDiffWorktrees").mockImplementation(
    async (repositoryRoot) => [repositoryRoot],
  )
  const directories = spyOn(liveDiff, "readProcessDirectories").mockResolvedValue([])
  const read = spyOn(liveDiff, "readLiveDiffRoot").mockImplementation(async (repositoryRoot) => ({
    truncated: false,
    files:
      repositoryRoot === secondRoot
        ? [
            {
              root: secondRoot,
              path: "src/other.ts",
              additions: 1,
              deletions: 0,
              fingerprint: "other",
              untracked: false,
              newFile: false,
              headExists: true,
            },
          ]
        : Array.from({ length: 20 }, (_, index) => ({
            root,
            path: index ? `packages/file-${index}.ts` : "packages/terminal.ts",
            additions: 2,
            deletions: 1,
            fingerprint: fingerprints.get(index) ?? "first",
            untracked: false,
            newFile: index === 1,
            headExists: true,
          })),
  }))
  let patchContent = `diff --git a/packages/terminal.ts b/packages/terminal.ts\n--- a/packages/terminal.ts\n+++ b/packages/terminal.ts\n@@ -1 +1,41 @@\n-old\n+${"long_code_".repeat(20)}\n${Array.from({ length: 40 }, (_, index) => `+added_${index}\n`).join("")}`
  const patch = spyOn(liveDiff, "readLiveDiffPatch").mockImplementation(async () => patchContent)
  const projects = spyOn(liveDiffProjects, "discoverLiveDiffProjects").mockResolvedValue([
    { path: secondRoot, name: "another-project", parent: "fixture" },
  ])
  liveDiffSpies.push(repository, worktrees, directories, read, patch, projects)

  await mount()
  await leader("c")
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("free-terminal-", "")
  snapshot = [
    { pid: 101, parentPid: 1, executable: "sh", command: "sh" },
    { pid: 103, parentPid: 101, executable: "codex", command: "codex" },
  ]
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`terminal-agent-${sessionId}`)) break
  }
  expect(Boolean(tui?.renderer.root.findDescendantById(`terminal-agent-${sessionId}`))).toBe(true)
  await leader("d")
  expect(Boolean(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`))).toBe(true)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  expect(starts).toHaveLength(1)
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)) break
  }
  expect(tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("New")
  expect(tui?.captureCharFrame()).toContain("Live Diff · Show auto: true")
  const firstPolls = read.mock.calls.length
  for (let attempt = 0; attempt < 14 && read.mock.calls.length < firstPolls + 2; attempt++)
    await act(async () => Bun.sleep(50))
  expect(read.mock.calls.length).toBeGreaterThanOrEqual(firstPolls + 2)
  await click(`live-diff-file-${sessionId}-0`)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  const firstRow = tui!.renderer.root.findDescendantById(`live-diff-file-${sessionId}-0`)!
  const cells = firstRow.getChildren()
  for (let index = 1; index < cells.length; index += 1)
    expect(cells[index]!.screenX).toBe(cells[index - 1]!.screenX + cells[index - 1]!.width)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)) break
    await act(async () => Bun.sleep(25))
  }
  const nativeDiff = tui!.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)!
  expect((nativeDiff as DiffRenderable).wrapMode).toBe("none")
  expect(nativeDiff.height).toBeGreaterThan(8)
  expect(tui?.captureCharFrame()).toContain("Último:")
  expect(tui?.captureCharFrame()).toContain("/live-worktree")
  expect(tui?.captureCharFrame()).not.toContain("/fixture/live-worktree")
  const panel = tui!.renderer.root.findDescendantById(`live-diff-${sessionId}`)!
  const frame = tui!.renderer.root.findDescendantById(`terminal-pane-frame-${sessionId}`)!
  expect(panel.parent!.width).toBe(Math.round(frame.width * 0.48) - 14)
  const fileTable = tui!.renderer.root.findDescendantById(`live-diff-file-table-${sessionId}`)!
  const info = tui!.renderer.root.findDescendantById(`live-diff-info-${sessionId}`)!
  const totalsLabel = info.getChildren()[0]!.getChildren()[0]!
  const lastProjectLabel = info.getChildren()[0]!.getChildren()[1]!
  expect(totalsLabel.screenY).toBe(lastProjectLabel.screenY)
  expect(lastProjectLabel.screenX + lastProjectLabel.width).toBeGreaterThanOrEqual(
    info.screenX + info.width - 1,
  )
  expect(tui?.captureCharFrame()).not.toContain("Arquivos · 20")
  expect(tui?.captureCharFrame()).not.toContain("Info")
  const addProject = tui!.renderer.root.findDescendantById(`live-diff-add-${sessionId}`)!
  expect(addProject.screenY).toBeGreaterThan(fileTable.screenY + fileTable.height - 1)
  expect(tui?.captureCharFrame()).toContain("[A] Adicionar projeto")
  expect(tui?.captureCharFrame()).toContain("Observando:")
  const normalPanelWidth = panel.width
  const normalPanelHeight = panel.height
  const normalPreview = tui!.renderer.root.findDescendantById(`live-diff-preview-${sessionId}`)!
  const normalPreviewWidth = normalPreview.width
  const normalPreviewHeight = normalPreview.height
  const normalPreviewX = normalPreview.screenX
  const normalFileWidth = fileTable.width
  const normalFileHeight = fileTable.height
  const normalInfoWidth = info.width
  const normalInfoHeight = info.height
  await key("enter")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-preview-${sessionId}`)
  expect((nativeDiff as DiffRenderable).wrapMode).toBe("char")
  expect(panel.width).toBe(normalPanelWidth)
  expect(panel.height).toBe(normalPanelHeight)
  expect(normalPreview.width - normalPreviewWidth).toBe(30)
  expect(normalPreview.screenX).toBe(normalPreviewX - 30)
  expect(normalPreview.height).toBe(normalPreviewHeight)
  expect(fileTable.width).toBe(normalFileWidth)
  expect(fileTable.height).toBe(normalFileHeight)
  expect(info.width).toBe(normalInfoWidth)
  expect(info.height).toBe(normalInfoHeight)
  expect((tui?.captureCharFrame().match(/long_code_/g) ?? []).length).toBeGreaterThan(10)
  expect(tui?.captureCharFrame()).toContain("[Esc] Voltar à lista")
  const preview = tui!.renderer.root.findDescendantById(
    `live-diff-preview-${sessionId}`,
  ) as ScrollBoxRenderable
  await key("j")
  expect(preview.scrollTop).toBeGreaterThan(0)
  const afterLine = preview.scrollTop
  await key("l")
  expect(preview.scrollTop).toBeGreaterThan(afterLine)
  const afterHalfPage = preview.scrollTop
  await arrow("down")
  expect(preview.scrollTop).toBeGreaterThan(afterHalfPage)
  await arrow("right")
  const afterRight = preview.scrollTop
  await arrow("up")
  expect(preview.scrollTop).toBeLessThan(afterRight)
  const beforeLeft = preview.scrollTop
  await arrow("left")
  expect(preview.scrollTop).toBeLessThan(beforeLeft)
  const beforeK = preview.scrollTop
  await key("k")
  expect(preview.scrollTop).toBeLessThan(beforeK)
  const beforeH = preview.scrollTop
  await key("h")
  expect(preview.scrollTop).toBeLessThan(beforeH)
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await click(`live-diff-preview-${sessionId}`)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-preview-${sessionId}`)
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await key("j")
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/file-1.ts")
  expect(tui?.captureCharFrame()).toContain("Live Diff · Show auto: fals")
  await key("enter")
  expect(tui?.captureCharFrame()).toContain("[Esc] Ativar diff auto")
  await key("j")
  expect(preview.scrollTop).toBeGreaterThan(0)
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/terminal.ts")
  expect(tui?.captureCharFrame()).toContain("Live Diff · Show auto: true")
  expect(preview.scrollTop).toBe(0)
  const twoHunks = (first: string, second: string, oldFirst = "old first") =>
    `diff --git a/packages/terminal.ts b/packages/terminal.ts\n--- a/packages/terminal.ts\n+++ b/packages/terminal.ts\n@@ -1,32 +1,32 @@\n first context\n-${oldFirst}\n+${first}\n${Array.from({ length: 30 }, (_, index) => ` context_${index}\n`).join("")}@@ -70,3 +70,3 @@\n before\n-old second\n+${second}\n after\n`
  patchContent = twoHunks("new first", "new second")
  fingerprints.set(0, "hunk-one")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  const completeDiff = tui!.renderer.root.findDescendantById(
    `live-diff-code-${sessionId}`,
  ) as DiffRenderable
  const lineBackground = (line: number) =>
    (
      tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`) as
        | DiffRenderable
        | undefined
    )
      ?.getChildren()
      .find((child): child is LineNumberRenderable => child instanceof LineNumberRenderable)
      ?.getLineColors()
      .content.get(line)
      ?.toInts()
  expect(completeDiff.getHunkRowOffsets()).toHaveLength(2)
  expect(preview.scrollTop).toBeGreaterThan(0)
  expect(tui?.captureCharFrame()).toContain("new second")
  patchContent = twoHunks("newer first", "new second", "older first")
  fingerprints.set(0, "hunk-two")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(preview.scrollTop).toBe(0)
  expect(tui?.captureCharFrame()).toContain("newer first")
  expect(lineBackground(1)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(2)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(35)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  const code = completeDiff
    .getChildren()
    .flatMap((child) => child.getChildren())
    .find((child): child is CodeRenderable => child instanceof CodeRenderable)
  if (!code) throw new Error("Live Diff code renderable is missing")
  const shimmerEdge =
    RGBA.fromHex(COLORS.diffRecentBg)
      .toInts()
      .slice(0, 3)
      .reduce((sum, value) => sum + value, 0) > 420
      ? RGBA.fromHex("#496dad").toInts()
      : RGBA.fromHex("#9fe7ff").toInts()
  let sawShimmer = false
  for (let attempt = 0; attempt < 8 && !sawShimmer; attempt++) {
    await act(async () => Bun.sleep(60))
    await tui?.renderOnce()
    sawShimmer =
      tui
        ?.captureSpans()
        .lines[code.screenY + 2]?.spans.some(
          (span) => span.fg.toInts().join() === shimmerEdge.join(),
        ) ?? false
  }
  expect(sawShimmer).toBe(true)
  patchContent = twoHunks("newer first", "newer second", "older first")
  fingerprints.set(0, "hunk-three")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(preview.scrollTop).toBeGreaterThan(0)
  expect(tui?.captureCharFrame()).toContain("newer second")
  expect(lineBackground(1)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(2)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(35)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  await act(async () => Bun.sleep(1700))
  await tui?.renderOnce()
  expect(lineBackground(35)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  fingerprints.set(19, "second")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/file-19.ts")
  const reorderedList = tui!.renderer.root.findDescendantById(`live-diff-files-${sessionId}`)!
  const newestRow = tui!.renderer.root.findDescendantById(`live-diff-file-${sessionId}-0`)!
  expect(newestRow.screenY).toBeGreaterThanOrEqual(reorderedList.screenY)
  expect(newestRow.screenY).toBeLessThan(reorderedList.screenY + reorderedList.height)
  await click(`live-diff-file-${sessionId}-1`)
  await act(async () => Bun.sleep(50))
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/terminal.ts")
  for (let attempt = 0; attempt < 20; attempt++) {
    await tui?.renderOnce()
    if (lineBackground(35)?.join() === RGBA.fromHex(COLORS.diffRecentBg).toInts().join()) break
    await act(async () => Bun.sleep(25))
  }
  expect(lineBackground(2)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(35)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  fingerprints.set(18, "third")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/terminal.ts")
  await click(`live-diff-file-${sessionId}-0`)
  await act(async () => Bun.sleep(50))
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/file-18.ts")
  fingerprints.set(17, "fourth")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/file-17.ts")
  for (let index = 1; index < 20; index += 1) await key("j")
  await tui?.renderOnce()
  const list = tui!.renderer.root.findDescendantById(`live-diff-files-${sessionId}`)!
  const last = tui!.renderer.root.findDescendantById(`live-diff-file-${sessionId}-19`)!
  expect(last.screenY).toBeGreaterThanOrEqual(list.screenY)
  expect(last.screenY).toBeLessThan(list.screenY + list.height)
  await key("escape")
  expect(focusedTerminal()).toBe(terminal)
  const reads = read.mock.calls.length
  fingerprints.set(0, "fifth")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(read.mock.calls.length).toBeGreaterThan(reads)
  expect(focusedTerminal() === terminal).toBe(true)
  await click(`live-diff-add-${sessionId}`)
  expect(Boolean(tui?.renderer.root.findDescendantById("live-diff-project-picker"))).toBe(true)
  await key("escape")
  await click("live-diff-project-0")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await key("a")
  expect(Boolean(tui?.renderer.root.findDescendantById("live-diff-project-picker"))).toBe(true)
  for (let attempt = 0; attempt < 10; attempt++) {
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById("live-diff-project-option-0")) break
    await act(async () => Bun.sleep(10))
  }
  await text("another")
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    if (repository.mock.calls.some(([directory]) => directory === "/fixture/another-project")) break
  }
  expect(
    repository.mock.calls.some(([directory]) => directory === "/fixture/another-project"),
  ).toBe(true)
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById("live-diff-project-1")) break
  }
  const secondProject = tui!.renderer.root.findDescendantById(
    "live-diff-project-1",
  ) as BoxRenderable
  const firstProject = tui!.renderer.root.findDescendantById("live-diff-project-0") as BoxRenderable
  expect(secondProject).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("/another-project")
  expect(secondProject.screenY).toBe(firstProject.screenY + 1)
  expect(secondProject.backgroundColor.equals(RGBA.fromHex(COLORS.success))).toBe(true)
  await click("live-diff-project-1")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await key("n")
  expect(secondProject.backgroundColor.equals(RGBA.fromHex(COLORS.panelAlt))).toBe(true)
  expect(tui?.captureCharFrame()).toContain("20 arquivos")
  await key("n")
  expect(secondProject.backgroundColor.equals(RGBA.fromHex(COLORS.success))).toBe(true)
  expect(tui?.captureCharFrame()).toContain("21 arquivos")
  await key("h")
  await key("n")
  expect(tui?.captureCharFrame()).toContain("1 arquivos")
  await key("n")
  expect(tui?.captureCharFrame()).toContain("21 arquivos")
  snapshot = snapshot.slice(0, 1)
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (!tui?.renderer.root.findDescendantById(`terminal-agent-${sessionId}`)) break
  }
  expect(Boolean(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`))).toBe(true)
  const frozenReads = read.mock.calls.length
  await act(async () => Bun.sleep(650))
  expect(read.mock.calls.length).toBe(frozenReads)
  await click("live-diff-project-0")
  await key("x")
  expect(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`) === undefined).toBe(true)
  expect(focusedTerminal() === terminal).toBe(true)
  expect(starts).toHaveLength(1)
}, 16_000)

test("stacked Live Diff keeps its panel width and widens only the code area", async () => {
  const root = "/fixture/stacked-project"
  liveDiffSpies.push(
    spyOn(liveDiff, "liveDiffRepositoryRoot").mockResolvedValue(root),
    spyOn(liveDiff, "liveDiffWorktrees").mockResolvedValue([
      root,
      "/fixture/second-project",
      "/fixture/third-project",
      "/fixture/fourth-project",
    ]),
    spyOn(liveDiff, "readProcessDirectories").mockResolvedValue([]),
    spyOn(liveDiff, "readLiveDiffRoot").mockImplementation(async (repositoryRoot) => ({
      truncated: false,
      files: [
        {
          root: repositoryRoot,
          path: "src/code.ts",
          additions: 1,
          deletions: 0,
          fingerprint: "first",
          untracked: false,
          newFile: false,
          headExists: true,
        },
      ],
    })),
    spyOn(liveDiff, "readLiveDiffPatch").mockResolvedValue(
      `diff --git a/src/code.ts b/src/code.ts\n--- a/src/code.ts\n+++ b/src/code.ts\n@@ -1 +1 @@\n+${"long line ".repeat(30)}\n`,
    ),
  )
  await mount(false, 80, 30)
  await leader("c")
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("free-terminal-", "")
  snapshot = [
    { pid: 101, parentPid: 1, executable: "sh", command: "sh" },
    { pid: 103, parentPid: 101, executable: "codex", command: "codex" },
  ]
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`terminal-agent-${sessionId}`)) break
  }
  await leader("d")
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)) break
  }
  const panel = tui!.renderer.root.findDescendantById(`live-diff-${sessionId}`)!
  const frame = tui!.renderer.root.findDescendantById(`terminal-pane-frame-${sessionId}`)!
  expect(panel.parent!.width).toBe(frame.width - 14)
  const preview = tui!.renderer.root.findDescendantById(`live-diff-preview-${sessionId}`)!
  const files = tui!.renderer.root.findDescendantById(`live-diff-file-table-${sessionId}`)!
  const info = tui!.renderer.root.findDescendantById(`live-diff-info-${sessionId}`)!
  const projectChips = Array.from(
    { length: 4 },
    (_, index) => tui!.renderer.root.findDescendantById(`live-diff-project-${index}`)!,
  )
  expect(projectChips[0]!.screenY).toBe(projectChips[1]!.screenY)
  expect(projectChips[2]!.screenY).toBe(projectChips[3]!.screenY)
  expect(projectChips[2]!.screenY).toBe(projectChips[0]!.screenY + 1)
  expect(projectChips[2]!.screenX).toBe(
    tui!.renderer.root.findDescendantById(`live-diff-projects-${sessionId}`)!.screenX,
  )
  const footer = info.getChildren().at(-1)!
  const addProject = tui!.renderer.root.findDescendantById(`live-diff-add-${sessionId}`)!
  expect(addProject.screenY).toBe(footer.getChildren()[0]!.screenY)
  expect(info.screenY + info.height).toBeLessThanOrEqual(panel.screenY + panel.height)
  const normal = [
    panel.width,
    panel.height,
    preview.width,
    preview.height,
    files.width,
    files.height,
    info.width,
    info.height,
    terminal.parent!.width,
  ] as const
  await click(`live-diff-file-${sessionId}-0`)
  await key("enter")
  expect(panel.width).toBe(normal[0])
  expect(panel.height).toBe(normal[1])
  expect(preview.width - normal[2]).toBe(30)
  expect(preview.height).toBe(normal[3])
  expect(files.width).toBe(normal[4])
  expect(files.height).toBe(normal[5])
  expect(info.width).toBe(normal[6])
  expect(info.height).toBe(normal[7])
  expect(terminal.parent!.width).toBe(normal[8])
  await key("escape")
  expect(preview.width).toBe(normal[2])
}, 8_000)

test("narrow workspaces retain the sidebar, modal Escape and native input", async () => {
  await mount(true, 58, 18)
  await leader("c")
  const terminal = focusedTerminal()
  await click("terminal-sidebar-command")
  await key("escape")
  expect(focusedTerminal()).toBe(terminal)
  await act(async () => tui?.mockInput.typeText("echo fixture"))
  expect(inputs[0]?.join("")).toBe("echo fixture")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar")?.width).toBeGreaterThan(0)
})

test("new sections return to Tuiminais and keep the workspace session limit", async () => {
  await mount()
  await leader("c")
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

test("sidebar navigation switches among live sections without relaunching their processes", async () => {
  await mount()
  await leader("c")
  const first = focusedTerminal()
  await leader("c")
  const second = focusedTerminal()
  await click(`terminal-sidebar-pane-${first.id.replace("free-terminal-", "")}`)
  expect(focusedTerminal()).toBe(first)
  await click(`terminal-sidebar-pane-${second.id.replace("free-terminal-", "")}`)
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
