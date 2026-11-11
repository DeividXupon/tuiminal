import { openLocalHttp, openHttpWorkspaceChooser } from "./http-source"
import "./setup"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { decodeFeaturePayload } from "../../apps/cli/src/features/download"
import { prepareFeatureHost } from "../../apps/cli/src/features/host-modules"
import { importVerifiedFeature } from "../../apps/cli/src/features/loader"
import type { FeatureModules } from "../../apps/cli/src/features/registry"
import { FeatureStore } from "../../apps/cli/src/features/store"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { FEATURE_HOST_KEY } from "../../packages/core/src/runtime/feature-host"
import { HttpClient as SourceHttpClient } from "../../packages/feature-http/src/HttpClient"
import {
  loadPostmanAccount,
  removePostmanAccount,
  savePostmanAccount,
} from "../../packages/feature-http/src/postman/account"
import { buildFeaturePayloads } from "../../scripts/build-features"

const hostRegistry = globalThis as typeof globalThis & Record<string, unknown>
const previousHost = hostRegistry[FEATURE_HOST_KEY]
let payloadRoot: string | undefined
let installedHttp: FeatureModules["http"]

beforeAll(async () => {
  payloadRoot = await mkdtemp(join(tmpdir(), "tuiminal-postman-docs-payload-"))
  const build = await buildFeaturePayloads(join(payloadRoot, "payloads"))
  const artifact = build.catalog.artifacts.find((entry) => entry.id === "http")
  if (!artifact) throw new Error("Missing HTTP artifact")
  const files = decodeFeaturePayload(
    await readFile(join(build.destination, artifact.filename)),
    artifact,
  )
  const store = new FeatureStore(join(payloadRoot, "installed"))
  await store.publish(artifact, files, new AbortController().signal)
  const verified = await store.read(artifact)
  const entry = verified.get("index.mjs")
  if (!entry) throw new Error("Missing HTTP entrypoint")
  prepareFeatureHost(build.catalog.version, () => [process.execPath, "--internal-sqlite-worker"])
  installedHttp = (await importVerifiedFeature(entry)) as FeatureModules["http"]
}, 30_000)

afterAll(async () => {
  if (previousHost === undefined) delete hostRegistry[FEATURE_HOST_KEY]
  else hostRegistry[FEATURE_HOST_KEY] = previousHost
  if (payloadRoot) await rm(payloadRoot, { recursive: true, force: true })
})

test.each(["source", "installed"] as const)(
  "Postman Docs Ctrl+S (%s) accepts cleared options and preserves the draft after HTTP 400",
  async (mode) => {
    const HttpClient = mode === "installed" ? installedHttp.HttpClient : SourceHttpClient
    const root = process.env.TUIMINAL_HTTP_HOME
    if (!root) throw new Error("Missing isolated HTTP home")
    const collectionId = "12ece9e1-2abf-4edc-8e34-de66e74114d2"
    const collectionUid = `12345678-${collectionId}`
    const requestId = "b64ce176-82e0-42bd-a14e-2589050f568f"
    const path = `postman/${collectionId}.http`
    const documentId = `${path}#${requestId}`
    const originalFetch = globalThis.fetch
    const originalAccount = await loadPostmanAccount()
    const remoteRequest = { method: "GET", url: "https://example.invalid", description: "Original" }
    const remote = {
      info: { name: "Documentation" },
      item: [
        {
          id: requestId,
          name: "Read",
          request: remoteRequest,
        },
      ],
    }
    let fail = true
    const updates: unknown[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const endpoint = new URL(String(input)).pathname
      if (endpoint === "/workspaces")
        return Response.json({ workspaces: [{ id: "docs-w1", name: "Docs" }] })
      if (endpoint === "/environments") return Response.json({ environments: [] })
      if (endpoint === "/collections")
        return Response.json({
          collections: [{ id: collectionId, uid: collectionUid, name: "Documentation" }],
        })
      if (endpoint === "/workspaces/docs-w1/global-variables") return Response.json({ values: [] })
      if (endpoint === `/collections/${collectionUid}` && init?.method === "GET")
        return Response.json({ collection: remote })
      if (
        endpoint === `/collections/${collectionId}/requests/${requestId}` &&
        init?.method === "PUT"
      ) {
        const update = JSON.parse(String(init.body))
        updates.push(update)
        if (fail) return Response.json({ error: "Fixture rejection" }, { status: 400 })
        Object.assign(remoteRequest, update)
        return Response.json({ data: { id: requestId } })
      }
      return Response.json({ error: "Collection ID required" }, { status: 400 })
    }) as typeof fetch
    let tui: Awaited<ReturnType<typeof testRender>> | undefined
    const node = (id: string) => {
      const pane = tui?.renderer.root.findDescendantById(`http-request-pane-${documentId}`)
      return pane?.findDescendantById(id) ?? tui?.renderer.root.findDescendantById(id)
    }
    async function settle(check: () => boolean) {
      for (let attempt = 0; attempt < 120; attempt++) {
        await act(async () => {
          await Bun.sleep(10)
          await tui?.renderOnce()
        })
        if (check()) return
      }
      throw new Error(`Postman Docs did not settle:\n${tui?.captureCharFrame()}`)
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
    try {
      await savePostmanAccount({ apiKey: "PMAK-docs-fixture", region: "us" })
      tui = await testRender(
        <NotificationProvider>
          <HttpClient active />
        </NotificationProvider>,
        { width: 160, height: 42, kittyKeyboard: true },
      )
      await openLocalHttp(tui)
      await click("http-change-source")
      await click("http-source-postman-card")
      await openHttpWorkspaceChooser(tui)
      await settle(() => Boolean(node("http-postman-workspace-docs-w1")))
      await act(async () => tui?.mockInput.pressEnter())
      await settle(() => !node("http-postman-modal"))
      await click(`http-collection-file-${path}`)
      await click(`http-navigation-project-${documentId}`)
      await click("http-request-view-more")
      const proxyId = `http-request-proxy-${documentId}`
      await click(proxyId)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === proxyId)
      await act(async () => tui?.mockInput.typeText("http://proxy.example.invalid:8080"))
      expect((node(proxyId) as InputRenderable).value).toBe("http://proxy.example.invalid:8080")
      await act(async () => {
        tui?.mockInput.pressKey("HOME")
        tui?.mockInput.pressKey("END", { shift: true })
        tui?.mockInput.pressKey("BACKSPACE")
      })
      await settle(() => (node(proxyId) as InputRenderable).value === "")
      await click("http-request-view-more")
      await click("http-request-more-docs")
      await click(`http-request-docs-edit-${documentId}`)
      const editorId = `http-docs-editor-${documentId}`
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === editorId)
      const editor = node(editorId) as TextareaRenderable
      expect(editor.plainText).toBe("Original")
      const description = "# Updated documentation\n\nDescrição **editada** 日本語.\n"
      await act(async () => {
        editor.selectAll()
        await tui?.mockInput.pasteBracketedText(description)
      })
      await settle(() => tui?.captureCharFrame().includes("MODIFICADO") ?? false)
      await act(async () => tui?.mockInput.pressKey("s", { ctrl: true }))
      await settle(() => tui?.captureCharFrame().includes("HTTP 400") ?? false)
      expect(tui.captureCharFrame()).toContain("ERRO · HTTP")
      expect(tui.captureCharFrame()).toContain("MODIFICADO")
      expect(editor.plainText).toBe(description)
      expect(remoteRequest.description).toBe("Original")
      expect(updates).toEqual([{ description }])
      fail = false
      await act(async () => tui?.mockInput.pressKey("s", { ctrl: true }))
      await settle(() => tui?.captureCharFrame().includes("REQUEST SALVO NO POSTMAN") ?? false)
      expect(updates).toEqual([{ description }, { description }])
      expect(remoteRequest.description).toBe(description)
      expect(tui.captureCharFrame()).not.toContain("MODIFICADO")
      expect(editor.plainText).toBe(description)
      await act(async () => {
        await expect(readFile(resolve(root, path), "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        })
        await expect(readFile(resolve(root, `${path}.postman.json`), "utf8")).rejects.toMatchObject(
          {
            code: "ENOENT",
          },
        )
      })
    } finally {
      act(() => tui?.renderer.destroy())
      globalThis.fetch = originalFetch
      if (originalAccount) await savePostmanAccount(originalAccount)
      else await removePostmanAccount()
    }
  },
  30_000,
)
