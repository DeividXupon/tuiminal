import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { HttpClient } from "../../src/features/http/HttpWorkspace"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (until()) return
  }
  throw new Error(`HTTP options did not settle:\n${tui?.captureCharFrame()}`)
}

async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    await Bun.sleep(name === "ESCAPE" || name.startsWith("F") ? 60 : 5)
    await tui?.renderOnce()
  })
}

test("HTTP options remain painted after keyboard updates, tab changes and maximize/restore", async () => {
  tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("o")
  await key("F10")
  await settle(() => tui?.captureCharFrame().includes("[C] Cookie jar: usar") ?? false)

  await key("c")
  await key("v")
  await settle(() => tui?.captureCharFrame().includes("[V] TLS INSEGURO") ?? false)
  expect(tui.captureCharFrame()).toContain("[C] Cookie jar: ignorar")

  await key("h")
  await key("ESCAPE")
  await key("o")
  await key("F10")
  await key("F10")
  await settle(() => tui?.captureCharFrame().includes("[V] TLS INSEGURO") ?? false)
  expect(tui.captureCharFrame()).toContain("[C] Cookie jar: ignorar")

  await key("c")
  await key("v")
  await settle(() => tui?.captureCharFrame().includes("[V] TLS: verificar") ?? false)
  expect(tui.captureCharFrame()).toContain("[C] Cookie jar: usar")
})
