import "./setup"
import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RGBA, type ScrollBoxRenderable, type TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { RunnerConfigurationEditor } from "../../packages/feature-runner/src/ui/RunnerConfigurationEditor"
import { runnerYamlPath } from "../../packages/feature-runner/src/storage/runner-yaml"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
let root = ""
const initialSettings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  if (root) rmSync(root, { recursive: true, force: true })
  updateUiSettings(initialSettings)
})
async function render() {
  await act(async () => {
    await Bun.sleep(60)
  })
  await tui!.renderOnce()
}
async function key(name: string, ctrl = false) {
  act(() => tui!.mockInput.pressKey(name, { ctrl }))
  await render()
}
async function click(id: string) {
  const node = tui!.renderer.root.findDescendantById(id)!
  expect(node).toBeDefined()
  await act(async () => {
    await tui!.mockMouse.click(node.screenX + 1, node.screenY)
  })
  await render()
}
async function mount() {
  root = mkdtempSync(join(tmpdir(), "runner-yaml-guide-"))
  const calls = { saved: 0, closed: 0, managed: 0 }
  tui = await testRender(
    <RunnerConfigurationEditor
      root={root}
      commands={[]}
      profiles={[]}
      onSaved={() => {
        calls.saved++
      }}
      onClose={() => {
        calls.closed++
      }}
      onManage={() => {
        calls.managed++
      }}
    />,
    { width: 100, height: 32, kittyKeyboard: true },
  )
  await render()
  return calls
}
function editor() {
  return tui!.renderer.root.findDescendantById("runner-config-yaml") as TextareaRenderable
}
async function paste(source: string) {
  act(() => editor().setSelection(0, editor().plainText.length))
  await act(async () => tui!.mockInput.pasteBracketedText(source))
  await render()
}
function colorOf(text: string) {
  const span = tui!
    .captureSpans()
    .lines.flatMap((line) => line.spans)
    .find((span) => span.text.includes(text))
  expect(span).toBeDefined()
  return span!.fg.toInts()
}

test("F1 tutorial owns input, navigates, and returns the same unsaved YAML selection", async () => {
  const calls = await mount()
  const source = "# draft\ncommands:\n  api:\n    command: echo ready\n    interactive: false\n"
  await paste(source)
  const original = editor()
  act(() => original.setSelection(2, 7))
  const selection = original.getSelection()
  const cursor = { ...original.logicalCursor }
  await key("F1")
  expect(tui!.captureCharFrame()).toContain("TUTORIAL YAML DO RUNNER")
  expect(tui!.captureCharFrame()).toContain("label muda só o nome exibido")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("runner-config-guide-content")
  await key("s", true)
  await key("o", true)
  await key("e")
  expect(calls).toEqual({ saved: 0, closed: 0, managed: 0 })
  expect(existsSync(runnerYamlPath(root))).toBe(false)
  await key("ARROW_RIGHT")
  expect(tui!.captureCharFrame()).toContain("Comandos e diretórios")
  await click("runner-config-guide-next")
  expect(tui!.captureCharFrame()).toContain("Ambiente e perfis")
  await key("ESCAPE")
  expect(calls.closed).toBe(0)
  expect(editor()).toBe(original)
  expect(editor().plainText).toBe(source)
  expect(editor().getSelection()).toEqual(selection)
  expect(editor().logicalCursor).toEqual(cursor)
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("runner-config-yaml")
  await click("runner-config-guide-open")
  await click("runner-config-guide-close")
  expect(calls.closed).toBe(0)
  await key("ESCAPE")
  expect(calls.closed).toBe(1)
})

test("contextual guide scrolls and resizes while keeping the editor draft", async () => {
  await mount()
  const source =
    "commands:\n  api:\n    command: echo ready\n    health:\n      type: port\n      port: 3000\n"
  await paste(source)
  act(() => editor().setCursor(3, 4))
  await render()
  await key("F1")
  expect(tui!.captureCharFrame()).toContain("Prontidão dos serviços")
  await act(async () => {
    tui!.resize(60, 20)
  })
  await render()
  const scroll = tui!.renderer.root.findDescendantById(
    "runner-config-guide-content",
  ) as ScrollBoxRenderable
  await key("\u001b[6~")
  expect(scroll.scrollTop).toBeGreaterThan(0)
  const position = scroll.scrollTop
  await click("runner-config-guide-up")
  expect(scroll.scrollTop).toBeLessThan(position)
  await key("ARROW_LEFT")
  expect(scroll.scrollTop).toBe(0)
  await key("F1")
  expect(editor().plainText).toBe(source)
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("runner-config-yaml")
})

test("native YAML colors update on edits and theme changes without losing cursor or undo", async () => {
  await mount()
  updateUiSettings({ colorMode: "dark" })
  await paste(
    '"名🦊": true # note\ncommands:\n  api:\n    command: "echo café"\n    maxRestarts: 3\n',
  )
  expect(colorOf('"名🦊"')).toEqual(RGBA.fromHex("#80cbc4").toInts())
  expect(colorOf("true")).toEqual(RGBA.fromHex("#f78c6c").toInts())
  expect(colorOf('"echo café"')).toEqual(RGBA.fromHex("#c3e88d").toInts())
  expect(colorOf("# note")).not.toEqual(colorOf("true"))
  const original = editor()
  act(() => original.setCursor(4, 18))
  await key("BACKSPACE")
  await key("5")
  expect(editor().plainText).toContain("maxRestarts: 5")
  const cursor = { ...original.logicalCursor }
  const source = original.plainText
  act(() => updateUiSettings({ colorMode: "light" }))
  await render()
  expect(colorOf('"名🦊"')).toEqual(RGBA.fromHex("#0b7285").toInts())
  expect(editor()).toBe(original)
  expect(editor().plainText).toBe(source)
  expect(editor().logicalCursor).toEqual(cursor)
  await key("-", true)
  expect(editor().plainText).not.toBe(source)
  await paste('commands:\n  api:\n    command: "unfinished # false')
  expect(colorOf('"unfinished # false')).toEqual(RGBA.fromHex("#2f7d32").toInts())
})
