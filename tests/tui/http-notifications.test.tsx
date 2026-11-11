import { openLocalHttp, openHttpWorkspaceChooser } from "./http-source"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { InputRenderable, TextRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { readFile, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { act } from "react"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { livePostmanCollection } from "../../packages/feature-http/src/postman/live-view"
import { POSTMAN_EDIT_CONFLICT } from "../../packages/feature-http/src/postman/live-save"
import {
  loadPostmanAccount,
  removePostmanAccount,
  savePostmanAccount,
} from "../../packages/feature-http/src/postman/account"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

const node = (id: string) => tui?.renderer.root.findDescendantById(id)
const text = (id: string) => (node(id) as TextRenderable | undefined)?.plainText ?? ""

async function settle(check: () => boolean) {
  for (let attempt = 0; attempt < 120; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(`HTTP notifications did not settle:\n${tui?.captureCharFrame()}`)
}

async function click(id: string, scopeId?: string) {
  const find = () => (scopeId ? node(scopeId)?.findDescendantById(id) : node(id))
  await settle(() => Boolean(find()?.width))
  const target = find()
  if (!target) throw new Error(`Missing mouse target: ${id}`)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}

async function dismissNotifications() {
  while (node("app-notification-dismiss-0")) {
    const message = node("app-notification-message-0")
    await settle(
      () => node("app-notification-0")?.screenX === node("app-notification-stack")?.screenX,
    )
    await click("app-notification-dismiss-0")
    await settle(() => node("app-notification-message-0") !== message)
  }
}

test("Postman deletion conflicts use notifications, preserve footer hints and notify on retry", async () => {
  const root = process.env.TUIMINAL_HTTP_HOME
  if (!root) throw new Error("HTTP test home is missing")
  const collectionPath = resolve(root, "postman/notification-c1.http")
  const originalFetch = globalThis.fetch
  const originalAccount = await loadPostmanAccount()
  let remoteUrl = "https://example.test/users"
  let deletions = 0
  let reads = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (init?.method === "DELETE") {
      deletions += 1
      return Response.json({})
    }
    if (path === "/workspaces")
      return Response.json({ workspaces: [{ id: "notification-w1", name: "Notifications" }] })
    if (path === "/environments") return Response.json({ environments: [] })
    if (path === "/collections")
      return Response.json({
        collections: [{ id: "notification-c1", name: "Notification Conflict" }],
      })
    if (path === "/workspaces/notification-w1/global-variables")
      return Response.json({ values: [] })
    if (path === "/collections/notification-c1") {
      reads += 1
      return Response.json({
        collection: {
          info: {
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
          },
          item: [{ id: "r1", name: "List", request: { method: "GET", url: remoteUrl } }],
        },
      })
    }
    throw new Error(`Unexpected fixture request: ${path}`)
  }) as typeof fetch
  try {
    await savePostmanAccount({ apiKey: "PMAK-notification-fixture", region: "us" })
    tui = await testRender(
      <NotificationProvider>
        <HttpClient active />
      </NotificationProvider>,
      { width: 160, height: 42 },
    )
    await openLocalHttp(tui)
    await click("http-change-source")
    await click("http-source-postman-card")
    await openHttpWorkspaceChooser(tui)
    await settle(() => Boolean(node("http-postman-workspace-notification-w1")))
    await act(async () => tui?.mockInput.pressEnter())
    await settle(() => !node("http-postman-modal"))
    await click("http-collection-file-postman/notification-c1.http")
    await click("http-navigation-project-postman/notification-c1.http#r1")
    await click("http-navigation-collection")
    await dismissNotifications()
    const origin = tui.renderer.currentFocusedRenderable?.id
    const footer = text("http-workspace-footer-copy")
    await expect(readFile(collectionPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    remoteUrl = "https://example.test/changed"
    const conflict = POSTMAN_EDIT_CONFLICT

    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => tui?.mockInput.pressKey("a"))
      await click("http-collection-menu-delete")
      const previousReads = reads
      await click("http-collection-action-apply")
      await settle(() => text("app-notification-message-0") === conflict)
      expect(reads).toBeGreaterThan(previousReads)
      expect(text("http-workspace-footer-copy")).toBe(footer)
      expect(footer).toContain("[Tab/H/L]")
      expect(text("http-workspace-footer-copy")).not.toContain("mudou no Postman")
      expect(Boolean(node("app-notification-1"))).toBe(false)
      expect(tui.renderer.currentFocusedRenderable?.id).toBe(origin)
      expect(node("http-collection-action-form")).toBeUndefined()
      await expect(readFile(collectionPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
      expect(deletions).toBe(0)
      await dismissNotifications()
      expect(tui.renderer.currentFocusedRenderable?.id).toBe(origin)
      expect(tui.captureCharFrame()).not.toContain("mudou no Postman")
    }
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    globalThis.fetch = originalFetch
    if (originalAccount) await savePostmanAccount(originalAccount)
    else await removePostmanAccount()
    await rm(collectionPath, { force: true })
    await rm(`${collectionPath}.postman.json`, { force: true })
  }
})

test("multipart save keeps unsaved edits on API failure and retries without a local file", async () => {
  const root = process.env.TUIMINAL_HTTP_HOME
  if (!root) throw new Error("HTTP test home is missing")
  const relativePath = "postman/body-c1.http"
  const collectionPath = resolve(root, relativePath)
  const originalFetch = globalThis.fetch
  const originalAccount = await loadPostmanAccount()
  let fail = true
  const updates: Record<string, unknown>[] = []
  const collection = {
    info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      {
        id: "r1",
        name: "Upload",
        request: {
          method: "POST",
          url: "https://example.invalid/upload",
          body: {
            mode: "formdata",
            formdata: [
              { key: "label", type: "text", value: "before" },
              { key: "files", type: "file", src: "/fixture/photo-one.png" },
              { key: "files", type: "file", src: "/fixture/photo-two.png" },
            ] as Record<string, unknown>[],
          },
        },
      },
    ],
  }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (path === "/workspaces")
      return Response.json({ workspaces: [{ id: "body-w1", name: "Body" }] })
    if (path === "/environments") return Response.json({ environments: [] })
    if (path === "/collections")
      return Response.json({ collections: [{ id: "body-c1", name: "Notification Body" }] })
    if (path === "/workspaces/body-w1/global-variables") return Response.json({ values: [] })
    if (path === "/collections/body-c1") return Response.json({ collection })
    if (path === "/collections/body-c1/requests/r1" && init?.method === "PUT") {
      const update = JSON.parse(String(init.body))
      updates.push(update)
      if (fail) return new Response("fixture failure", { status: 503 })
      const item = collection.item[0]
      if (!item) throw new Error("Missing body fixture")
      item.request.body.formdata = update.data.map((field: Record<string, unknown>) => ({
        key: field.key,
        type: field.type,
        disabled: field.enabled === false,
        ...(field.type === "file" ? { src: field.value } : { value: field.value }),
      }))
      return Response.json({})
    }
    throw new Error(`Unexpected body fixture endpoint: ${path}`)
  }) as typeof fetch
  try {
    await savePostmanAccount({ apiKey: "PMAK-body-fixture", region: "us" })
    tui = await testRender(
      <NotificationProvider>
        <HttpClient active />
      </NotificationProvider>,
      { width: 160, height: 42 },
    )
    await openLocalHttp(tui)
    await click("http-change-source")
    await click("http-source-postman-card")
    await openHttpWorkspaceChooser(tui)
    await settle(() => Boolean(node("http-postman-workspace-body-w1")))
    await act(async () => tui?.mockInput.pressEnter())
    await settle(() => !node("http-postman-modal"))
    await click(`http-collection-file-${relativePath}`)
    await click(`http-navigation-project-${relativePath}#r1`)
    const request = livePostmanCollection({ id: "body-c1", name: "Notification Body" }, collection)
      .requests[0]!.request
    await settle(() => Boolean(node(`http-request-pane-${request.id}`)?.visible))
    await dismissNotifications()
    await click("http-request-view-body", `http-request-pane-${request.id}`)
    const valueId = `http-key-value-value-${request.body.multipart?.[0]?.id}`
    await click(valueId)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === valueId)
    await act(async () => {
      const input = node(valueId) as InputRenderable
      input.selectAll()
      await tui?.mockInput.pasteBracketedText("after")
    })
    await settle(() => (node(valueId) as InputRenderable)?.value === "after")
    await act(async () => tui?.mockInput.pressKey("s", { ctrl: true }))
    await settle(() => tui?.captureCharFrame().includes("503") ?? false)
    expect(tui.captureCharFrame()).not.toContain("SUCESSO · HTTP")
    await expect(readFile(collectionPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    expect((node(valueId) as InputRenderable).value).toBe("after")
    expect(tui.captureCharFrame()).not.toContain("SALVO LOCALMENTE")
    await dismissNotifications()
    fail = false
    await act(async () => tui?.mockInput.pressKey("s", { ctrl: true }))
    await settle(() => tui?.captureCharFrame().includes("REQUEST SALVO NO POSTMAN") ?? false)
    expect(updates).toHaveLength(2)
    expect(updates[1]).toMatchObject({
      dataMode: "formdata",
      data: [
        { key: "label", value: "after", type: "text" },
        { key: "files", value: "/fixture/photo-one.png", type: "file" },
        { key: "files", value: "/fixture/photo-two.png", type: "file" },
      ],
    })
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    globalThis.fetch = originalFetch
    if (originalAccount) await savePostmanAccount(originalAccount)
    else await removePostmanAccount()
    await rm(collectionPath, { force: true })
    await rm(`${collectionPath}.postman.json`, { force: true })
  }
})
