import "./setup"
import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RGBA, type TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { RunnerConfigurationEditor } from "../../packages/feature-runner/src/ui/RunnerConfigurationEditor"
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
  root = mkdtempSync(join(tmpdir(), "runner-yaml-highlighting-"))
  const calls = { saved: 0, closed: 0 }
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
