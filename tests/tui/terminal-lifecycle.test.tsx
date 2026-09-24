import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { FreeTerminal } from "../../packages/feature-terminal/src/TerminalWorkspace"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"
import * as terminalService from "../../packages/feature-terminal/src/services/terminal"

let tui: TestRendererSetup | undefined
type TerminalOptions = Parameters<typeof terminalService.startFreeTerminalProcess>[1]
const starts: TerminalOptions[] = []
const inputs: string[][] = []
let inspectionSpy: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
let spawnSpy:
  | ReturnType<typeof spyOn<typeof terminalService, "startFreeTerminalProcess">>
  | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  spawnSpy?.mockRestore()
  inspectionSpy?.mockRestore()
  starts.length = 0
  inputs.length = 0
})

async function startFixture(shell = false) {
  inspectionSpy = spyOn(inspection, "readTerminalProcesses").mockResolvedValue([])
  spawnSpy = spyOn(terminalService, "startFreeTerminalProcess").mockImplementation(
    (_command, options) => {
      starts.push(options)
      const received: string[] = []
      inputs.push(received)
      return {
        pid: 123,
        write: (data) => {
          received.push(typeof data === "string" ? data : new TextDecoder().decode(data))
        },
        resize: () => undefined,
        stop: () => Promise.resolve(),
      }
    },
  )
  tui = await testRender(<FreeTerminal active />, { width: 100, height: 28 })
  await tui.renderOnce()
  if (shell) await leader("n")
  else {
    const command = tui?.renderer.root.findDescendantById("terminal-sidebar-command")
    if (!command) throw new Error("Missing command control")
    await act(async () => tui?.mockMouse.click(command.screenX + 1, command.screenY))
    await tui?.renderOnce()
    expect(tui?.renderer.root.findDescendantById("terminal-command-input")).toBeDefined()
    await act(async () => {
      tui?.renderer.root.findDescendantById("terminal-command-input")?.focus()
      await tui?.mockInput.typeText("fixture-command")
    })
    await act(async () => tui?.mockInput.pressEnter())
  }
  await tui.renderOnce()
  expect(starts).toHaveLength(1)
}

test("exiting an interactive shell removes its session and empty folder", async () => {
  await startFixture(true)
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")).toBeDefined()

  act(() => starts[0]?.onExit({ code: 0, signal: null, stopped: false }))
  await tui?.renderOnce()

  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")).toBeUndefined()
  expect(tui?.captureCharFrame()).toContain("Novo terminal")
})

test("resizing a finished terminal preserves its output without rerunning its command", async () => {
  await startFixture()
  act(() => starts[0]?.onExit({ code: 0, signal: null, stopped: false }))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("sessão encerrada")
  await act(async () => {
    tui?.resize(120, 32)
  })
  await tui?.renderOnce()
  expect(starts).toHaveLength(1)
  expect(tui?.captureCharFrame()).toContain("sessão encerrada")
})

async function leader(key: string) {
  await act(async () => tui?.mockInput.pressKey("b", { ctrl: true }))
  await act(async () => tui?.mockInput.pressKey(key))
  await tui?.renderOnce()
}

test("removed restart shortcut leaves the current shell untouched", async () => {
  await startFixture()
  await leader("r")
  expect(starts).toHaveLength(1)
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  expect(inputs[0]?.join("")).toBe("")
})
