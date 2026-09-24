import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { FreeTerminal } from "../../packages/feature-terminal/src/TerminalWorkspace"
import * as backend from "../../packages/feature-terminal/src/services/terminal-backend"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"
import type { ProcessIdentity } from "../../packages/feature-terminal/src/model/agent-detection"

const originalSettings = getUiSettings()
let tui: TestRendererSetup | undefined
let start: ReturnType<typeof spyOn<typeof backend, "startWorkspaceTerminal">> | undefined
let inspect: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
let snapshot: ProcessIdentity[] = []
let launches = 0

afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  start?.mockRestore()
  inspect?.mockRestore()
  snapshot = []
  launches = 0
  updateUiSettings(originalSettings)
})

function processes(root: number, tool?: string): ProcessIdentity[] {
  const shell: ProcessIdentity = {
    pid: root,
    parentPid: 1,
    executable: "/bin/zsh",
    command: "zsh",
    foreground: !tool,
  }
  return tool
    ? [
        shell,
        { pid: root + 10, parentPid: root, executable: tool, command: tool, foreground: true },
      ]
    : [shell]
}

async function mount(mirrorRoot?: number) {
  updateUiSettings({ terminalMasterKey: "Ctrl+B", language: "pt-BR" })
  inspect = spyOn(inspection, "readTerminalProcesses").mockImplementation(async () => snapshot)
  start = spyOn(backend, "startWorkspaceTerminal").mockImplementation(async () => ({
    pid: 100 + ++launches,
    backend: mirrorRoot ? "tmux" : "native",
    ...(mirrorRoot ? { readAgentPid: async () => mirrorRoot } : {}),
    write: () => {},
    resize: () => {},
    stop: async () => {},
  }))
  tui = await testRender(<FreeTerminal active />, { width: 120, height: 30 })
  await tui.renderOnce()
}

async function leader(action: string) {
  await act(async () => tui?.mockInput.pressKey("b", { ctrl: true }))
  await tui?.renderOnce()
  await act(async () => tui?.mockInput.pressKey(action))
  await tui?.renderOnce()
}

async function waitFor(predicate: () => boolean) {
  for (let step = 0; step < 100; step++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (predicate()) return
  }
  throw new Error("Terminal process title did not update")
}

function rowTitle(terminalId: string) {
  const row = tui?.renderer.root.findDescendantById(
    terminalId.replace("free-terminal-", "terminal-sidebar-pane-"),
  )
  return row ? (tui?.captureCharFrame().split("\n")[row.screenY] ?? "") : ""
}

test("tool names follow a live shell and manual names survive later commands", async () => {
  await mount()
  await leader("n")
  const terminal = tui!.renderer.currentFocusedRenderable!
  snapshot = processes(101, "lazygit")
  await waitFor(
    () => rowTitle(terminal.id).includes("lazygit") && rowTitle(terminal.id).includes("Executan"),
  )
  expect(tui!.renderer.currentFocusedRenderable).toBe(terminal)
  expect(launches).toBe(1)
  snapshot = processes(101)
  await waitFor(
    () => rowTitle(terminal.id).includes("zsh") && rowTitle(terminal.id).includes("Ocioso"),
  )
  expect(tui!.renderer.currentFocusedRenderable).toBe(terminal)
  await leader("e")
  await act(async () => {
    tui?.mockInput.pressKey("END")
    for (let i = 0; i < "zsh".length; i++) tui?.mockInput.pressBackspace()
    tui?.mockInput.typeText("Review")
  })
  await tui?.renderOnce()
  await act(async () => tui?.mockInput.pressEnter())
  await tui?.renderOnce()
  expect(rowTitle(terminal.id)).toContain("Review")
  snapshot = processes(101, "nvim")
  const scans = inspect!.mock.calls.length
  await waitFor(() => inspect!.mock.calls.length > scans)
  expect(rowTitle(terminal.id)).toContain("Review")
  expect(tui!.renderer.currentFocusedRenderable).toBe(terminal)
  expect(launches).toBe(1)
}, 20_000)

test("tmux names follow the mirrored pane instead of its local client or sibling panes", async () => {
  await mount(501)
  await leader("n")
  const terminal = tui!.renderer.currentFocusedRenderable!
  snapshot = [...processes(101, "tmux"), ...processes(501, "lazygit"), ...processes(601, "nvim")]
  await waitFor(() => rowTitle(terminal.id).includes("lazygit"))
  expect(rowTitle(terminal.id)).not.toContain("tmux")
  expect(rowTitle(terminal.id)).not.toContain("nvim")
  expect(tui!.renderer.currentFocusedRenderable).toBe(terminal)
  expect(launches).toBe(1)
})
