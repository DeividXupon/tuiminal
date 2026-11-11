import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { getTreeSitterClient, RGBA, type TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { COLORS, getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const editorId = "http-body-editor-http-scratch-1"
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})
function node(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  return target
}
function editor() {
  return node(editorId) as TextareaRenderable
}
async function settle(check: () => boolean) {
  for (let i = 0; i < 180; i++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
async function click(id: string) {
  await settle(() => node(id).width > 0 && node(id).height > 0)
  const target = node(id)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY)
  })
}
async function key(name: string, modifiers: { ctrl?: boolean; shift?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, modifiers)
    await Bun.sleep(name === "ESCAPE" ? 70 : 10)
    await tui?.renderOnce()
  })
}
async function paste(source: string) {
  await click(editorId)
  act(() => editor().setSelection(0, editor().plainText.length))
  await act(async () => tui?.mockInput.pasteBracketedText(source))
  await settle(() => editor().plainText === source)
}
async function mount(kind = "json", width = 120) {
  updateUiSettings({ colorMode: "dark", layout: "framed" })
  tui = await testRender(
    <HttpClient active initialUrlRequest={{ id: 1, url: "https://example.invalid" }} />,
    { width, height: 34, kittyKeyboard: true },
  )
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await click("http-request-view-body")
  await click(`http-body-kind-${kind}`)
  await click(editorId)
}
function colored(text: string, hex: string) {
  const expected = RGBA.fromHex(hex).toInts()
  const target = editor()
  return (
    tui
      ?.captureSpans()
      .lines.slice(target.screenY, target.screenY + target.height)
      .flatMap((line) => line.spans)
      .some(
        (span) =>
          span.text.includes(text) &&
          span.fg.toInts().every((channel, i) => channel === expected[i]),
      ) ?? false
  )
}

test("JSON body colors follow Unicode edits, theme and resize without replacing the editor", async () => {
  await mount()
  const source = '{\n\t"名🦊": "café",\n  "count": 42,\n  "active": false\n}'
  await paste(source)
  await settle(
    () => colored("名🦊", "#80cbc4") && colored("café", "#c3e88d") && colored("false", "#f78c6c"),
  )
  expect(colored("42", "#f78c6c")).toBe(true)
  expect(colored("false", "#f78c6c")).toBe(true)
  const original = editor()
  act(() => original.setCursor(2, 13))
  await key("BACKSPACE")
  await key("3")
  await settle(() => colored("43", "#f78c6c"))
  const content = original.plainText
  const cursor = { ...original.logicalCursor }
  await act(async () => {
    updateUiSettings({ colorMode: "light" })
    tui?.resize(160, 40)
  })
  await settle(() => colored("名🦊", "#0b7285") && colored("café", "#2f7d32"))
  expect(editor()).toBe(original)
  expect(original.plainText).toBe(content)
  expect(original.logicalCursor).toEqual(cursor)
  expect(tui?.renderer.currentFocusedRenderable).toBe(original)
  await key("-", { ctrl: true })
  await settle(() => original.plainText !== content)
  await click("http-request-view-params")
  await click("http-request-view-body")
  expect(editor()).toBe(original)
  await settle(() => colored("café", "#2f7d32"))
})

test("XML colors tags, attributes, entities and multiline comments; text removes all syntax", async () => {
  await mount("xml")
  const source =
    '<user name="José 🦊">\n<!-- first\n  second -->\n<active>true &amp; yes</active>\n</user>'
  await paste(source)
  await settle(() => colored("user", "#82aaff") && colored("José", "#c3e88d"))
  expect(colored("name", "#80cbc4")).toBe(true)
  expect(colored("&amp;", "#f78c6c")).toBe(true)
  expect(colored("second", COLORS.muted)).toBe(true)
  const original = editor()
  await click("http-body-kind-text")
  await settle(() => colored("José", COLORS.text))
  expect(original.plainText).toBe(source)
  expect(editor()).toBe(original)
  for (let line = 0; line < original.lineCount; line++)
    expect(original.editBuffer.getLineHighlights(line)).toHaveLength(0)
  await click("http-body-kind-json")
  await paste('{"message": "unfinished')
  await settle(() => colored("message", "#c3e88d"))
  expect(original.plainText).toBe('{"message": "unfinished')
  await act(async () => tui?.mockInput.typeText('"}'))
  await settle(() => colored("message", "#80cbc4") && colored("unfinished", "#c3e88d"))
})

for (const width of [52, 120])
  test(`Tab indents the body and retains focus until Escape at ${width} columns`, async () => {
    await mount("text", width)
    await paste("first\nsecond")
    const original = editor()
    act(() => original.setCursor(1, 0))
    await key("TAB")
    expect(original.plainText).toBe("first\n  second")
    expect(tui?.renderer.currentFocusedRenderable).toBe(original)
    await key("TAB")
    expect(original.plainText).toBe("first\n    second")
    await key("TAB", { shift: true })
    expect(tui?.renderer.currentFocusedRenderable).toBe(original)
    expect(original.plainText).toBe("first\n    second")
    act(() => original.setSelection(0, 5))
    await key("TAB")
    expect(original.plainText).toBe("  \n    second")
    await key("-", { ctrl: true })
    expect(original.plainText).not.toBe("  \n    second")
    await key("ESCAPE")
    expect(tui?.renderer.currentFocusedRenderable).not.toBe(original)
    await key("TAB")
    expect(tui?.renderer.currentFocusedRenderable).not.toBe(original)
  })

test("a pending parser cannot repaint text mode or a destroyed editor", async () => {
  await mount("text")
  await paste('{"name":"value"}')
  const client = getTreeSitterClient()
  let finish: ((result: Awaited<ReturnType<typeof client.highlightOnce>>) => void) | undefined
  const parser = spyOn(client, "highlightOnce").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  try {
    await click("http-body-kind-json")
    await settle(() => finish !== undefined)
    await click("http-body-kind-text")
    await act(async () => {
      finish?.({ highlights: [[1, 7, "string.special.key"]] })
      await Bun.sleep(80)
      await tui?.renderOnce()
    })
    expect(editor().editBuffer.getLineHighlights(0)).toHaveLength(0)
    finish = undefined
    await click("http-body-kind-xml")
    await settle(() => finish !== undefined)
    act(() => tui?.renderer.destroy())
    tui = undefined
    await act(async () => {
      finish?.({ highlights: [[0, 5, "tag"]] })
      await Bun.sleep(80)
    })
  } finally {
    finish?.({ highlights: [] })
    parser.mockRestore()
  }
})
