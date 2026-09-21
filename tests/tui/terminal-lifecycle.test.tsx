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
let finishStop = () => {}
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

async function startFixture(deferStop = false, shell = false) {
  inspectionSpy = spyOn(inspection, "readTerminalProcesses").mockResolvedValue([])
  spawnSpy = spyOn(terminalService, "startFreeTerminalProcess").mockImplementation(
    (_command, options) => {
      starts.push(options)
      const received: string[] = []
      inputs.push(received)
      const stopping = Promise.withResolvers<void>()
      finishStop = () => stopping.resolve()
      return {
        pid: 123,
        write: (data) => {
          received.push(typeof data === "string" ? data : new TextDecoder().decode(data))
        },
        resize: () => undefined,
        stop: () => (deferStop ? stopping.promise : Promise.resolve()),
      }
    },
  )
  tui = await testRender(<FreeTerminal active />, { width: 100, height: 28 })
  if (shell) await leader("c")
  else {
    await leader("/")
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
  await startFixture(false, true)
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

test("repeated restart requests create only the newest replacement shell", async () => {
  await startFixture(true)
  await leader("r")
  await leader("r")
  expect(starts).toHaveLength(1)
  await act(async () => finishStop())
  await tui?.renderOnce()
  expect(starts).toHaveLength(2)
  act(() => starts[0]?.onExit({ code: 1, signal: null, stopped: true }))
  await act(async () => {
    await tui?.mockInput.typeText("replacement input")
  })
  expect(inputs[1]?.join("")).toContain("replacement input")
  expect(inputs[0]?.join("")).toBe("")
})

test("closing a pane while its shell stops cancels a pending restart", async () => {
  await startFixture(true)
  await leader("r")
  await leader("x")
  await act(async () => finishStop())
  await tui?.renderOnce()
  expect(starts).toHaveLength(1)
  expect(tui?.captureCharFrame()).toContain("Novo terminal")
})

test("unmount cancels a replacement waiting for the old shell to stop", async () => {
  await startFixture(true)
  await leader("r")
  act(() => tui?.renderer.destroy())
  tui = undefined
  await act(async () => finishStop())
  expect(starts).toHaveLength(1)
})

test("an explicit restart still reopens a finished command", async () => {
  await startFixture()
  act(() => starts[0]?.onExit({ code: 0, signal: null, stopped: false }))
  await leader("r")
  expect(starts).toHaveLength(2)
})
