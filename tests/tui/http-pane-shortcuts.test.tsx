import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { openLocalHttp } from "./http-source"

let tui: TestRendererSetup | undefined
const node = (id: string) => tui!.renderer.root.findDescendantById(id)!
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 150; i++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui!.renderOnce()
    })
    if (check()) return
  }
  throw Error(tui!.captureCharFrame())
}
async function key(name: string, shift = false) {
  await act(async () => {
    tui!.mockInput.pressKey(name, { shift })
    await Bun.sleep(50)
    await tui!.renderOnce()
  })
}
async function click(id: string) {
  await settle(() => Boolean(node(id)?.width))
  const target = node(id)
  await act(async () => {
    await tui!.mockMouse.click(target.screenX + Math.floor(target.width / 2), target.screenY)
    await tui!.renderOnce()
  })
}
test.each([52, 120])(
  "request and response title shortcuts focus their panels at %s columns",
  async (width) => {
    tui = await testRender(<HttpClient active />, { width, height: 38 })
    await openLocalHttp(tui)
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-url-input")
    const url = node("http-url-input") as InputRenderable
    const original = url.value
    await key("END")
    await key("r")
    await key("r", true)
    expect(url.value).toBe(`${original}rR`)
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-url-input")
    await key("ESCAPE")
    await key("r", true)
    await settle(() => Boolean(node("http-response-view-next")?.width))
    expect(tui.captureCharFrame()).toContain("RESPOSTA [Shift+R]")
    await key("r")
    await settle(() => Boolean(node("http-request-view-next")?.width))
    expect(tui.captureCharFrame()).toContain("REQUISIÇÃO [R]")
    await click("http-request-view-scripts")
    await key("r", true)
    await settle(() => Boolean(node("http-response-view-next")?.width))
    await key("r")
    await key("v")
    await key("RETURN")
    expect(tui.renderer.currentFocusedRenderable?.id).toBe(
      "http-script-editor-postResponse-http-scratch-1",
    )
    if (width === 120) {
      await click("http-response-focus-http-scratch-1")
      await settle(() => Boolean(node("http-response-view-next")?.width))
      expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-response-pane-http-scratch-1")
      await click("http-request-focus-http-scratch-1")
      await settle(() => Boolean(node("http-request-view-next")?.width))
      await key("z")
      await key("RETURN")
      expect(tui.renderer.currentFocusedRenderable?.id).toBe(
        "http-script-editor-preRequest-http-scratch-1",
      )
    }
  },
  60000,
)
