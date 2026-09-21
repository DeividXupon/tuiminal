import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { rmSync } from "node:fs"
import type { DiffRenderable, EmbeddedTerminalRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import type { ProcessIdentity } from "../../packages/feature-terminal/src/model/agent-detection"
import {
  resetPinnedTerminalSidebarForTests,
  terminalSidebarSnapshot,
} from "../../packages/feature-terminal/src/model/pinned-sidebar"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"
import * as liveDiff from "../../packages/feature-terminal/src/services/live-diff"
import * as processes from "../../packages/feature-terminal/src/services/terminal"
import {
  loadTerminalWorkspaceState,
  saveTerminalWorkspaceState,
  terminalWorkspaceStatePath,
} from "../../packages/feature-terminal/src/services/terminal-workspace-state"
import { FreeTerminal } from "../../packages/feature-terminal/src/TerminalWorkspace"

const originalSettings = getUiSettings()
const originalOnlyTab = process.env.TUIMINAL_ONLY_TAB
const originalWorkspaceState = process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
let tui: TestRendererSetup | undefined
let spawnSpy: ReturnType<typeof spyOn<typeof processes, "startFreeTerminalProcess">> | undefined
let inspectionSpy: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
const liveDiffSpies: Array<{ mockRestore: () => void }> = []
const inputs: string[][] = []
const starts: Parameters<typeof processes.startFreeTerminalProcess>[1][] = []
let snapshot: ProcessIdentity[] = []

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  spawnSpy?.mockRestore()
  inspectionSpy?.mockRestore()
  for (const spy of liveDiffSpies.splice(0)) spy.mockRestore()
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
  for (const action of ["t", "tab", "p", "a", "f", "o"])
    expect(tui?.renderer.root.findDescendantById(`terminal-action-${action}`)).toBeUndefined()
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

test("Live Diff polls every 500 ms beside an agent without restarting its terminal", async () => {
  const root = "/fixture/live-worktree"
  const fingerprints = new Map<number, string>()
  const repository = spyOn(liveDiff, "liveDiffRepositoryRoot").mockResolvedValue(root)
  const worktrees = spyOn(liveDiff, "liveDiffWorktrees").mockResolvedValue([root])
  const directories = spyOn(liveDiff, "readProcessDirectories").mockResolvedValue([])
  const read = spyOn(liveDiff, "readLiveDiffRoot").mockImplementation(async () => ({
    truncated: false,
    files: Array.from({ length: 20 }, (_, index) => ({
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
  liveDiffSpies.push(repository, worktrees, directories, read, patch)

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
  expect(focusedTerminal() === terminal).toBe(true)
  expect(starts).toHaveLength(1)
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.captureCharFrame().includes("packages/terminal.ts")) break
  }
  expect(tui?.captureCharFrame()).toContain("packages/terminal.ts")
  expect(tui?.captureCharFrame()).toContain("New")
  expect(tui?.captureCharFrame()).toContain("Show diff auto: true")
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
  expect((nativeDiff as DiffRenderable).wrapMode).toBe("char")
  expect(nativeDiff.height).toBeGreaterThan(8)
  expect((tui?.captureCharFrame().match(/long_code_/g) ?? []).length).toBeGreaterThan(10)
  await key("enter")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-preview-${sessionId}`)
  expect(tui?.captureCharFrame()).toContain("◆ live-worktree")
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
  expect(tui?.captureCharFrame()).not.toContain("◆ live-worktree")
  await click(`live-diff-preview-${sessionId}`)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-preview-${sessionId}`)
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await key("j")
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/file-1.ts")
  expect(tui?.captureCharFrame()).toContain("Show diff auto: false")
  await key("enter")
  expect(tui?.captureCharFrame()).toContain("[Esc] Ativar diff auto")
  await key("j")
  expect(preview.scrollTop).toBeGreaterThan(0)
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/terminal.ts")
  expect(tui?.captureCharFrame()).toContain("Show diff auto: true")
  expect(preview.scrollTop).toBe(0)
  const twoHunks = (first: string, second: string) =>
    `diff --git a/packages/terminal.ts b/packages/terminal.ts\n--- a/packages/terminal.ts\n+++ b/packages/terminal.ts\n@@ -1,32 +1,32 @@\n first context\n-old first\n+${first}\n${Array.from({ length: 30 }, (_, index) => ` context_${index}\n`).join("")}@@ -70,3 +70,3 @@\n before\n-old second\n+${second}\n after\n`
  patchContent = twoHunks("new first", "new second")
  fingerprints.set(0, "hunk-one")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  const completeDiff = tui!.renderer.root.findDescendantById(
    `live-diff-code-${sessionId}`,
  ) as DiffRenderable
  expect(completeDiff.getHunkRowOffsets()).toHaveLength(2)
  expect(preview.scrollTop).toBeGreaterThan(0)
  expect(tui?.captureCharFrame()).toContain("new second")
  patchContent = twoHunks("newer first", "new second")
  fingerprints.set(0, "hunk-two")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(preview.scrollTop).toBe(0)
  expect(tui?.captureCharFrame()).toContain("newer first")
  patchContent = twoHunks("newer first", "newer second")
  fingerprints.set(0, "hunk-three")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(preview.scrollTop).toBeGreaterThan(0)
  expect(tui?.captureCharFrame()).toContain("newer second")
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
  expect(Boolean(tui?.renderer.root.findDescendantById("terminal-dialog"))).toBe(true)
  await key("escape")
  await click(`live-diff-add-${sessionId}`)
  await text("/fixture/another-project")
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    if (repository.mock.calls.some(([directory]) => directory === "/fixture/another-project")) break
  }
  expect(
    repository.mock.calls.some(([directory]) => directory === "/fixture/another-project"),
  ).toBe(true)
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
  await click(`live-diff-close-${sessionId}`)
  expect(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`) === undefined).toBe(true)
  expect(focusedTerminal() === terminal).toBe(true)
  expect(starts).toHaveLength(1)
}, 16_000)

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
