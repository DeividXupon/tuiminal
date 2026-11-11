import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { withNotifications } from "../../packages/core/src/notifications/index"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"

const HttpClientWithNotifications = withNotifications(HttpClient)
let tui: TestRendererSetup | undefined
let server: ReturnType<typeof Bun.serve> | undefined
let releaseResponse: (() => void) | undefined
const requests: { method: string; url: string; body: string; headers: Headers }[] = []
const payload = { message: "A response that can be copied", count: 2 }
afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  releaseResponse?.()
  releaseResponse = undefined
  requests.length = 0
  await server?.stop(true)
  server = undefined
})
async function settle(condition: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (condition()) return
  }
  throw new Error(`HTTP did not settle:\n${tui?.captureCharFrame()}`)
}
async function mount(width: number, slow = false, notifications = false) {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      requests.push({
        method: request.method,
        url: request.url,
        body: await request.text(),
        headers: request.headers,
      })
      if (slow)
        await new Promise<void>((resolve) => {
          releaseResponse = resolve
          request.signal.addEventListener("abort", () => resolve(), { once: true })
        })
      return Response.json(payload)
    },
  })
  const Client = notifications ? HttpClientWithNotifications : HttpClient
  tui = await testRender(
    <Client
      active
      initialUrlRequest={{ id: width, url: `http://127.0.0.1:${server.port}/response` }}
    />,
    { width, height: 32 },
  )
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
}
function node(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}`)
  return target
}
function inside(id: string, ownerId: string) {
  const target = node(id)
  const owner = node(ownerId)
  expect(target.screenX).toBeGreaterThanOrEqual(owner.screenX)
  expect(target.screenX + target.width).toBeLessThanOrEqual(owner.screenX + owner.width)
  expect(target.screenY + target.height).toBeLessThanOrEqual(owner.screenY + owner.height)
}
async function click(id: string) {
  await settle(() => true)
  const target = node(id)
  await act(async () =>
    tui?.mockMouse.click(target.screenX + Math.min(1, target.width - 1), target.screenY),
  )
  await tui?.renderOnce()
}
async function clickText(label: string, ownerId: string) {
  await settle(() => true)
  const owner = node(ownerId)
  const lines = tui?.captureCharFrame().split("\n") ?? []
  for (let y = owner.screenY; y < owner.screenY + owner.height; y++) {
    const line = lines[y]?.slice(owner.screenX, owner.screenX + owner.width) ?? ""
    const x = line.indexOf(label)
    if (x < 0) continue
    await act(async () => tui?.mockMouse.click(owner.screenX + x + Math.floor(label.length / 2), y))
    await tui?.renderOnce()
    return
  }
  throw new Error(`No visible ${label} in ${ownerId}:\n${tui?.captureCharFrame()}`)
}

test.each([52, 132])(
  "request tabs and all body formats remain mouse-accessible at %s columns",
  async (width) => {
    await mount(width)
    await act(async () => tui?.mockInput.pressKey("ESCAPE"))
    await settle(() => tui?.renderer.currentFocusedRenderable?.id !== "http-url-input")
    inside("http-request-view-more", "http-request-pane-http-scratch-1")
    inside("http-request-view-next", "http-request-pane-http-scratch-1")
    await click("http-request-view-body")
    await clickText("FILE", "http-request-pane-http-scratch-1")
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-body-file-http-scratch-1-drop")),
    )
    inside("http-body-kind-next", "http-request-pane-http-scratch-1")
  },
)

test.each([52, 132])(
  "response copy and save remain visible and usable at %s columns",
  async (width) => {
    await mount(width)
    await act(async () => tui?.mockInput.pressEnter())
    await settle(() => tui?.captureCharFrame().includes("200 OK") ?? false)
    inside("http-response-copy-http-scratch-1", "http-response-pane-http-scratch-1")
    if (!tui) throw new Error("Missing HTTP renderer")
    const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
    await clickText("Copiar", "http-response-pane-http-scratch-1")
    expect(copy).toHaveBeenCalledWith(JSON.stringify(payload, null, 2))
    const response = node("http-response-pane-http-scratch-1")
    const rows = tui
      ?.captureCharFrame()
      .split("\n")
      .slice(response.screenY, response.screenY + response.height)
    expect(
      rows?.map((row) => row.slice(response.screenX, response.screenX + response.width)).join("\n"),
    ).toContain("Salvar")
  },
)

async function type(value: string) {
  await act(async () => tui?.mockInput.typeText(value))
  await tui?.renderOnce()
}
async function key(name: string) {
  await act(async () => tui?.mockInput.pressKey(name))
  await tui?.renderOnce()
}

test("a mouse-led flow builds query, headers, JSON and auth and sends exactly what was entered", async () => {
  await mount(160)
  await click("http-method-button")
  // An empty table exposes its entry action even while the URL owns focus.
  await click("http-key-value-enter-http-scratch-1-query")
  await settle(() =>
    (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-name-"),
  )
  await type("limit")
  await key("TAB")
  await settle(() =>
    (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-value-"),
  )
  await type("2")
  await click("http-request-view-headers")
  await click("http-key-value-enter-http-scratch-1-header")
  await settle(
    () =>
      tui?.renderer.currentFocusedRenderable?.id === "http-key-value-section-http-scratch-1-header",
  )
  await key("ARROW_DOWN")
  await key("RETURN")
  await settle(() =>
    (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-name-"),
  )
  await type("X-UX-Test")
  await key("TAB")
  await settle(() =>
    (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-value-"),
  )
  await type("synthetic")
  await click("http-request-view-body")
  await clickText("JSON", "http-request-pane-http-scratch-1")
  await click("http-body-editor-http-scratch-1")
  await act(async () => tui?.mockInput.pasteBracketedText('{"name":"Ana"}'))
  await click("http-request-view-auth")
  await clickText("Bearer", "http-request-pane-http-scratch-1")
  await click("http-auth-token-http-scratch-1")
  await type("synthetic-local-token")
  await click("http-send-button")
  await settle(() => tui?.captureCharFrame().includes("200 OK") ?? false)
  expect(requests).toHaveLength(1)
  const received = requests[0]
  if (!received) throw new Error("The local server received no request")
  expect(received.method).toBe("POST")
  expect(new URL(received.url).searchParams.get("limit")).toBe("2")
  expect(received.headers.get("x-ux-test")).toBe("synthetic")
  expect(received.headers.get("authorization")).toBe("Bearer synthetic-local-token")
  expect(JSON.parse(received.body)).toEqual({ name: "Ana" })
})

test("the cancel action shown inside a pending response is clickable", async () => {
  await mount(52, true)
  await click("http-send-button")
  await settle(() => requests.length === 1)
  await settle(() =>
    Boolean(tui?.renderer.root.findDescendantById("http-response-cancel-http-scratch-1")),
  )
  await clickText("Cancelar", "http-response-pane-http-scratch-1")
  await settle(() => tui?.captureCharFrame().includes("REQUISIÇÃO CANCELADA") ?? false)
  expect(requests).toHaveLength(1)
  expect(
    tui?.renderer.root.findDescendantById("http-response-cancel-http-scratch-1"),
  ).toBeUndefined()
})

test("narrow request options and bottom actions remain clickable", async () => {
  await mount(52, false, true)
  await click("http-request-view-more")
  await click("http-request-cookie-jar")
  await settle(() => tui?.captureCharFrame().includes("ignorar") ?? false)
  inside("http-request-cookie-jar", "http-request-pane-http-scratch-1")
  await click("http-request-tls-verification")
  await settle(() => tui?.captureCharFrame().includes("TLS INSEGURO") ?? false)
  inside("http-request-tls-verification", "http-request-pane-http-scratch-1")
  await key("ESCAPE")
  await key("j")
  await key("j")
  await key("l")
  await key("l")
  await settle(() => tui?.captureCharFrame().includes("Duplicar") ?? false)
  await clickText("Duplicar", "http-request-pane-http-scratch-1")
  await settle(() => tui?.captureCharFrame().includes("REQUEST DUPLICADO") ?? false)
  expect(node("http-document-tabs").getChildren().length).toBeGreaterThan(1)
})
