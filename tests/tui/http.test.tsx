import "./setup"
import { afterEach, afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { act } from "react"
import { HttpClient } from "../../src/features/http/HttpWorkspace"

let tui: TestRendererSetup | undefined

async function settle(until: () => boolean) {
  if (!tui) throw new Error("TUI HTTP não montada")
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(`TUI HTTP não estabilizou:\n${tui.captureCharFrame()}`)
}

async function key(name: string, ctrl = false) {
  await act(async () => {
    tui?.mockInput.pressKey(name, { ctrl })
    await Bun.sleep(name === "ESCAPE" || name.startsWith("F") ? 60 : 5)
    await tui?.renderOnce()
  })
}

async function press(id: string) {
  await act(async () => {
    const renderable = tui?.renderer.root.findDescendantById(id) as
      | { press?: () => void }
      | undefined
    if (!renderable) throw new Error(`Renderable ${id} não encontrado`)
    if (!renderable.press) throw new Error(`Renderable ${id} não aceita press`)
    renderable.press()
    await Bun.sleep(5)
    await tui?.renderOnce()
  })
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

describe("HTTP TUI", () => {
  test("keeps document editing mounted across tabs and responsive layouts", async () => {
    tui = await testRender(<HttpClient active />, { width: 160, height: 36 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    expect(tui.captureCharFrame()).toContain("REQUISIÇÃO")
    expect(tui.captureCharFrame()).toContain("RESPOSTA")
    expect(tui.captureCharFrame()).toContain("SCRATCH")

    await key("ESCAPE")
    await key("n", true)
    expect(tui.captureCharFrame().match(/GET Scratch/g)).toHaveLength(4)
    await key("ESCAPE")
    await key("h")
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-name-"),
    )
    const focusedEditor = tui.renderer.currentFocusedRenderable

    act(() => tui?.resize(68, 20))
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain("[1] Requisição")
    expect(tui.captureCharFrame()).toContain("[2] Resposta")
    expect(tui.renderer.currentFocusedRenderable).toBe(focusedEditor)
  })

  test("opens contextual help and jump mode as one keyboard layer", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await press("http-help-button")
    await settle(() => tui?.captureCharFrame().includes("AJUDA HTTP") ?? false)
    expect(tui.captureCharFrame()).toContain("AJUDA HTTP")
    expect(tui.captureCharFrame()).toContain("ATALHOS DO CONTEXTO ATUAL")
    await key("ESCAPE")
    expect(tui.captureCharFrame()).not.toContain("AJUDA HTTP")

    await press("http-jump-button")
    await settle(() => tui?.captureCharFrame().includes("IR PARA") ?? false)
    expect(tui.captureCharFrame()).toContain("IR PARA")
    await key("h")
    expect(tui.captureCharFrame()).not.toContain("IR PARA")
    expect(tui.captureCharFrame()).toContain("HEADERS")
  })

  describe("execution", () => {
    let server: Server
    let url = ""

    beforeAll(async () => {
      server = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" })
        response.end('{"answer":42}')
      })
      server.listen(0, "127.0.0.1")
      await new Promise<void>((resolve) => server.once("listening", resolve))
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/answer`
    })

    afterAll(async () => {
      if (server.listening) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
      }
      server.closeAllConnections()
    })

    test("sends from the omnibar and renders the real response", async () => {
      tui = await testRender(<HttpClient active initialUrlRequest={{ id: 1, url }} />, {
        width: 120,
        height: 32,
      })
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      act(() => tui?.mockInput.pressEnter())
      await settle(() => tui?.captureCharFrame().includes('"answer": 42') ?? false)
      const frame = tui.captureCharFrame()
      expect(frame).toContain("200 OK")
      expect(frame).toContain('"answer": 42')
    })
  })
})
