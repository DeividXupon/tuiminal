import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import type { EmbeddedTerminalRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { FreeTerminal } from "../../packages/feature-terminal/src/TerminalWorkspace"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import * as processes from "../../packages/feature-terminal/src/services/terminal"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"
import { AgentMonitor } from "../../packages/feature-terminal/src/services/agent-monitor"
import type { ProcessIdentity } from "../../packages/feature-terminal/src/model/agent-detection"
import { terminalSidebarSnapshot } from "../../packages/feature-terminal/src/model/pinned-sidebar"

const originalSettings = getUiSettings()
const encoder = new TextEncoder()
let tui: TestRendererSetup | undefined
let spawnSpy: ReturnType<typeof spyOn<typeof processes, "startFreeTerminalProcess">> | undefined
let inspectionSpy: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
const starts: Parameters<typeof processes.startFreeTerminalProcess>[1][] = []
let snapshot: ProcessIdentity[] = []
let setToolActive: ((value: boolean) => void) | undefined

function Fixture() {
  const [active, setActive] = useState(true)
  setToolActive = setActive
  return <FreeTerminal active={active} />
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  spawnSpy?.mockRestore()
  inspectionSpy?.mockRestore()
  starts.length = 0
  snapshot = []
  setToolActive = undefined
  updateUiSettings(originalSettings)
})

async function mount(readAgentPid?: () => Promise<number | null>, notifications = false) {
  updateUiSettings({ terminalMasterKey: "Ctrl+B", language: "pt-BR" })
  inspectionSpy = spyOn(inspection, "readTerminalProcesses").mockImplementation(
    async () => snapshot,
  )
  spawnSpy = spyOn(processes, "startFreeTerminalProcess").mockImplementation(
    (_command, options) => {
      starts.push(options)
      return {
        pid: 100 + starts.length,
        ...(readAgentPid ? { readAgentPid } : {}),
        write: () => undefined,
        resize: () => undefined,
        stop: async () => undefined,
      }
    },
  )
  tui = await testRender(
    notifications ? (
      <NotificationProvider>
        <Fixture />
      </NotificationProvider>
    ) : (
      <Fixture />
    ),
    { width: 120, height: 30 },
  )
  await tui.renderOnce()
}
async function leader(action: string) {
  await act(async () => {
    tui?.mockInput.pressKey("b", { ctrl: true })
  })
  await tui?.renderOnce()
  await act(async () => tui?.mockInput.pressKey(action))
  await tui?.renderOnce()
}
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 80; i++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (predicate()) return
  }
  throw new Error("Agent presentation did not settle")
}
async function output(text: string, index = 0) {
  await act(async () =>
    starts[index]?.onData(encoder.encode(`\x1b[2J\x1b[H${text.replaceAll("\n", "\r\n")}`)),
  )
  await tui?.renderOnce()
}
function isAgentState(terminalId: string, label: string) {
  const row = tui?.renderer.root.findDescendantById(
    `terminal-agent-${terminalId.replace("free-terminal-", "")}`,
  )
  return Boolean(row && tui?.captureCharFrame().split("\n")[row.screenY]?.includes(label))
}

// All data and process identities are fixture-owned; no installed agent or credentials are used.
test.each(["native", "tmux"])("%s Codex names hide MainThread", async (backend) => {
  await mount(backend === "tmux" ? async () => 456 : undefined)
  await leader("n")
  const terminal = tui!.renderer.currentFocusedRenderable!
  const sessionId = terminal.id.replace("free-terminal-", "")
  snapshot = [
    {
      pid: 466,
      parentPid: backend === "tmux" ? 456 : 101,
      executable: "MainThread",
      command: "node /opt/@openai/codex/bin/codex.js",
      foreground: true,
    },
  ]
  await output("› \n? for shortcuts")
  await waitFor(() => isAgentState(terminal.id, "Ocioso"))
  const lines = tui!.captureCharFrame().split("\n")
  expect(
    tui!.renderer.root.findDescendantById(`terminal-sidebar-pane-${sessionId}`),
  ).toBeUndefined()
  const agent = tui!.renderer.root.findDescendantById(`terminal-agent-${sessionId}`)!
  expect(lines[agent.screenY]).toContain("Codex")
  expect(lines[agent.screenY + 1]).toContain("codex")
  expect(tui!.captureCharFrame()).not.toContain("MainThread")
  expect(tui!.renderer.currentFocusedRenderable).toBe(terminal)
  expect(starts).toHaveLength(1)
})

test("tmux agents are detected beneath their pane shell rather than the embedded client", async () => {
  await mount(async () => 456)
  await leader("n")
  snapshot = [{ pid: 466, parentPid: 456, executable: "codex", command: "codex", foreground: true }]
  await output("• Reading files (2s • esc to interrupt)\n› \n? for shortcuts")
  await waitFor(() => Boolean(tui?.captureCharFrame().includes("Lendo")))
  expect(isAgentState(tui!.renderer.currentFocusedRenderable!.id, "Lendo")).toBe(true)
  expect(starts).toHaveLength(1)
})

test("task titles update existing agent rows, retain manual names and retire with the agent", async () => {
  await mount()
  await leader("n")
  const terminal = tui!.renderer.currentFocusedRenderable!
  const sessionId = terminal.id.replace("free-terminal-", "")
  const rowId = `terminal-agent-${sessionId}`
  const titleRow = () => {
    const row = tui?.renderer.root.findDescendantById(rowId)
    return row ? (tui!.captureCharFrame().split("\n")[row.screenY + 1] ?? "") : ""
  }
  snapshot = [{ pid: 101, parentPid: 1, executable: "sh", command: "sh" }]
  await waitFor(() => {
    const row = tui?.renderer.root.findDescendantById(`terminal-sidebar-pane-${sessionId}`)
    return Boolean(row && tui!.captureCharFrame().split("\n")[row.screenY]?.includes("sh"))
  })
  await leader("e")
  await act(async () => {
    tui?.mockInput.pressKey("END")
    tui?.mockInput.pressBackspace()
    tui?.mockInput.pressBackspace()
    tui?.mockInput.typeText("Manual terminal")
  })
  await tui?.renderOnce()
  await act(async () => tui?.mockInput.pressEnter())
  await tui?.renderOnce()
  snapshot = [{ pid: 111, parentPid: 101, executable: "claude", command: "claude" }]
  // Exercise incremental OSC bytes through the actual observer and metadata hook.
  await output("\x1b]2;✳ Fix ")
  await act(async () => starts[0]?.onData(encoder.encode("login\x07")))
  await waitFor(() => titleRow().includes("Fix login"))
  const row = tui!.renderer.root.findDescendantById(rowId)!
  expect(tui!.renderer.currentFocusedRenderable).toBe(terminal)
  expect(
    tui!.renderer.root.findDescendantById(`terminal-sidebar-pane-${sessionId}`),
  ).toBeUndefined()
  expect(isAgentState(terminal.id, "Ocioso")).toBe(true)
  await output("\x1b]0;✳ Add tests\x1b\\")
  await waitFor(() => titleRow().includes("Add tests"))
  expect(isAgentState(terminal.id, "Ocioso")).toBe(true)
  expect(tui!.renderer.root.findDescendantById(rowId)).toBe(row)
  expect(tui!.renderer.currentFocusedRenderable).toBe(terminal)
  expect(starts).toHaveLength(1)
  snapshot = []
  await waitFor(() => !tui?.renderer.root.findDescendantById(rowId))
  const shellRow = tui!.renderer.root.findDescendantById(`terminal-sidebar-pane-${sessionId}`)!
  expect(tui!.captureCharFrame().split("\n")[shellRow.screenY]).toContain("Manual termi")
  snapshot = [{ pid: 112, parentPid: 101, executable: "opencode", command: "opencode" }]
  await waitFor(() => Boolean(tui?.renderer.root.findDescendantById(rowId)))
  expect(titleRow()).toContain("Manual terminal")
  expect(titleRow()).not.toContain("Add tests")
  await output("\x1b]2;OC | New task\x07")
  await waitFor(() => titleRow().includes("New task"))
  await output("\x1b]2;OpenCode\x07")
  await waitFor(() => titleRow().includes("Manual terminal"))
  expect(starts).toHaveLength(1)
}, 20_000)

test("states continue offscreen, preserve the pane and acknowledge a finished turn on return", async () => {
  await mount()
  await leader("n")
  const first = tui?.renderer.currentFocusedRenderable as EmbeddedTerminalRenderable
  snapshot = [{ pid: 111, parentPid: 101, executable: "codex", command: "codex", foreground: true }]
  await output("• Reading files (2s • esc to interrupt)\n› \n? for shortcuts")
  await waitFor(() => Boolean(tui?.captureCharFrame().includes("Lendo")))
  await leader("n")
  await output("› Make changes\nAllow command?\nPress enter to confirm or esc to cancel")
  await waitFor(() => isAgentState(first.id, "!"))
  await output("• Writing files (3s • esc to interrupt)\n› ")
  await waitFor(() => isAgentState(first.id, "Escrevendo"))
  await output("• Finished the task\n› \n? for shortcuts")
  await waitFor(() => isAgentState(first.id, "✓"))
  const agentRow = tui?.renderer.root.findDescendantById(
    `terminal-agent-${first.id.replace("free-terminal-", "")}`,
  )
  expect(agentRow).toBeDefined()
  await act(async () => tui?.mockMouse.click(agentRow!.screenX + 1, agentRow!.screenY))
  await waitFor(() => Boolean(tui?.captureCharFrame().includes("Ocioso")))
  expect(tui?.renderer.currentFocusedRenderable).toBe(first)
  expect(starts).toHaveLength(2)
  snapshot = []
  await waitFor(() => !tui?.renderer.root.findDescendantById(agentRow!.id))
  expect(starts).toHaveLength(2)
}, 20_000)

test("background attention notifies once and clicking opens the exact agent pane", async () => {
  await mount(undefined, true)
  await leader("n")
  const first = tui!.renderer.currentFocusedRenderable as EmbeddedTerminalRenderable
  snapshot = [
    { pid: 111, parentPid: 101, executable: "qwen-code", command: "qwen-code", foreground: true },
  ]
  await output("◐ Working\n⠋ Searching (2s · esc to cancel)")
  await waitFor(() => isAgentState(first.id, "Pesquisando"))
  await leader("n")
  const second = tui!.renderer.currentFocusedRenderable
  await output("Allow execution of: shell\nYes, allow once")
  await waitFor(() => tui!.captureCharFrame().includes("Aguardando você · Terminal"))
  expect(tui!.renderer.currentFocusedRenderable).toBe(second)
  expect(tui!.captureCharFrame()).toContain("Qwen Code")
  const card = tui!.renderer.root.findDescendantById("app-notification-1")!
  await act(async () => tui?.mockMouse.click(card.screenX + 3, card.screenY + 1))
  expect(terminalSidebarSnapshot().requestedTarget).toEqual({
    sessionId: first.id.replace("free-terminal-", ""),
  })
  await waitFor(() => tui!.renderer.currentFocusedRenderable === first)
  await output("⠋ Searching (3s · esc to cancel)")
  await waitFor(() => isAgentState(first.id, "Pesquisando"))
  await leader("n")
  await output("> Type your message")
  await waitFor(() => tui!.captureCharFrame().includes("Concluído · Terminal"))
  expect(tui!.renderer.currentFocusedRenderable).not.toBe(first)
}, 20_000)

test("a visible agent blocker changes its row without a redundant notification", async () => {
  await mount(undefined, true)
  await leader("n")
  const terminal = tui!.renderer.currentFocusedRenderable!
  snapshot = [
    { pid: 111, parentPid: 101, executable: "qwen-code", command: "qwen-code", foreground: true },
  ]
  await output("⠋ Searching (2s · esc to cancel)")
  await waitFor(() => isAgentState(terminal.id, "Pesquisando"))
  await output("Allow execution of: shell\nYes, allow once")
  await waitFor(() => isAgentState(terminal.id, "Aguardando"))
  expect(tui!.captureCharFrame()).not.toContain("Aguardando você · Terminal")
  expect(tui!.renderer.currentFocusedRenderable).toBe(terminal)
}, 15_000)

test("observer screens support native cursor erasure, resize and repeated disposal", () => {
  const observer = new AgentMonitor(80, 24)
  try {
    observer.write(encoder.encode("\x1b[2J\x1b[HAllow command?"))
    expect(observer.screen()).toContain("Allow command?")
    observer.write(encoder.encode("\x1b[H\x1b[2KReady"))
    expect(observer.screen()).toContain("Ready")
    expect(observer.screen()).not.toContain("Allow command?")
    observer.resize(40, 12)
    expect(observer.screen()).toContain("Ready")
  } finally {
    observer.dispose()
    observer.dispose()
  }
  expect(observer.screen()).toBe("")
})

test("OSC status survives a tool switch and stale process snapshots cannot restore a closed agent", async () => {
  await mount()
  await leader("n")
  const terminalId = tui!.renderer.currentFocusedRenderable!.id
  const agentId = `terminal-agent-${terminalId.replace("free-terminal-", "")}`
  snapshot = [{ pid: 111, parentPid: 101, executable: "codex", command: "codex" }]
  await output("\x1b]2;⠋ project\x07")
  await waitFor(() => isAgentState(terminalId, "Trabalhando"))
  await act(async () => setToolActive?.(false))
  await output("\x1b]2;project\x07")
  await waitFor(() => isAgentState(terminalId, "✓"))
  await act(async () => setToolActive?.(true))
  await waitFor(() => Boolean(tui?.captureCharFrame().includes("Ocioso")))
  let finish: ((value: ProcessIdentity[]) => void) | undefined
  inspectionSpy?.mockImplementation(
    (signal) =>
      new Promise((resolve) => {
        finish = resolve
        signal.addEventListener("abort", () => resolve([]), { once: true })
      }),
  )
  await waitFor(() => finish !== undefined)
  await leader("x")
  await act(async () => finish?.(snapshot))
  await tui?.renderOnce()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-ai")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById(agentId)).toBeUndefined()
}, 15_000)
