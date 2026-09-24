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

const originalSettings = getUiSettings()
const originalAuto = process.env.TUIMINAL_TERMINAL_AUTO_MIRROR
let tui: TestRendererSetup | undefined
const restores: Array<() => void> = []
let changeTab: (terminal: boolean) => void = () => {}
function Fixture() {
  const [terminal, setTerminal] = useState(true)
  changeTab = setTerminal
  return (
    <box style={{ flexGrow: 1 }}>
      <box visible={terminal} style={{ flexGrow: 1 }}>
        <FreeTerminal active={terminal} />
      </box>
      <box visible={!terminal} style={{ flexGrow: 1 }}>
        <text content="Git fixture" />
      </box>
    </box>
  )
}

afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  for (const restore of restores.splice(0)) restore()
  updateUiSettings(originalSettings)
  if (originalAuto === undefined) delete process.env.TUIMINAL_TERMINAL_AUTO_MIRROR
  else process.env.TUIMINAL_TERMINAL_AUTO_MIRROR = originalAuto
})

async function mount(available = true) {
  process.env.TUIMINAL_TERMINAL_AUTO_MIRROR = "1"
  updateUiSettings({ language: "pt-BR", terminalMasterKey: "Ctrl+B" })
  const find = spyOn(discovery, "discoverTmuxWorkspace").mockResolvedValue({
    available,
    panes: available
      ? [
          {
            pane: {
              socket: "/tmp/fixture.sock",
              sessionId: "$1",
              name: "Agente externo",
              panePid: 55,
              windowId: "@3",
              windowIndex: 3,
              windowName: "codex",
              paneId: "%6",
              paneIndex: 0,
              command: "node",
              cwd: "/tmp/project",
            },
            agent: null,
          },
        ]
      : [],
  })
  const scan = spyOn(inspection, "readTerminalProcesses").mockResolvedValue([])
  const stop = mock(async () => {})
  const mirrorResize = mock((_columns: number, _rows: number) => {})
  let emit: ((data: Uint8Array) => void) | undefined
  const start = spyOn(backend, "startWorkspaceTerminal").mockImplementation(
    async (command, options) => {
      emit = options.onData
      return {
        pid: 123,
        backend: "tmux",
        stop,
        write: () => {},
        resize: command.tmux ? mirrorResize : () => {},
      }
    },
  )
  restores.push(
    () => find.mockRestore(),
    () => scan.mockRestore(),
    () => start.mockRestore(),
  )
  tui = await testRender(<Fixture />, { width: 120, height: 30 })
  await tui.renderOnce()
  return {
    find,
    stop,
    start,
    mirrorResize,
    output: (text: string) => emit?.(new TextEncoder().encode(text)),
  }
}

async function waitForMirrors(start: ReturnType<typeof mock>, count: number) {
  for (let i = 0; i < 110; i++) {
    await act(async () => Bun.sleep(30))
    await tui?.renderOnce()
    if (start.mock.calls.length >= count) return
  }
  throw new Error(`Expected ${count} terminal launches`)
}

async function leader(key: string) {
  await act(async () => tui?.mockInput.pressKey("b", { ctrl: true }))
  await act(async () => tui?.mockInput.pressKey(key))
  await tui?.renderOnce()
}

async function pressEscape() {
  await act(async () => {
    tui?.mockInput.pressEscape()
    await Bun.sleep(70)
  })
  await tui?.renderOnce()
}

test("mirror dimensions follow the real viewport after the sidebar, splits and window resize", async () => {
  const { mirrorResize, start } = await mount()
  await waitForMirrors(start, 1)
  const pane = tui!.renderer.currentFocusedRenderable!
  const sidebar = tui!.renderer.root.findDescendantById("terminal-sidebar")!
  const viewport = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(pane.width).toBe(120 - sidebar.width)
  expect(mirrorResize.mock.calls.at(-1)).toEqual([pane.width, pane.height])
  await leader("v")
  expect(pane.width).toBeLessThan(viewport.width)
  expect(mirrorResize.mock.calls.at(-1)).toEqual([pane.width, pane.height])
  await act(async () => tui?.resize(90, 24))
  await tui?.renderOnce()
  expect(mirrorResize.mock.calls.at(-1)).toEqual([pane.width, pane.height])
  expect(start.mock.calls.filter(([command]) => command.tmux)).toHaveLength(1)
})

test("a borrowed mirror stays in tmux and keeps receiving output behind Git", async () => {
  const { start, stop, output } = await mount()
  await waitForMirrors(start, 1)
  const folder = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-tmux")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-auto-tmux-1")!
  expect(section.parent).toBe(folder.parent)
  expect(start.mock.calls[0]?.[0].tmux?.sessionId).toBe("$1")
  expect(start.mock.calls[0]?.[0].tmux?.paneId).toBe("%6")
  await act(async () => output("LIVE_AGENT"))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("LIVE_AGENT")
  await act(async () => changeTab(false))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("Git fixture")
  expect(tui?.captureCharFrame()).not.toContain("LIVE_AGENT")
  await act(async () => output("\r\nBACKGROUND_UPDATE"))
  expect(stop).not.toHaveBeenCalled()
  await act(async () => changeTab(true))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("BACKGROUND_UPDATE")
  expect(start).toHaveBeenCalledTimes(1)
  await leader("r")
  expect(start).toHaveBeenCalledTimes(1)
  await pressEscape()
  await leader("x")
  expect(stop).toHaveBeenCalledTimes(1)
})

test("without tmux a native terminal remains available without a picker", async () => {
  const { start } = await mount(false)
  await leader("t")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-tmux")).toBeUndefined()
  await pressEscape()
  await leader("n")
  expect(start).toHaveBeenCalledTimes(1)
  expect(start.mock.calls[0]?.[0].tmux).toBeUndefined()
})

test("panes in the same tmux session are discovered separately without duplicate launches", async () => {
  const { find, start } = await mount()
  const first = (await find(new AbortController().signal)).panes[0]!
  find.mockResolvedValue({
    available: true,
    panes: [first, { ...first, pane: { ...first.pane, paneId: "%9", paneIndex: 1 } }],
  })
  await waitForMirrors(start, 2)
  expect(start.mock.calls.map(([command]) => command.tmux?.paneId)).toEqual(["%6", "%9"])
  await act(async () => Bun.sleep(400))
  expect(start).toHaveBeenCalledTimes(2)
})
