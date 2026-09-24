import "./setup"
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { FreeTerminal } from "../../packages/feature-terminal/src/TerminalWorkspace"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import * as discovery from "../../packages/feature-terminal/src/services/tmux-agents"
import * as backend from "../../packages/feature-terminal/src/services/terminal-backend"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"

type Discovered = Awaited<ReturnType<typeof discovery.discoverTmuxWorkspace>>
const originalSettings = getUiSettings()
const originalAuto = process.env.TUIMINAL_TERMINAL_AUTO_MIRROR
const originalRestore = process.env.TUIMINAL_TERMINAL_RESTORE
let tui: TestRendererSetup | undefined
const restores: Array<() => void> = []
let changeTab: (active: boolean) => void = () => {}
function Fixture() {
  const [active, setActive] = useState(true)
  changeTab = setActive
  return (
    <box style={{ flexGrow: 1 }}>
      <box visible={active} style={{ flexGrow: 1 }}>
        <FreeTerminal active={active} />
      </box>
      <box visible={!active} style={{ flexGrow: 1 }}>
        <text content="GIT_FIXTURE" />
      </box>
    </box>
  )
}
function agent(index: number): Discovered["panes"][number] {
  return {
    pane: {
      socket: "/tmp/fixture.sock",
      sessionId: "$0",
      name: "agents",
      windowId: "@1",
      windowIndex: 1,
      windowName: "review",
      paneId: `%${index}`,
      paneIndex: index,
      panePid: 100 + index,
      command: "node",
      cwd: "/tmp/project",
    },
    agent: { key: `${200 + index}:codex`, label: "Codex", profile: "codex" },
  }
}
function ordinary(index: number, ownedByTuiminal = false): Discovered["panes"][number] {
  const entry = agent(index)
  return {
    pane: {
      ...entry.pane,
      name: ownedByTuiminal ? "terminal-owned" : "external-shells",
      command: "zsh",
      ownedByTuiminal,
    },
    agent: null,
  }
}
afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  for (const restore of restores.splice(0)) restore()
  updateUiSettings(originalSettings)
  if (originalAuto === undefined) delete process.env.TUIMINAL_TERMINAL_AUTO_MIRROR
  else process.env.TUIMINAL_TERMINAL_AUTO_MIRROR = originalAuto
  if (originalRestore === undefined) delete process.env.TUIMINAL_TERMINAL_RESTORE
  else process.env.TUIMINAL_TERMINAL_RESTORE = originalRestore
})

async function mount(initial: Discovered["panes"] = [], enabled = true) {
  process.env.TUIMINAL_TERMINAL_AUTO_MIRROR = enabled ? "1" : "0"
  process.env.TUIMINAL_TERMINAL_RESTORE = "1"
  updateUiSettings({ language: "pt-BR", terminalMasterKey: "Ctrl+B" })
  let snapshot = initial
  const scan = spyOn(discovery, "discoverTmuxWorkspace").mockImplementation(async () => ({
    available: true,
    panes: snapshot,
  }))
  const processes = spyOn(inspection, "readTerminalProcesses").mockImplementation(async () =>
    snapshot.flatMap(({ pane, agent }, index) =>
      agent
        ? [
            {
              pid: 200 + index,
              parentPid: pane.panePid!,
              executable: "codex",
              command: "codex",
              foreground: true,
            },
          ]
        : [
            {
              pid: pane.panePid!,
              parentPid: 1,
              executable: "zsh",
              command: "zsh",
              foreground: true,
            },
          ],
    ),
  )
  const stop = mock(async () => {})
  const start = spyOn(backend, "startWorkspaceTerminal").mockImplementation(
    async (command, options) => {
      options.onData(
        new TextEncoder().encode(
          command.tmux ? `EXISTING_AGENT_${command.tmux.paneId}` : "LOCAL_SHELL",
        ),
      )
      const pid =
        snapshot.find(({ pane }) => pane.paneId === command.tmux?.paneId)?.pane.panePid ?? 500
      return {
        pid,
        backend: command.tmux ? "tmux" : "native",
        stop,
        write: () => {},
        resize: () => {},
        readAgentPid: async () => pid,
      }
    },
  )
  restores.push(
    () => scan.mockRestore(),
    () => processes.mockRestore(),
    () => start.mockRestore(),
  )
  tui = await testRender(<Fixture />, { width: 120, height: 30 })
  await tui.renderOnce()
  return {
    scan,
    start,
    stop,
    setAgents: (agents: Discovered["panes"]) => {
      snapshot = agents
    },
  }
}
async function waitFor(predicate: () => boolean) {
  for (let step = 0; step < 200; step++) {
    await act(async () => Bun.sleep(25))
    await tui?.renderOnce()
    if (predicate()) return
  }
  throw new Error("Automatic mirror fixture did not settle")
}
async function leader(key: string) {
  await act(async () => tui?.mockInput.pressKey("b", { ctrl: true }))
  await act(async () => tui?.mockInput.pressKey(key))
  await tui?.renderOnce()
}

test("existing agents appear automatically with current content and no manual picker", async () => {
  const { start, scan } = await mount([agent(1), agent(2)])
  await waitFor(() => start.mock.calls.length === 2)
  expect(start.mock.calls.map(([command]) => command.tmux?.paneId)).toEqual(["%1", "%2"])
  expect(
    start.mock.calls.every(([command]) => command.autoMirror && command.command.length === 0),
  ).toBe(true)
  expect(tui?.captureCharFrame()).toContain("EXISTING_AGENT_%1")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-tmux")).toBeUndefined()
  await waitFor(
    () => tui?.renderer.currentFocusedRenderable?.id.startsWith("free-terminal-") ?? false,
  )
  const sessionId = tui!.renderer.currentFocusedRenderable!.id.replace("free-terminal-", "")
  await waitFor(() => Boolean(tui?.renderer.root.findDescendantById(`terminal-agent-${sessionId}`)))
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-ai")).toBeUndefined()
  expect(
    tui!.renderer.root.findDescendantById("terminal-sidebar-section-auto-tmux-1"),
  ).toBeUndefined()
  expect(
    tui!.renderer.root.findDescendantById(`terminal-sidebar-pane-${sessionId}`),
  ).toBeUndefined()
  await waitFor(() => scan.mock.calls.length >= 2)
  expect(start).toHaveBeenCalledTimes(2)
})

test("restores owned panes in Tuiminais and groups ordinary external panes under tmux", async () => {
  const { start } = await mount([ordinary(1, true), ordinary(2), agent(3)])
  await waitFor(() => start.mock.calls.length === 3)
  await waitFor(() => /Agentes\s+1/.test(tui?.captureCharFrame() ?? ""))
  const frame = tui!.captureCharFrame()
  expect(tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")).toBeDefined()
  expect(tui!.renderer.root.findDescendantById("terminal-sidebar-folder-tmux")).toBeDefined()
  expect(tui!.renderer.root.findDescendantById("terminal-sidebar-folder-others")).toBeUndefined()
  expect(frame).toContain("Tuiminais")
  expect(frame).toMatch(/Terminais\s+2/)
  expect(frame).toMatch(/Agentes\s+1/)
})

test("new agents preserve local terminal focus and remain hidden behind Git", async () => {
  const { start, setAgents } = await mount()
  await leader("n")
  await waitFor(
    () => tui?.renderer.currentFocusedRenderable?.id.startsWith("free-terminal-") ?? false,
  )
  const focused = tui?.renderer.currentFocusedRenderable
  setAgents([agent(1)])
  await waitFor(() => start.mock.calls.length === 2)
  expect(tui?.renderer.currentFocusedRenderable).toBe(focused)
  expect(tui?.captureCharFrame()).toContain("LOCAL_SHELL")
  await act(async () => changeTab(false))
  setAgents([agent(1), agent(2)])
  await waitFor(() => start.mock.calls.length === 3)
  expect(tui?.captureCharFrame()).toContain("GIT_FIXTURE")
  expect(tui?.captureCharFrame()).not.toContain("EXISTING_AGENT")
}, 15_000)

test("automatic arrivals cannot steal a command dialog's focus", async () => {
  const { start, setAgents } = await mount()
  const command = tui?.renderer.root.findDescendantById("terminal-sidebar-command")
  if (!command) throw new Error("Missing command control")
  await act(async () => tui?.mockMouse.click(command.screenX + 1, command.screenY))
  const focused = tui?.renderer.currentFocusedRenderable
  setAgents([agent(1)])
  await waitFor(() => start.mock.calls.length === 1)
  expect(tui?.renderer.currentFocusedRenderable).toBe(focused)
  expect(tui?.renderer.root.findDescendantById("terminal-command-input")).toBeDefined()
})

test("closing an automatic mirror suppresses rediscovery for this run", async () => {
  const { scan, start, stop } = await mount([agent(1)])
  await waitFor(() => start.mock.calls.length === 1)
  await leader("x")
  const scans = scan.mock.calls.length
  await waitFor(() => scan.mock.calls.length > scans)
  expect(start).toHaveBeenCalledTimes(1)
  expect(stop).toHaveBeenCalledTimes(1)
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-tmux")).toBeUndefined()
})

test("automatic discovery deduplicates panes and respects the workspace limit", async () => {
  const { start, setAgents } = await mount()
  setAgents(Array.from({ length: 14 }, (_, index) => agent(index + 1)))
  await waitFor(() => start.mock.calls.length === 12)
  const targets = start.mock.calls.map(([command]) => command.tmux?.paneId)
  expect(new Set(targets).size).toBe(12)
  expect(targets.filter((pane) => pane === "%1")).toHaveLength(1)
})

test("unmount cancels discovery and late results cannot launch mirrors", async () => {
  const { scan, start } = await mount()
  const pending = Promise.withResolvers<Discovered>()
  let signal: AbortSignal | undefined
  scan.mockImplementation((input) => {
    signal = input
    return pending.promise
  })
  await waitFor(() => signal !== undefined)
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  expect(signal?.aborted).toBe(true)
  await act(async () => pending.resolve({ available: true, panes: [agent(1)] }))
  expect(start).not.toHaveBeenCalled()
})

test("the external opt-out still restores panes owned by Tuiminal", async () => {
  const { scan, start } = await mount([agent(1), ordinary(2, true)], false)
  expect(scan).toHaveBeenCalled()
  await waitFor(() => start.mock.calls.length === 1)
  expect(start.mock.calls[0]?.[0].tmux?.paneId).toBe("%2")
  await leader("n")
  expect(start.mock.calls[1]?.[0].tmux).toBeUndefined()
})
