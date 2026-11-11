import "./setup"
import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { RGBA, type TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { openLocalHttp } from "./http-source"
let tui: TestRendererSetup | undefined
const preId = "http-script-editor-preRequest-http-scratch-1"
const postId = "http-script-editor-postResponse-http-scratch-1"
const node = (id: string) => tui!.renderer.root.findDescendantById(id)!
const postVisible = () => node(postId).parent!.visible && !node(preId).parent!.visible
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 180; i++) {
    await act(async () => {
      await Bun.sleep(15)
      await tui?.renderOnce()
    })
    if (check()) return
  }
  const target = node(postId) as TextareaRenderable
  throw Error(
    JSON.stringify({
      height: target.height,
      y: target.screenY,
      parentHeight: target.parent?.height,
      parentY: target.parent?.screenY,
      scroll: target.scrollY,
      cursor: target.logicalCursor,
      textEnd: target.plainText.slice(-50),
    }) +
      "\n" +
      tui?.captureCharFrame(),
  )
}
async function click(id: string) {
  await settle(() => Boolean(node(id)?.width))
  const target = node(id)
  await act(async () => {
    await tui!.mockMouse.click(target.screenX + 1, target.screenY)
    await tui!.renderOnce()
  })
}
async function key(key: string) {
  await act(async () => {
    tui!.mockInput.pressKey(key)
    await Bun.sleep(70)
    await tui!.renderOnce()
  })
}
test.each([52, 120])(
  "JavaScript scripts retain text and highlights across tabs at %s columns",
  async (width) => {
    tui = await testRender(<HttpClient active />, { width, height: 38 })
    await openLocalHttp(tui)
    await click("http-request-view-scripts")
    await click(preId)
    const text = 'const token = "fixture";\npm.variables.set("token", token);'
    await act(async () => tui!.mockInput.pasteBracketedText(text))
    const pre = node(preId) as TextareaRenderable
    await settle(() => pre.plainText === text)
    await settle(() =>
      tui!
        .captureSpans()
        .lines.slice(pre.screenY, pre.screenY + pre.height)
        .flatMap((l) => l.spans)
        .some(
          (s) =>
            s.text.includes("const") &&
            s.fg.toInts().every((channel, i) => channel === RGBA.fromHex("#c792ea").toInts()[i]),
        ),
    )
    expect(pre.logicalCursor.row).toBe(1)
    await click("http-script-tab-postResponse")
    await settle(() => postVisible())
    await click(postId)
    const post = node(postId) as TextareaRenderable
    await act(async () =>
      tui!.mockInput.pasteBracketedText('pm.test("OK", () => pm.response.to.have.status(200));'),
    )
    await settle(() => post.plainText.includes("pm.test"))
    await key("END")
    await key("RETURN")
    await act(async () =>
      tui!.mockInput.pasteBracketedText(
        Array.from({ length: 20 }, (_, i) => `// line ${i}`).join("\n") +
          "\n// cursor remains visible",
      ),
    )
    await settle(() => tui!.captureCharFrame().includes("cursor remains visible"))
    const cursor = { ...post.logicalCursor }
    await act(async () => {
      await Bun.sleep(150)
      await tui!.renderOnce()
    })
    expect(post.logicalCursor).toEqual(cursor)
    expect(post.scrollY).toBeGreaterThan(0)
    expect(post.height).toBeLessThanOrEqual(post.parent!.height)
    expect(tui!.captureCharFrame()).toContain("[Enter] Editar · [Esc] Sair")

    await key("ESCAPE")
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-scripts-http-scratch-1")
    await key("z")
    await settle(() => node(preId).parent!.visible)
    await key("v")
    await settle(() => postVisible())
    await key("RETURN")
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe(postId)
    await key("ESCAPE")
    await key("z")
    await settle(() => node(preId).parent!.visible)
    await key("RETURN")
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe(preId)
    await key("ESCAPE")
    await click("http-request-view-body")
    await click("http-request-view-scripts")
    expect(node(preId)).toBe(pre)
    expect(pre.plainText).toBe(text)
    expect(post.plainText).toContain("pm.test")
    await click(preId)
    await key("z")
    await key("v")
    expect(tui!.renderer.currentFocusedRenderable).toBe(pre)
    expect(pre.plainText).toContain("zv")
    await key("w")
    await key("+")
    expect(node(preId)).toBe(pre)
    expect(tui!.renderer.currentFocusedRenderable).toBe(pre)
    await click("http-url-input")
    await key("z")
    await key("v")
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-url-input")
    expect(node(preId).parent!.visible).toBe(true)
  },
  20000,
)

test("Scripts owns keyboard focus after tab and pane navigation", async () => {
  tui = await testRender(<HttpClient active />, { width: 120, height: 38 })
  await openLocalHttp(tui)
  await click("http-request-view-auth")
  await key("f")
  await settle(() => Boolean(node(preId)?.parent?.visible))
  await key("v")
  await settle(() => postVisible())
  await key("RETURN")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe(postId)
  await act(async () => tui!.mockInput.pasteBracketedText("// post draft"))
  await settle(() => (node(postId) as TextareaRenderable).plainText === "// post draft")
  await key("ESCAPE")
  await key("z")
  await settle(() => node(preId).parent!.visible)
  await key("RETURN")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe(preId)
  await act(async () => tui!.mockInput.pasteBracketedText("// pre draft"))
  await settle(() => (node(preId) as TextareaRenderable).plainText === "// pre draft")
  await key("ESCAPE")
  await key("TAB")
  await key("h")
  await key("v")
  await settle(() => postVisible())
  await key("RETURN")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe(postId)
  expect((node(postId) as TextareaRenderable).plainText).toBe("// post draft")
  await key("ESCAPE")
  await key("a")
  await key("f")
  await key("z")
  await settle(() => node(preId).parent!.visible)
  await key("RETURN")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe(preId)
  expect((node(preId) as TextareaRenderable).plainText).toBe("// pre draft")
  await key("ESCAPE")
  await key("TAB")
  await click(preId)
  expect(tui.renderer.currentFocusedRenderable?.id).toBe(preId)
}, 20000)
