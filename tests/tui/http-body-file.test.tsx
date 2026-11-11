import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { TestRendererSetup } from "@opentui/core/testing"
import { InputRenderable, type Renderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import * as picker from "../../packages/feature-http/src/services/native-file-picker"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
const roots: string[] = []
const settings = getUiSettings()
const prefix = "http-body-file-http-scratch-1"
let choose = spyOn(picker, "chooseHttpBodyFiles").mockResolvedValue(null)
afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  choose.mockRestore()
  updateUiSettings(settings)
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
function node(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  return target
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
  await act(async () =>
    tui?.mockMouse.click(target.screenX + Math.min(1, target.width - 1), target.screenY),
  )
}
async function key(name: string, modifiers: { ctrl?: boolean; shift?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, modifiers)
    await Bun.sleep(name === "ESCAPE" ? 70 : 10)
    await tui?.renderOnce()
  })
}
async function mount(width = 120, kittyKeyboard = true) {
  choose = spyOn(picker, "chooseHttpBodyFiles").mockResolvedValue(null)
  updateUiSettings({ colorMode: "dark", layout: "framed" })
  tui = await testRender(
    <HttpClient active initialUrlRequest={{ id: 1, url: "https://example.invalid/upload" }} />,
    { width, height: 34, kittyKeyboard },
  )
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await click("http-request-view-body")
  await click("http-body-kind-file")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === `${prefix}-drop`)
  const root = await mkdtemp(join(tmpdir(), "tuiminal-body-upload-"))
  roots.push(root)
  const path = join(root, "ação (final) [1].bin")
  await writeFile(path, new Uint8Array([0, 1, 255, 2]))
  return path
}

test.each([52, 132])(
  "file body replaces the input with a native chooser and a dotted drop area at %s columns",
  async (width) => {
    const path = await mount(width)
    const frame = tui?.captureCharFrame() ?? ""
    expect(frame).toContain("┄")
    expect(frame).not.toContain("ARQUIVO RELATIVO AO PROJETO")
    expect(frame).not.toContain("Qualquer pasta")
    expect(
      tui?.renderer.root.findDescendantById("http-key-value-file-http-scratch-1"),
    ).toBeUndefined()
    const pane = node("http-request-pane-http-scratch-1")
    const drop = node(`${prefix}-drop`)
    expect(drop.screenX + drop.width).toBeLessThanOrEqual(pane.screenX + pane.width)
    expect(drop.screenY + drop.height).toBeLessThanOrEqual(pane.screenY + pane.height)
    choose.mockResolvedValueOnce([path])
    await click(`${prefix}-choose`)
    await settle(() => tui?.captureCharFrame().includes("ação (final)") ?? false)
    expect(choose).toHaveBeenCalledTimes(1)
    expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`${prefix}-drop`)
    choose.mockResolvedValueOnce(null)
    await key("RETURN")
    await settle(() => choose.mock.calls.length === 2)
    expect(tui?.captureCharFrame()).toContain("ação (final)")
    await key("BACKSPACE")
    await settle(() => !(tui?.captureCharFrame().includes("ação (final)") ?? true))
  },
)

test("accepts dropped file URLs and shell-escaped paths, rejects directories, and ignores paste outside the file body", async () => {
  const path = await mount()
  await act(async () => tui?.mockInput.pasteBracketedText(pathToFileURL(path).href))
  await settle(() => tui?.captureCharFrame().includes("ação (final)") ?? false)
  await click(`${prefix}-remove`)
  await act(async () => {
    tui?.renderer.stdin.emit("data", Buffer.from(pathToFileURL(path).href))
  })
  await settle(() => tui?.captureCharFrame().includes("ação (final)") ?? false)
  await click(`${prefix}-remove`)
  const escaped = path.replace(/([ ()[\]])/g, "\\$1")
  await act(async () => tui?.mockInput.pasteBracketedText(escaped))
  await settle(() => tui?.captureCharFrame().includes("ação (final)") ?? false)
  await click(`${prefix}-remove`)
  await act(async () => tui?.mockInput.typeText(escaped))
  await settle(() => tui?.captureCharFrame().includes("ação (final)") ?? false)
  await act(async () => tui?.mockInput.pasteBracketedText(roots[0] ?? ""))
  await settle(() => tui?.captureCharFrame().includes("não aponta para um arquivo") ?? false)
  expect(tui?.captureCharFrame()).toContain("ação (final)")
  await click("http-body-kind-text")
  await click("http-body-editor-http-scratch-1")
  await act(async () => tui?.mockInput.pasteBracketedText(path))
  await settle(() => tui?.captureCharFrame().includes("ação (final)") ?? false)
  expect(tui?.renderer.root.findDescendantById(`${prefix}-drop`)).toBeUndefined()
  expect(choose).not.toHaveBeenCalled()
})

test("the chooser is single-flight, restores focus, and cancels owned work when the body view closes", async () => {
  const path = await mount()
  let complete: ((paths: string[] | null) => void) | undefined
  let signal: AbortSignal | undefined
  choose.mockImplementationOnce((current) => {
    signal = current
    return new Promise((resolve) => {
      complete = resolve
    })
  })
  await key("RETURN")
  await key("RETURN")
  expect(choose).toHaveBeenCalledTimes(1)
  expect(tui?.captureCharFrame()).toContain("Abrindo seletor")
  await click("http-request-view-headers")
  await settle(() => signal?.aborted === true)
  await act(async () => complete?.([path]))
  await click("http-request-view-body")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById(`${prefix}-drop`)))
  expect(tui?.captureCharFrame()).not.toContain("ação (final)")
  await key("TAB")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`${prefix}-choose`)
  await key("TAB", { shift: true })
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`${prefix}-drop`)
  await key("ESCAPE")
  expect(tui?.renderer.currentFocusedRenderable?.id ?? "").not.toContain(prefix)
})

function fileInputs() {
  const found: InputRenderable[] = []
  const visit = (node: Renderable) => {
    if (
      node instanceof InputRenderable &&
      node.id.startsWith("http-key-value-value-http-scratch-1-part-") &&
      node.value !== ""
    )
      found.push(node)
    for (const child of node.getChildren()) visit(child as Renderable)
  }
  if (tui) visit(tui.renderer.root)
  return found
}

test.each([52, 132])(
  "chooses and drops multiple files, edits field names and removes individual files at %s columns",
  async (width) => {
    const first = await mount(width)
    const second = join(roots[0] ?? "", "second upload.bin")
    const third = join(roots[0] ?? "", "third upload.bin")
    await writeFile(second, "second")
    await writeFile(third, "third")
    choose.mockResolvedValueOnce([first, second])
    await click(`${prefix}-choose`)
    await settle(() => fileInputs().length === 2)
    expect(fileInputs().map((input) => input.value)).toEqual([first, second])
    expect(tui?.captureCharFrame()).toContain("Adicionar arquivos")
    const firstId = fileInputs()[0]?.id.replace("http-key-value-value-", "")
    if (!firstId) throw new Error("Missing first file row")
    await click(`http-key-value-name-${firstId}`)
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === `http-key-value-name-${firstId}`,
    )
    await act(async () => {
      const input = node(`http-key-value-name-${firstId}`) as InputRenderable
      input.selectAll()
      await tui?.mockInput.pasteBracketedText("photos")
    })
    await key("ESCAPE")
    await click(`${prefix}-drop`)
    await act(async () => tui?.mockInput.pasteBracketedText(`'${third}' '${second}'`))
    await settle(() => fileInputs().length === 4)
    expect((node(`http-key-value-name-${firstId}`) as InputRenderable).value).toBe("photos")
    await click(`http-key-value-delete-${firstId}`)
    await settle(() => fileInputs().length === 3)
    expect(fileInputs().map((input) => input.value)).toEqual([second, third, second])
    const pane = node("http-request-pane-http-scratch-1")
    const drop = node(`${prefix}-drop`)
    expect(drop.screenY + drop.height).toBeLessThanOrEqual(pane.screenY + pane.height)
    expect(tui?.captureCharFrame()).not.toContain("Qualquer pasta")
  },
)

test("a mixed invalid batch does not replace the selected file or switch its body type", async () => {
  const first = await mount()
  choose.mockResolvedValueOnce([first])
  await click(`${prefix}-choose`)
  await settle(() => tui?.captureCharFrame().includes("ação (final)") ?? false)
  choose.mockResolvedValueOnce([first, roots[0] ?? ""])
  await click(`${prefix}-choose`)
  await settle(() => tui?.captureCharFrame().includes("não aponta para um arquivo") ?? false)
  expect(fileInputs()).toHaveLength(0)
  expect(tui?.captureCharFrame()).toContain("ação (final)")
})

test.each([false, true])(
  "file controls preserve shortcuts with Kitty keyboard = %s",
  async (kitty) => {
    await mount(120, kitty)
    for (const [shortcut, expected] of [
      ["a", "HEADERS"],
      ["f", "SEM AUTENTICAÇÃO"],
      ["z", "Adicionar arquivos"],
      ["v", "BODY DESATIVADO"],
    ]) {
      await click("http-request-view-body")
      await click("http-body-kind-file")
      await click(`${prefix}-drop`)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === `${prefix}-drop`)
      await key(shortcut ?? "")
      await settle(() => tui?.captureCharFrame().includes(expected ?? "") ?? false)
      expect(tui?.renderer.root.findDescendantById(`${prefix}-error`)).toBeUndefined()
    }
    await click("http-body-kind-file")
    await key("q")
    await key(",")
    await key("b")
    await act(async () => {
      await Bun.sleep(200)
      await tui?.renderOnce()
    })
    expect(tui?.renderer.root.findDescendantById(`${prefix}-error`)).toBeUndefined()
    expect(choose).not.toHaveBeenCalled()
    await key("/")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  },
)
