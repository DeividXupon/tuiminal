import "./setup"
import { afterEach, expect, test } from "bun:test"
import { Writable } from "node:stream"
import { OptimizedBuffer, resolveRenderLib } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { useKeyboard } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { App } from "../../apps/cli/src/App"
import { useWorkspaceRepaint } from "../../apps/cli/src/hooks/use-workspace-repaint"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const onlyTab = process.env.TUIMINAL_ONLY_TAB
const initialTab = process.env.TUIMINAL_INITIAL_TAB
let screen: ReturnType<typeof outputScreen> | undefined

function outputScreen(columns: number, rows: number) {
  const lib = resolveRenderLib()
  const terminal = lib.createEmbeddedTerminal({ cols: columns, rows, maxScrollback: 0 })
  const buffer = OptimizedBuffer.create(columns, rows, "wcwidth")
  const decoder = new TextDecoder()
  const stdout = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        lib.embeddedTerminalWrite(terminal, chunk)
        callback()
      },
    }),
    { isTTY: true, columns, rows, getColorDepth: () => 24 },
  )
  return {
    stdout: stdout as unknown as NodeJS.WriteStream,
    read() {
      lib.embeddedTerminalCompose(terminal, buffer.ptr, 0, 0)
      return decoder.decode(buffer.getRealCharBytes(true))
    },
    leaveStaleCells() {
      // Simulate terminal cells left behind by an earlier frame, including spaces
      // the renderer still believes are blank. Save/restore the physical cursor.
      lib.embeddedTerminalWrite(
        terminal,
        new TextEncoder().encode("\x1b7\x1b[1;1HOLD-SCREEN\x1b[1;105HOLD\x1b[25;108HSTALE\x1b8"),
      )
    },
    resize(width: number, height: number) {
      lib.embeddedTerminalResize(terminal, width, height)
      buffer.resize(width, height)
    },
    destroy() {
      lib.destroyEmbeddedTerminal(terminal)
      buffer.destroy()
      stdout.destroy()
    },
  }
}

afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  screen?.destroy()
  screen = undefined
  updateUiSettings(settings)
  if (onlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = onlyTab
  if (initialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = initialTab
})

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (until()) return
  }
  throw new Error(`TUI did not settle:\n${tui?.captureCharFrame()}\nOutput:\n${screen?.read()}`)
}

async function click(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing control: ${id}\n${tui?.captureCharFrame()}`)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}

test("feature and layout changes repaint stale terminal cells, including the header", async () => {
  delete process.env.TUIMINAL_ONLY_TAB
  process.env.TUIMINAL_INITIAL_TAB = "runner"
  updateUiSettings({ language: "en", layout: "framed" })
  screen = outputScreen(120, 30)
  tui = await testRender(<App />, {
    width: 120,
    height: 30,
    kittyKeyboard: true,
    stdout: screen.stdout,
    bufferedOutput: "stdout",
    useThread: false,
  })
  await settle(() => screen?.read().includes("TUIMINAL") ?? false)
  await settle(() => screen?.read() === tui?.captureCharFrame())
  for (const target of ["2", "1", "5", "3", "4", "2", "5", "3"]) {
    const column = tui.captureCharFrame().split("\n")[0]?.indexOf(`[Alt+${target}]`) ?? -1
    expect(column).toBeGreaterThan(0)
    screen.leaveStaleCells()
    await act(async () => tui?.mockMouse.click(column, 0))
    await settle(() => screen?.read() === tui?.captureCharFrame())
    expect(screen.read()).toBe(tui.captureCharFrame())
    const header = screen.read().split("\n")[0] ?? ""
    expect(header).toContain("TUIMINAL")
    if (target === "1") {
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")
      for (let index = 0; index < 2; index += 1) {
        await act(async () => {
          tui?.mockInput.pressKey("ESCAPE")
          await Bun.sleep(60)
        })
      }
      await settle(() => screen?.read() === tui?.captureCharFrame())
    }
    screen.leaveStaleCells()
    await click("tutorial-settings-button")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("configuration-modal")))
    if (target !== "5") {
      await click("configuration-section-layout")
      screen.leaveStaleCells()
      const previousLayout = getUiSettings().layout
      await act(async () => tui?.mockInput.pressKey("l"))
      await settle(() => getUiSettings().layout !== previousLayout)
    }
    await settle(() => screen?.read() === tui?.captureCharFrame())
    await act(async () => tui?.mockMouse.click(0, 0))
    await settle(() => !tui?.renderer.root.findDescendantById("configuration-modal"))
    await settle(() => screen?.read() === tui?.captureCharFrame())
    for (const [width, height] of [
      [80, 18],
      [140, 36],
      [120, 30],
    ] as const) {
      screen.resize(width, height)
      await act(async () => tui?.resize(width, height))
      await settle(() => screen?.read() === tui?.captureCharFrame())
    }
  }
}, 30_000)

test("workspace repaint requests retire on unmount and idle frames stay incremental", async () => {
  function Workspace() {
    useWorkspaceRepaint("workspace")
    return <text content="WORKSPACE" />
  }
  function Harness() {
    const [mounted, setMounted] = useState(false)
    useKeyboard(() => setMounted((value) => !value))
    return (
      <box backgroundColor="#112233" flexGrow={1}>
        {mounted && <Workspace />}
      </box>
    )
  }
  tui = await testRender(<Harness />, { width: 60, height: 16 })
  await tui.waitForVisualIdle()
  const initialListeners = tui.renderer.root.listenerCount("layout-changed")
  const updates: number[] = []
  const recordFrame = () => updates.push(tui?.getNativeStats().cellsUpdated ?? 0)
  tui.renderer.on("frame", recordFrame)
  try {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      updates.length = 0
      await act(async () => tui?.mockInput.pressKey("r"))
      await tui.waitForVisualIdle()
      expect(tui.captureCharFrame()).toContain("WORKSPACE")
      expect(tui.renderer.root.listenerCount("layout-changed")).toBe(initialListeners)
      expect(updates.filter((count) => count === 60 * 16)).toHaveLength(1)
      await tui.renderOnce()
      expect(tui.getNativeStats().cellsUpdated).toBe(0)
      updates.length = 0
      await act(async () => tui?.mockInput.pressKey("r"))
      await tui.waitForVisualIdle()
      expect(tui.captureCharFrame()).not.toContain("WORKSPACE")
      expect(tui.renderer.root.listenerCount("layout-changed")).toBe(initialListeners)
      expect(updates.length).toBeGreaterThan(0)
      expect(Math.max(...updates)).toBeLessThan(60)
    }
  } finally {
    tui.renderer.off("frame", recordFrame)
  }
})

test("typing and status reflow preserve the cursor and update only changed cells", async () => {
  function Dashboard() {
    useWorkspaceRepaint("dashboard")
    const [status, setStatus] = useState("")
    return (
      <box backgroundColor="#112233" flexGrow={1}>
        <input id="repaint-input" focused width={40} onInput={setStatus} />
        <text content={`Status: ${status}`} />
      </box>
    )
  }
  tui = await testRender(<Dashboard />, { width: 120, height: 30 })
  await tui.waitForVisualIdle()
  const originalCursor = tui.renderer.getCursorState()
  const updates: number[] = []
  const recordFrame = () => updates.push(tui?.getNativeStats().cellsUpdated ?? 0)
  tui.renderer.on("frame", recordFrame)
  try {
    let typed = ""
    for (const character of "abcdef") {
      typed += character
      await act(async () => tui?.mockInput.typeText(character))
      await tui.waitForVisualIdle()
      expect(tui.captureCharFrame()).toContain(`Status: ${typed}`)
      expect(tui.renderer.getCursorState()).toEqual({
        ...originalCursor,
        x: originalCursor.x + typed.length,
      })
    }
    expect(updates.length).toBeGreaterThan(0)
    expect(Math.max(...updates)).toBeLessThan(120)
  } finally {
    tui.renderer.off("frame", recordFrame)
  }
})
