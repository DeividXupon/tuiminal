import { openLocalHttp, openHttpWorkspaceChooser } from "./http-source"
import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { readFile, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import type { InputRenderable, ScrollBoxRenderable, TextRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

const originalFetch = globalThis.fetch
const originalSecrets = Bun.secrets
const settings = getUiSettings()
const root = process.env.TUIMINAL_HTTP_HOME ?? ""
let tui: TestRendererSetup | undefined
const writes: { workspace: string | null; name: string }[] = []
let beforeCreate: (() => Promise<Response | undefined>) | undefined
afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  globalThis.fetch = originalFetch
  Object.assign(Bun, { secrets: originalSecrets })
  updateUiSettings(settings)
  const files = await readdir(join(root, "postman")).catch(() => [])
  await Promise.all(
    files
      .filter(
        (file) => file.startsWith("workspace-menu-") || file.startsWith("b8-caas---dashboard.http"),
      )
      .map((file) => rm(join(root, "postman", file), { force: true })),
  )
  writes.length = 0
  beforeCreate = undefined
})
function find(id: string) {
  return tui?.renderer.root.findDescendantById(id)
}
function node(id: string) {
  const target = find(id)
  if (!target) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  return target
}
async function settle(check: () => boolean) {
  for (let i = 0; i < 160; i++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
async function click(id: string, button: 0 | 1 | 2 = 0) {
  await settle(() => Boolean(find(id)?.width && find(id)?.height))
  const target = node(id)
  await act(async () => {
    await tui?.mockMouse.click(
      target.screenX + Math.floor(target.width / 2),
      target.screenY + Math.floor(target.height / 2),
      button,
    )
    await tui?.renderOnce()
  })
}
async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    await Bun.sleep(name === "ESCAPE" ? 70 : 10)
    await tui?.renderOnce()
  })
}
async function mount(
  width: number,
  workspace = "one",
  firstName = "workspace-menu-first",
  firstItems?: unknown[],
) {
  updateUiSettings({ language: "pt-BR", layout: "framed" })
  Object.assign(Bun, {
    secrets: { get: async () => JSON.stringify({ apiKey: "PMAK-fixture", region: "us" }) },
  })
  const collections: Record<string, { info: { name: string; schema: string }; item: unknown[] }> =
    {}
  const schema = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  const owners: Record<string, string> = { first: "one", second: "two" }
  for (const id of ["first", "second"])
    collections[id] = {
      info: { name: id === "first" ? firstName : `workspace-menu-${id}`, schema },
      item:
        id === "first" && firstItems
          ? firstItems
          : [
              {
                id: `${id}-request`,
                name: "List",
                request: { method: "GET", url: "https://example.invalid" },
              },
            ],
    }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname === "/workspaces")
      return Response.json({
        workspaces: [
          { id: "one", name: "First [X]" },
          { id: "two", name: "Second" },
          { id: "empty", name: "Empty" },
        ],
      })
    if (url.pathname === "/environments") return Response.json({ environments: [] })
    if (url.pathname.endsWith("/global-variables")) return Response.json({ values: [] })
    if (url.pathname === "/collections" && init?.method === "POST") {
      const payload = JSON.parse(String(init.body)) as {
        collection: { info: { name: string; schema: string }; item: unknown[] }
      }
      writes.push({
        workspace: url.searchParams.get("workspace"),
        name: payload.collection.info.name,
      })
      const response = await beforeCreate?.()
      if (response) return response
      collections.created = payload.collection
      owners.created = url.searchParams.get("workspace") ?? ""
      return Response.json({ collection: { id: "created", name: payload.collection.info.name } })
    }
    if (url.pathname === "/collections")
      return Response.json({
        collections: Object.entries(collections)
          .filter(([id]) => owners[id] === url.searchParams.get("workspace"))
          .map(([id, collection]) => ({ id, name: collection.info.name })),
      })
    const collection = collections[url.pathname.slice("/collections/".length)]
    if (url.pathname.startsWith("/collections/") && collection) return Response.json({ collection })
    throw new Error(`Unexpected fixture API call ${url.pathname}`)
  }) as typeof fetch
  tui = await testRender(<HttpClient active />, { width, height: 30 })
  await openLocalHttp(tui)
  await click("http-change-source")
  await click("http-source-postman-card")
  await openHttpWorkspaceChooser(tui)
  await settle(() => Boolean(find(`http-postman-workspace-${workspace}`)))
  await click(`http-postman-workspace-${workspace}`)
  await settle(
    () => !find("http-postman-modal") && Boolean(find("http-collection-workspace-heading")),
  )
  await key("ESCAPE")
  await key("c")
  await click("http-collection-workspace-heading")
  await settle(() => Boolean(find("http-collection-actions-workspace:postman")))
  return collections
}
async function openMenu() {
  await key("a")
  await settle(() => Boolean(find("http-collection-menu")))
}

for (const width of [52, 120])
  test(`workspace header opens a bounded menu and switches workspaces at ${width} columns`, async () => {
    await mount(width)
    await openMenu()
    expect(find("http-collection-menu-create-collection")).toBeDefined()
    expect(find("http-collection-menu-select-workspace")).toBeDefined()
    expect(find("http-collection-menu-create-workspace")).toBeDefined()
    expect(find("http-collection-menu-create-request")).toBeUndefined()
    expect(find("http-collection-menu-delete")).toBeUndefined()
    const menu = node("http-collection-menu")
    expect(menu.screenX).toBeGreaterThanOrEqual(0)
    expect(menu.screenX + menu.width).toBeLessThanOrEqual(width)
    await key("ESCAPE")
    expect(find("http-collection-menu")).toBeUndefined()
    await click("http-collection-actions-workspace:postman")
    await settle(() => Boolean(find("http-collection-menu")))
    await click("http-collection-menu-select-workspace")
    await settle(() => Boolean(find("http-postman-workspace-two")))
    expect(find("http-collection-menu")).toBeUndefined()
    await key("ESCAPE")
    await settle(() => !find("http-postman-modal"))
    expect(find("http-collection-file-postman/first.http")).toBeDefined()
    await key("ARROW_DOWN")
    expect(find("http-collection-actions-workspace:postman")).toBeUndefined()
    await click("http-collection-workspace-heading", 2)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-menu")
    expect(find("http-collection-menu-create-collection")).toBeDefined()
    expect(find("http-collection-menu-select-workspace")).toBeDefined()
    await key("ESCAPE")
    await openMenu()
    await key("ARROW_DOWN")
    await key("RETURN")
    await settle(() => Boolean(find("http-postman-workspace-two")))
    await click("http-postman-workspace-two")
    await settle(
      () =>
        !find("http-postman-modal") && Boolean(find("http-collection-file-postman/second.http")),
    )
    expect(find("http-collection-file-postman/first.http")).toBeUndefined()
    expect(tui?.captureCharFrame()).toContain("Second")
    expect(writes).toEqual([])
  })

test("workspace actions stay reachable by keyboard and create an inline collection in an empty workspace", async () => {
  await mount(120, "empty")
  await key("HOME")
  await key("RETURN")
  await settle(() => Boolean(find("http-collection-menu-create-collection")))
  await key("RETURN")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input")
  const input = node("http-collection-name-input") as InputRenderable
  expect(input.value).toBe("")
  expect(find("http-collection-action-form")).toBeUndefined()
  expect(find("http-collection-draft")).toBeDefined()
  expect(node("http-collection-draft").height).toBe(1)
  expect(find("http-collection-action-apply")).toBeUndefined()
  expect(find("http-collection-action-cancel")).toBeUndefined()
  await key("ESCAPE")
  expect(writes).toEqual([])
  await openMenu()
  await click("http-collection-menu-create-collection")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input")
  await act(async () => {
    tui?.mockInput.typeText("workspace-menu-created")
    await tui?.renderOnce()
  })
  await key("RETURN")
  await settle(
    () =>
      Boolean(find("http-collection-file-postman/created.http")) &&
      !find("http-collection-name-input"),
  )
  expect(writes).toEqual([{ workspace: "empty", name: "workspace-menu-created" }])
  await expect(
    readFile(join(root, "postman/created.http.postman.json"), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" })
  expect(find("http-collection-actions-file:postman/created.http")).toBeDefined()
  await key("ARROW_UP")
  expect(find("http-collection-actions-workspace:postman")).toBeDefined()
  await key("ARROW_DOWN")
  expect(find("http-collection-actions-file:postman/created.http")).toBeDefined()
  await key("HOME")
  const scroll = node("http-collection-scroll") as ScrollBoxRenderable
  expect(scroll.scrollTop).toBe(0)
  await key("a")
  await settle(() => Boolean(find("http-collection-menu-select-workspace")))
})

for (const width of [52, 120])
  test(`inline saving animates while Postman is pending and preserves the name after failure at ${width} columns`, async () => {
    await mount(width, "empty")
    await openMenu()
    await click("http-collection-menu-create-collection")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input")
    const input = node("http-collection-name-input") as InputRenderable
    await act(async () => tui?.mockInput.typeText("workspace-menu-pending"))
    let finish: (response?: Response) => void = () => {}
    beforeCreate = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    const intervals = spyOn(globalThis, "setInterval")
    const clear = spyOn(globalThis, "clearInterval")
    const savingTimer = () => {
      const index = intervals.mock.calls.findLastIndex((call) => call[1] === 80)
      expect(index).toBeGreaterThanOrEqual(0)
      return intervals.mock.results[index]?.value
    }
    try {
      await key("RETURN")
      await settle(
        () => Boolean(find("http-collection-name-loading")?.width) && writes.length === 1,
      )
      const loader = node("http-collection-name-loading") as TextRenderable
      const firstTimer = savingTimer()
      expect(loader.screenY).toBe(input.screenY)
      expect(loader.screenX + loader.width).toBeLessThanOrEqual(width)
      expect(node("http-collection-draft").height).toBe(1)
      expect(input.value).toBe("workspace-menu-pending")
      const glyph = loader.plainText
      await settle(() => loader.plainText !== glyph)
      await key("RETURN")
      await key("ESCAPE")
      await act(async () => {
        tui?.mockInput.typeText("ignored")
        await tui?.mockInput.pasteBracketedText("ignored paste")
      })
      expect(input.value).toBe("workspace-menu-pending")
      expect(writes).toHaveLength(1)
      await act(async () => finish(new Response("fixture failure", { status: 500 })))
      await settle(() => !find("http-collection-name-loading"))
      expect(loader.isDestroyed).toBe(true)
      expect(clear.mock.calls.some((call) => call[0] === firstTimer)).toBe(true)
      expect(node("http-collection-name-input")).toBe(input)
      expect(tui?.renderer.currentFocusedRenderable).toBe(input)
      expect(input.value).toBe("workspace-menu-pending")
      await key("RETURN")
      await settle(() => Boolean(find("http-collection-name-loading")) && writes.length === 2)
      const retryTimer = savingTimer()
      await act(async () => finish())
      await settle(
        () =>
          !find("http-collection-name-input") &&
          Boolean(find("http-collection-file-postman/created.http")),
      )
      expect(find("http-collection-name-loading")).toBeUndefined()
      expect(clear.mock.calls.some((call) => call[0] === retryTimer)).toBe(true)
      expect(writes).toEqual([
        { workspace: "empty", name: "workspace-menu-pending" },
        { workspace: "empty", name: "workspace-menu-pending" },
      ])
    } finally {
      await act(async () => finish())
      await settle(() => !find("http-collection-name-loading"))
      intervals.mockRestore()
      clear.mockRestore()
    }
  })

test("Postman collection names survive import, search, menus and reopening the workspace", async () => {
  const name = "B8 CaaS - Dashboard"
  const collections = await mount(160, "one", name)
  const path = "postman/first.http"
  const id = `http-collection-file-${path}`
  await expect(readFile(join(root, path), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  expect(tui?.captureCharFrame()).toContain(name)
  expect(tui?.captureCharFrame()).not.toContain("b8-caas---dashboard.http")
  await click(id, 2)
  await click("http-collection-menu-rename")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input")
  expect((node("http-collection-name-input") as InputRenderable).value).toBe(name)
  await key("ESCAPE")
  await key("f")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-search")
  await act(async () => tui?.mockInput.typeText(name))
  await settle(() => Boolean(find(id)))
  await key("ESCAPE")
  await click(id, 2)
  await click("http-collection-menu-run-collection")
  await settle(() => Boolean(find("http-collection-runner-target-name")))
  expect((node("http-collection-runner-target-name") as TextRenderable).plainText).toBe(name)
  await key("ESCAPE")
  await settle(
    () =>
      !find("http-collection-runner-modal") &&
      tui?.renderer.currentFocusedRenderable?.id === "http-navigation-collection",
  )
  await key("f")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-search")
  await act(async () => {
    ;(node("http-collection-search") as InputRenderable).value = ""
  })
  await key("ESCAPE")
  const collection = collections.first
  if (!collection) throw new Error("Missing fixture collection")
  collection.info.name = "B8 CaaS – Dashboard v2"
  await click("http-collection-workspace-heading", 2)
  await click("http-collection-menu-select-workspace")
  await click("http-postman-workspace-one")
  await settle(() => !find("http-postman-modal") && Boolean(find(id)))
  expect(tui?.captureCharFrame()).toContain(collection.info.name)
  await expect(readFile(join(root, path), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  expect(writes).toEqual([])
})

test("shows all five same-name Postman calls, keeps blank URLs and opens independent documents", async () => {
  const urls = ["", "", "https://example.invalid/third", "", ""]
  await mount(
    160,
    "one",
    "workspace-menu-lps",
    urls.map((url, index) => ({
      id: `r${index + 1}`,
      name: "New Request",
      request: { method: "GET", url },
    })),
  )
  const path = "postman/first.http"
  await click(`http-collection-file-${path}`)
  const ids = urls.map((_, index) => `${path}#r${index + 1}`)
  await settle(() => ids.every((id) => Boolean(find(`http-navigation-project-${id}`))))
  expect(tui?.captureCharFrame().match(/GET New Request/g)).toHaveLength(5)
  await click(`http-navigation-project-${ids[0]}`)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  expect((node("http-url-input") as InputRenderable).value).toBe("")
  await key("ESCAPE")
  await key("s")
  await settle(
    () => tui?.captureCharFrame().includes("Informe uma URL para enviar a requisição.") ?? false,
  )
  for (const [index, id] of ids.entries()) {
    const expectedUrl = urls[index]
    if (expectedUrl === undefined) throw new Error("Missing fixture URL")
    await click("http-navigation-collection")
    await click(`http-navigation-project-${id}`)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    expect((node("http-url-input") as InputRenderable).value).toBe(expectedUrl)
  }
  for (const id of ids) expect(find(`http-document-${id}`)).toBeDefined()
  await expect(readFile(join(root, `${path}.postman.json`), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  })
})
