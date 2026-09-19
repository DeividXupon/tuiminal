import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { EmbeddedTerminalRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { ModalSurface } from "../../packages/core/src/ui/ModalSurface"
import { PasswordInputRenderable } from "../../packages/core/src/ui/PasswordInput"
import { SelectionClipboard } from "../../packages/core/src/ui/SelectionClipboard"

let tui: TestRendererSetup | undefined
const initialOnlyTab = process.env.TUIMINAL_ONLY_TAB
const initialTab = process.env.TUIMINAL_INITIAL_TAB

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  if (initialOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = initialOnlyTab
  if (initialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = initialTab
})

function mounted() {
  if (!tui) throw new Error("Missing TUI")
  return tui
}

async function select(id: string, length: number) {
  const { renderer, mockMouse, renderOnce } = mounted()
  await renderOnce()
  const target = renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing selection target: ${id}`)
  await act(async () => {
    await mockMouse.drag(target.screenX, target.screenY, target.screenX + length, target.screenY)
  })
  return target
}

async function rightClick(x = 1, y = 0) {
  await act(async () => mounted().mockMouse.click(x, y, 2))
  await mounted().renderOnce()
}

test("drag then right-click copies exact multiline Unicode text once without taking focus", async () => {
  const content = "  fixture [Ctrl+C] café 中文\n  next line"
  tui = await testRender(
    <NotificationProvider>
      <SelectionClipboard>
        <text id="copy-text" content={content} />
        <input id="copy-focus" value="keep focus" />
      </SelectionClipboard>
    </NotificationProvider>,
    { width: 80, height: 12 },
  )
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
  await tui.renderOnce()
  const focus = tui.renderer.root.findDescendantById("copy-focus")
  if (!focus) throw new Error("Missing focused input")
  act(() => focus.focus())
  await act(async () => tui?.mockMouse.drag(0, 0, 11, 1))
  expect(tui.renderer.getSelection()?.getSelectedText()).toBe(content)
  expect(copy).not.toHaveBeenCalled()
  await rightClick()
  expect(copy).toHaveBeenCalledTimes(1)
  expect(copy).toHaveBeenCalledWith(content)
  expect(tui.renderer.hasSelection).toBe(false)
  expect(tui.renderer.currentFocusedRenderable).toBe(focus)
  expect(tui.captureCharFrame()).toContain("Texto selecionado copiado.")
})

test.each(["rejected", "throwing"])("a %s copy preserves selection for retry", async (failure) => {
  tui = await testRender(
    <NotificationProvider>
      <SelectionClipboard>
        <text id="retry-text" content="retry fixture" />
      </SelectionClipboard>
    </NotificationProvider>,
    { width: 80, height: 12 },
  )
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockImplementation(() => {
    if (failure === "throwing") throw new Error("fixture clipboard failure")
    return false
  })
  await select("retry-text", 4)
  await rightClick()
  expect(copy).toHaveBeenCalledTimes(1)
  expect(copy).toHaveBeenCalledWith("retry")
  expect(tui.renderer.getSelection()?.getSelectedText()).toBe("retry")
  expect(tui.captureCharFrame()).toContain("O terminal não aceitou a cópia OSC52.")
  copy.mockReturnValue(true)
  await rightClick()
  expect(copy).toHaveBeenCalledTimes(2)
  expect(tui.renderer.hasSelection).toBe(false)
})

test("empty selections, other buttons, and unfinished drags do not copy", async () => {
  tui = await testRender(
    <SelectionClipboard>
      <text id="ignored-text" content="fixture" />
    </SelectionClipboard>,
    { width: 40, height: 6 },
  )
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
  await tui.renderOnce()
  await rightClick()
  await act(async () => tui?.mockMouse.pressDown(0, 0))
  await act(async () => tui?.mockMouse.emitMouseEvent("drag", 4, 0, 0))
  await rightClick()
  expect(copy).not.toHaveBeenCalled()
  await act(async () => tui?.mockMouse.release(4, 0))
  await act(async () => tui?.mockMouse.click(1, 0, 1))
  expect(copy).not.toHaveBeenCalled()
  await rightClick()
  expect(copy).toHaveBeenCalledWith("fixtu")
})

test("copying inside a modal leaves it open and masks selected passwords", async () => {
  let closes = 0
  tui = await testRender(
    <SelectionClipboard>
      <ModalSurface
        id="copy-modal"
        width={32}
        height={7}
        zIndex={970}
        borderColor="#ffffff"
        onBackdropPress={() => {
          closes++
        }}
      >
        <password-input id="copy-password" value="中文secret" width={20} />
      </ModalSurface>
    </SelectionClipboard>,
    { width: 80, height: 24 },
  )
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
  const password = await select("copy-password", 10)
  expect(password).toBeInstanceOf(PasswordInputRenderable)
  await rightClick(password.screenX + 1, password.screenY)
  expect(copy).toHaveBeenCalledTimes(1)
  expect(copy).toHaveBeenCalledWith("********")
  expect(closes).toBe(0)
  expect((password as PasswordInputRenderable).plainText).toBe("中文secret")
})

test("copies native terminal output and retains terminal keyboard input", async () => {
  const input: string[] = []
  tui = await testRender(
    <SelectionClipboard>
      <embedded-terminal
        id="copy-terminal"
        width={40}
        height={5}
        selectable
        onData={(data) => input.push(new TextDecoder().decode(data))}
      />
    </SelectionClipboard>,
    { width: 50, height: 10, exitOnCtrlC: false },
  )
  const terminal = tui.renderer.root.findDescendantById("copy-terminal")
  if (!(terminal instanceof EmbeddedTerminalRenderable)) throw new Error("Missing terminal")
  terminal.write("terminal fixture")
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
  await select("copy-terminal", 8)
  await rightClick()
  expect(copy).toHaveBeenCalledWith("terminal")
  await act(async () => tui?.mockInput.pressKey("c", { ctrl: true }))
  expect(input).toContain("\x03")

  terminal.write("\x1b[?1000h\x1b[?1006h")
  await select("copy-terminal", 8)
  await rightClick()
  expect(copy).toHaveBeenCalledTimes(1)
  expect(input).toContain("\x1b[<2;2;1M")
  expect(tui.renderer.getSelection()?.getSelectedText()).toBe("terminal")
})

test.each([false, true])(
  "App enables selection copying with isolated mode %s",
  async (isolated) => {
    process.env.TUIMINAL_INITIAL_TAB = "runner"
    if (isolated) process.env.TUIMINAL_ONLY_TAB = "runner"
    else delete process.env.TUIMINAL_ONLY_TAB
    tui = await testRender(<App />, { width: 120, height: 30 })
    for (let attempt = 0; attempt < 100; attempt++) {
      await act(async () => Bun.sleep(10))
      await tui.renderOnce()
      if (tui.renderer.root.findDescendantById("runner-command-list")) break
    }
    expect(tui.renderer.root.findDescendantById("runner-command-list")).toBeDefined()
    const frame = tui.captureCharFrame().split("\n")
    const y = frame.findIndex((line) => line.includes("TUIMINAL"))
    const x = frame[y]?.indexOf("TUIMINAL") ?? -1
    expect(x).toBeGreaterThanOrEqual(0)
    const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
    await act(async () => tui?.mockMouse.drag(x, y, x + 8, y))
    await rightClick(x, y)
    expect(copy).toHaveBeenCalledWith("TUIMINAL")
  },
)
