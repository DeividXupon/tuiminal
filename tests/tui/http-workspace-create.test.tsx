import { openLocalHttp, openHttpWorkspaceChooser } from "./http-source"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"

const originalFetch = globalThis.fetch
const originalSecrets = Bun.secrets
let tui: TestRendererSetup | undefined
let failCreate = false
let failLoad = false
const writes: unknown[] = []
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  globalThis.fetch = originalFetch
  Object.assign(Bun, { secrets: originalSecrets })
  writes.length = 0
  failCreate = false
  failLoad = false
})
const node = (id: string) => tui?.renderer.root.findDescendantById(id)
async function settle(check: () => boolean) {
  for (let attempt = 0; attempt < 150; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
async function click(id: string) {
  await settle(() => Boolean(node(id)?.width))
  const target = node(id)
  if (!target) throw new Error(`Missing ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + Math.floor(target.width / 2), target.screenY)
    await tui?.renderOnce()
  })
}
async function key(name: string, ctrl = false) {
  await act(async () => {
    tui?.mockInput.pressKey(name, { ctrl })
    await tui?.renderOnce()
  })
}
async function mount(width: number) {
  Object.assign(Bun, {
    secrets: { get: async () => JSON.stringify({ apiKey: "PMAK-fixture", region: "us" }) },
  })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname === "/workspaces" && init?.method === "POST") {
      const body = JSON.parse(String(init.body))
      writes.push(body)
      if (failCreate) return Response.json({}, { status: 403 })
      return Response.json({ workspace: { id: "created", name: body.workspace.name } })
    }
    if (url.pathname === "/workspaces")
      return Response.json({ workspaces: [{ id: "original", name: "Original" }] })
    if (url.pathname === "/environments") return Response.json({ environments: [] })
    if (url.pathname === "/collections")
      return failLoad && url.searchParams.get("workspace") === "created"
        ? Response.json({}, { status: 503 })
        : Response.json({ collections: [] })
    if (url.pathname.endsWith("/global-variables")) return Response.json({ values: [] })
    throw new Error(`Unexpected fixture endpoint: ${url.pathname}`)
  }) as typeof fetch
  tui = await testRender(
    <NotificationProvider>
      <HttpClient active />
    </NotificationProvider>,
    { width, height: 38 },
  )
  await openLocalHttp(tui)
  await click("http-change-source")
  await click("http-source-postman-card")
  await openHttpWorkspaceChooser(tui)
  await click("http-postman-workspace-original")
  await settle(() => !node("http-postman-modal"))
}
async function openCreate() {
  if (!node("http-collection-workspace-heading")?.width) {
    await key("c")
  }
  await click("http-collection-workspace-heading")
  await key("a")
  await settle(() => Boolean(node("http-collection-menu-create-workspace")))
  await key("ARROW_DOWN")
  await key("ARROW_DOWN")
  await key("RETURN")
}

test.each([52, 120])(
  "[A] creates a workspace, cancels and retries safely at %s columns",
  async (width) => {
    await mount(width)
    await openCreate()
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-postman-workspace-name")
    const dialog = node("http-postman-create-workspace")
    if (!dialog) throw new Error("Missing creation dialog")
    expect(dialog.screenX).toBeGreaterThanOrEqual(0)
    expect(dialog.screenX + dialog.width).toBeLessThanOrEqual(width)
    await key("RETURN")
    expect(writes).toEqual([])
    await key("ESCAPE")
    await settle(() => !node("http-postman-create-workspace"))
    expect(writes).toEqual([])
    await openCreate()
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-postman-workspace-name")
    await act(async () => tui?.mockInput.typeText("  New workspace  "))
    failCreate = true
    await key("RETURN")
    await settle(() => tui?.captureCharFrame().includes("A conta não tem acesso") ?? false)
    expect((node("http-postman-workspace-name") as InputRenderable).value).toBe("  New workspace  ")
    expect(writes).toEqual([{ workspace: { name: "New workspace", type: "personal" } }])
    failCreate = false
    failLoad = true
    await key("RETURN")
    await settle(() => tui?.captureCharFrame().includes("Workspace criado.") ?? false)
    expect(writes).toHaveLength(2)
    expect(node("http-postman-workspace-name")).toBeUndefined()
    failLoad = false
    await key("RETURN")
    await settle(() => !node("http-postman-create-workspace"))
    expect(tui?.captureCharFrame()).toContain("New workspace")
    expect(writes).toHaveLength(2)
  },
  20_000,
)

test("workspace creation cannot discard an edited request", async () => {
  await mount(120)
  await key("n", true)
  await click("http-url-input")
  await act(async () => tui?.mockInput.typeText("/edited"))
  await openCreate()
  await settle(() => tui?.captureCharFrame().includes("Salve ou feche os requests") ?? false)
  expect(node("http-postman-create-workspace")).toBeUndefined()
  expect(writes).toEqual([])
  expect((node("http-url-input") as InputRenderable).value).toContain("/edited")
})
