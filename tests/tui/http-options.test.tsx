import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { ScrollBoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (until()) return
  }
  throw new Error(`HTTP options did not settle:\n${tui?.captureCharFrame()}`)
}

async function key(name: string, shift = false) {
  await act(async () => {
    tui?.mockInput.pressKey(name, { shift })
    await Bun.sleep(name === "ESCAPE" || name.startsWith("F") ? 60 : 5)
    await tui?.renderOnce()
  })
}

async function click(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`HTTP control ${id} is not mounted`)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + Math.floor(target.width / 2), target.screenY)
    await tui?.renderOnce()
  })
}

function optionsBounds() {
  const pane = tui?.renderer.root.findDescendantById("http-request-pane-http-scratch-1")
  const cookie = tui?.renderer.root.findDescendantById("http-request-cookie-jar")
  const tls = tui?.renderer.root.findDescendantById("http-request-tls-verification")
  if (!pane || !cookie || !tls) throw new Error("HTTP options are not mounted")
  let scroll = cookie.parent
  while (scroll && !(scroll instanceof ScrollBoxRenderable)) scroll = scroll.parent
  if (!(scroll instanceof ScrollBoxRenderable)) throw new Error("HTTP options are not scrollable")
  const viewportTop = scroll.viewport.screenY
  const viewportBottom = viewportTop + scroll.viewport.height
  return {
    paneHeight: pane.height,
    viewportLeft: scroll.viewport.screenX,
    viewportWidth: scroll.viewport.width,
    viewportTop,
    viewportBottom,
    cookieTop: cookie.screenY,
    cookieBottom: cookie.screenY + cookie.height,
    tlsTop: tls.screenY,
    tlsBottom: tls.screenY + tls.height,
    cookieVisible:
      cookie.screenY >= viewportTop && cookie.screenY + cookie.height <= viewportBottom,
    tlsVisible: tls.screenY >= viewportTop && tls.screenY + tls.height <= viewportBottom,
  }
}

async function scrollOptions(direction: "up" | "down", visible: () => boolean) {
  const bounds = optionsBounds()
  for (let attempt = 0; attempt < 10 && !visible(); attempt += 1) {
    await act(async () => {
      await tui?.mockMouse.scroll(bounds.viewportLeft + 2, bounds.viewportTop, direction)
      await tui?.renderOnce()
    })
  }
  expect(visible()).toBe(true)
}

test.each(["framed", "compact"] as const)(
  "HTTP options fit the request viewport before and after updates in %s layout",
  async (layout) => {
    updateUiSettings({ ...initialSettings, layout, language: "pt-BR" })
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("ESCAPE")
    await key("a")
    const proxyInput = tui.renderer.root.findDescendantById("http-request-proxy-http-scratch-1")
    for (const height of [30, 28, 32, 34, 36, 38, 30]) {
      act(() => tui?.resize(120, height))
      await act(async () => {
        await Bun.sleep(10)
        await tui?.renderOnce()
      })
      expect(optionsBounds()).toMatchObject({ cookieVisible: true, tlsVisible: true })
      expect(tui.renderer.root.findDescendantById("http-request-proxy-http-scratch-1")).toBe(
        proxyInput,
      )
      expect(tui.captureCharFrame()).toContain("[C] Cookie jar: usar")
      expect(tui.captureCharFrame()).toContain("[Shift+V] TLS: verificar")
    }
    await key("c")
    await key("v", true)
    await settle(() => tui?.captureCharFrame().includes("[Shift+V] TLS INSEGURO") ?? false)
    expect(optionsBounds()).toMatchObject({ cookieVisible: true, tlsVisible: true })
    expect(tui.captureCharFrame()).toContain("[C] Cookie jar: ignorar")
    expect(tui.captureCharFrame()).toContain("[Shift+V] TLS INSEGURO")
    await click("http-request-cookie-jar")
    await click("http-request-tls-verification")
    await settle(() => tui?.captureCharFrame().includes("[Shift+V] TLS: verificar") ?? false)
    expect(tui.captureCharFrame()).toContain("[C] Cookie jar: usar")
    expect(optionsBounds()).toMatchObject({ cookieVisible: true, tlsVisible: true })
  },
)

test.each(["framed", "compact"] as const)(
  "short HTTP options retain scrolling and mouse access in %s layout",
  async (layout) => {
    updateUiSettings({ ...initialSettings, layout, language: "pt-BR" })
    tui = await testRender(<HttpClient active />, { width: 80, height: 24 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("ESCAPE")
    await key("a")
    await settle(() => tui?.captureCharFrame().includes("OPÇÕES DA REQUISIÇÃO") ?? false)
    const bounds = optionsBounds()
    expect(bounds.viewportBottom).toBeGreaterThan(bounds.viewportTop)
    await scrollOptions("down", () => optionsBounds().tlsVisible)
    await click("http-request-tls-verification")
    await settle(() => tui?.captureCharFrame().includes("[Shift+V] TLS INSEGURO") ?? false)
    await scrollOptions("up", () => optionsBounds().cookieVisible)
    await click("http-request-cookie-jar")
    await settle(() => tui?.captureCharFrame().includes("[C] Cookie jar: ignorar") ?? false)
  },
)

test("HTTP options remain painted after keyboard updates, tab changes and maximize/restore", async () => {
  tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("a")
  await key("F10")
  await settle(() => tui?.captureCharFrame().includes("[C] Cookie jar: usar") ?? false)

  await key("c")
  await key("v", true)
  await settle(() => tui?.captureCharFrame().includes("[Shift+V] TLS INSEGURO") ?? false)
  expect(tui.captureCharFrame()).toContain("[C] Cookie jar: ignorar")

  await key("f")
  await key("a")
  await key("F10")
  await key("F10")
  await settle(() => tui?.captureCharFrame().includes("[Shift+V] TLS INSEGURO") ?? false)
  expect(tui.captureCharFrame()).toContain("[C] Cookie jar: ignorar")

  await key("c")
  await key("v", true)
  await settle(() => tui?.captureCharFrame().includes("[Shift+V] TLS: verificar") ?? false)
  expect(tui.captureCharFrame()).toContain("[C] Cookie jar: usar")
})
