import { openLocalHttp, openHttpWorkspaceChooser } from "./http-source"
import "./setup"
import { expect, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { readFile, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { act } from "react"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import {
  loadPostmanAccount,
  removePostmanAccount,
  savePostmanAccount,
} from "../../packages/feature-http/src/postman/account"

test("folder creation reads current Postman data without local collections or an import conflict", async () => {
  const root = process.env.TUIMINAL_HTTP_HOME
  if (!root) throw new Error("Missing isolated HTTP home")
  const path = "postman/refresh-c1.http"
  const absolute = resolve(root, path)
  const originalFetch = globalThis.fetch
  const originalAccount = await loadPostmanAccount()
  let tui: TestRendererSetup | undefined
  let creations = 0
  const collection = {
    info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      { id: "r1", name: "List", request: { method: "GET", url: "https://example.invalid/before" } },
    ] as Array<Record<string, unknown>>,
  }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const endpoint = new URL(String(input)).pathname
    if (endpoint === "/workspaces")
      return Response.json({ workspaces: [{ id: "refresh-w1", name: "Refresh" }] })
    if (endpoint === "/environments") return Response.json({ environments: [] })
    if (endpoint === "/collections")
      return Response.json({ collections: [{ id: "refresh-c1", name: "Folder Refresh" }] })
    if (endpoint === "/workspaces/refresh-w1/global-variables") return Response.json({ values: [] })
    if (endpoint === "/collections/refresh-c1") {
      return Response.json({ collection })
    }
    if (endpoint === "/collections/refresh-c1/folders" && init?.method === "POST") {
      creations += 1
      const body = JSON.parse(String(init.body))
      collection.item.push({ id: "f1", name: body.name, item: [] })
      return Response.json({ data: { id: "f1" } })
    }
    throw new Error(`Unexpected fixture endpoint: ${endpoint}`)
  }) as typeof fetch
  const node = (id: string) => tui?.renderer.root.findDescendantById(id)
  const settle = async (check: () => boolean) => {
    for (let i = 0; i < 150; i++) {
      await act(async () => {
        await Bun.sleep(10)
        await tui?.renderOnce()
      })
      if (check()) return
    }
    throw new Error(tui?.captureCharFrame())
  }
  const click = async (id: string) => {
    await settle(() => Boolean(node(id)?.width))
    const target = node(id)
    if (!target) throw new Error(`Missing ${id}`)
    await act(async () => {
      await tui?.mockMouse.click(target.screenX + 1, target.screenY)
    })
  }
  const key = async (name: string, ctrl = false) => {
    await act(async () => {
      tui?.mockInput.pressKey(name, { ctrl })
      await Bun.sleep(name === "ESCAPE" ? 70 : 10)
      await tui?.renderOnce()
    })
  }
  const focused = () => tui?.renderer.currentFocusedRenderable?.id
  try {
    await savePostmanAccount({ apiKey: "PMAK-folder-refresh-fixture", region: "us" })
    tui = await testRender(
      <NotificationProvider>
        <HttpClient active />
      </NotificationProvider>,
      { width: 120, height: 36 },
    )
    await openLocalHttp(tui)
    await click("http-change-source")
    await click("http-source-postman-card")
    await openHttpWorkspaceChooser(tui)
    await settle(() => Boolean(node("http-postman-workspace-refresh-w1")))
    await key("RETURN")
    await settle(() => !node("http-postman-modal"))
    await click(`http-collection-file-${path}`)
    await click(`http-navigation-project-${path}#r1`)
    await click("http-navigation-collection")
    await click(`http-collection-file-${path}`)
    await key("a")
    await click("http-collection-menu-create-folder")
    await settle(() => focused() === "http-collection-name-input")
    await act(async () => tui?.mockInput.typeText("Customers"))
    collection.item[0] = {
      id: "r1",
      name: "List",
      request: { method: "GET", url: "https://example.invalid/after" },
    }
    await key("RETURN")
    await settle(() => !node("http-collection-name-input"))
    expect(creations).toBe(1)
    expect(node("http-postman-conflict")).toBeUndefined()
    await expect(readFile(absolute, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(`${absolute}.postman.json`, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    })
    expect(collection.item).toContainEqual({ id: "f1", name: "Customers", item: [] })
  } finally {
    act(() => tui?.renderer.destroy())
    globalThis.fetch = originalFetch
    if (originalAccount) await savePostmanAccount(originalAccount)
    else await removePostmanAccount()
    await rm(absolute, { force: true })
    await rm(`${absolute}.postman.json`, { force: true })
  }
})
