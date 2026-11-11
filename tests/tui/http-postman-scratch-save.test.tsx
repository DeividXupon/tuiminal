import { openLocalHttp, openHttpWorkspaceChooser } from "./http-source"
import "./setup"
import { expect, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import {
  loadPostmanAccount,
  removePostmanAccount,
  savePostmanAccount,
} from "../../packages/feature-http/src/postman/account"

test.each([false, true])(
  "Postman deletion returns to empty when final; only explicit drafts can be saved (last open request: %s)",
  async (lastOpenRequest) => {
    const originalFetch = globalThis.fetch
    const originalAccount = await loadPostmanAccount()
    let tui: TestRendererSetup | undefined
    const path = "postman/scratch-delete.http"
    const documentId = `${path}#r1`
    const writes: string[] = []
    const request = { method: "GET", url: "https://example.invalid/before" }
    const collections: Record<string, { info: { name: string }; item: unknown[] }> = {
      "scratch-delete": {
        info: { name: "Delete this collection" },
        item: [{ id: "r1", name: "List", request }],
      },
      "scratch-keep": {
        info: { name: "Save here" },
        item: [{ id: "f1", name: "Folder", item: [] }],
      },
    }
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const endpoint = new URL(String(input)).pathname
      if (endpoint === "/workspaces")
        return Response.json({ workspaces: [{ id: "scratch-w1", name: "Scratch saves" }] })
      if (endpoint === "/environments") return Response.json({ environments: [] })
      if (endpoint === "/workspaces/scratch-w1/global-variables")
        return Response.json({ values: [] })
      if (endpoint === "/collections")
        return Response.json({
          collections: Object.entries(collections).map(([id, collection]) => ({
            id,
            name: collection.info.name,
          })),
        })
      if (endpoint === "/collections/scratch-delete/requests/r1" && init?.method === "PUT") {
        writes.push("update:r1")
        Object.assign(request, JSON.parse(String(init.body)))
        return Response.json({ data: { id: "r1" } })
      }
      if (endpoint === "/collections/scratch-delete" && init?.method === "DELETE") {
        writes.push("delete:collection")
        delete collections["scratch-delete"]
        return Response.json({ collection: { id: "scratch-delete" } })
      }
      const collection = collections[endpoint.slice("/collections/".length)]
      if (collection && init?.method === "GET") return Response.json({ collection })
      throw new Error(`Unexpected fixture API call: ${init?.method} ${endpoint}`)
    }) as typeof fetch
    const node = (id: string) => tui?.renderer.root.findDescendantById(id)
    async function settle(check: () => boolean) {
      for (let attempt = 0; attempt < 150; attempt++) {
        await act(async () => {
          await Bun.sleep(10)
          await tui?.renderOnce()
        })
        if (check()) return
      }
      throw new Error(`Postman Scratch did not settle:\n${tui?.captureCharFrame()}`)
    }
    async function click(id: string, button: 0 | 2 = 0) {
      await settle(() => Boolean(node(id)?.width))
      const target = node(id)
      if (!target) throw new Error(`Missing ${id}`)
      await act(async () => {
        await tui?.mockMouse.click(target.screenX + 1, target.screenY, button)
        await tui?.renderOnce()
      })
    }
    async function key(name: string, ctrl = false) {
      await act(async () => {
        tui?.mockInput.pressKey(name, { ctrl })
        await tui?.renderOnce()
      })
    }
    async function editUrl(value: string) {
      await click("http-url-input")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await act(async () => {
        const input = node("http-url-input") as InputRenderable
        input.selectAll()
        tui?.mockInput.typeText(value)
      })
      await settle(() => tui?.captureCharFrame().includes("MODIFICADO") ?? false)
    }
    try {
      await savePostmanAccount({ apiKey: "PMAK-scratch-save-fixture", region: "us" })
      tui = await testRender(
        <NotificationProvider>
          <HttpClient active />
        </NotificationProvider>,
        { width: 140, height: 38, kittyKeyboard: true },
      )
      await openLocalHttp(tui)
      await click("http-change-source")
      await click("http-source-postman-card")
      await openHttpWorkspaceChooser(tui)
      await click("http-postman-workspace-scratch-w1")
      await settle(() => !node("http-postman-modal"))
      if (!lastOpenRequest) {
        await key("n", true)
        await settle(() => Boolean(node("http-url-input")?.width))
      }
      await click(`http-collection-file-${path}`)
      await click(`http-navigation-project-${documentId}`)
      await settle(
        () =>
          Boolean(node(`http-document-${documentId}`)) &&
          (node("http-url-input") as InputRenderable)?.value === request.url,
      )
      expect(tui.captureCharFrame()).not.toContain("MODIFICADO")
      await editUrl("https://example.invalid/after")
      await key("s", true)
      await settle(() => tui?.captureCharFrame().includes("REQUEST SALVO NO POSTMAN") ?? false)
      expect(request.url).toBe("https://example.invalid/after")
      expect(node("http-postman-save-modal")).toBeUndefined()
      await click(`http-collection-file-${path}`, 2)
      await click("http-collection-menu-delete")
      await click("http-collection-action-apply")
      await settle(
        () =>
          !node("http-collection-action-form") &&
          !node(`http-collection-file-${path}`) &&
          !node(`http-document-${documentId}`) &&
          (lastOpenRequest
            ? Boolean(node("http-empty-state"))
            : (node("http-url-input") as InputRenderable)?.value === ""),
      )
      if (lastOpenRequest) {
        expect(tui.captureCharFrame()).toContain("Escolha uma chamada")
        expect(node("http-url-input")).toBeUndefined()
        await key("n", true)
        await settle(() => Boolean(node("http-url-input")?.width))
      }
      expect(tui.captureCharFrame()).toContain("Scratch")
      expect(tui.captureCharFrame()).not.toContain("MODIFICADO")
      expect(writes).toEqual(["update:r1", "delete:collection"])
      await key("s", true)
      expect(node("http-postman-save-modal")).toBeUndefined()
      expect(writes).toEqual(["update:r1", "delete:collection"])
      await editUrl("https://example.invalid/new-draft")
      await key("s", true)
      await settle(() => Boolean(node("http-postman-save-modal")))
      expect(node("http-postman-save-option-0")).toBeDefined()
      expect(node("http-postman-save-option-1")).toBeDefined()
      expect(writes).toEqual(["update:r1", "delete:collection"])
      await key("ESCAPE")
      await settle(() => !node("http-postman-save-modal"))
      expect((node("http-url-input") as InputRenderable).value).toBe(
        "https://example.invalid/new-draft",
      )
    } finally {
      act(() => tui?.renderer.destroy())
      globalThis.fetch = originalFetch
      if (originalAccount) await savePostmanAccount(originalAccount)
      else await removePostmanAccount()
    }
  },
  30_000,
)
