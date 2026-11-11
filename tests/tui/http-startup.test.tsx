import "./setup"
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { LivePostmanSession } from "../../packages/feature-http/src/postman/live-session"
import {
  readHttpLastWorkspace,
  saveHttpLastWorkspace,
} from "../../packages/feature-http/src/storage/last-workspace"

const originalFetch = globalThis.fetch
const originalSecrets = Bun.secrets
let tui: TestRendererSetup | undefined
let connected = true
let failure = false
let missing = false
const reads: string[] = []
beforeEach(async () => {
  await rm(join(process.env.TUIMINAL_HTTP_HOME!, "last-workspace.json"), { force: true })
  connected = true
  failure = false
  missing = false
  reads.length = 0
  Object.assign(Bun, {
    secrets: {
      get: async () =>
        connected ? JSON.stringify({ apiKey: "PMAK-startup", region: "us" }) : null,
    },
  })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET")
    const url = new URL(String(input))
    reads.push(url.pathname)
    if (failure) return Response.json({}, { status: 503 })
    if (url.pathname === "/workspaces")
      return Response.json({
        workspaces: missing
          ? []
          : [
              { id: "w1", name: "First team" },
              { id: "w2", name: "Last team" },
            ],
      })
    if (url.pathname === "/collections") return Response.json({ collections: [] })
    if (url.pathname.endsWith("/global-variables")) return Response.json({ values: [] })
    if (url.pathname === "/environments")
      return Response.json({ environments: [{ id: "e2", name: "Staging" }] })
    if (url.pathname === "/environments/e2")
      return Response.json({ environment: { id: "e2", name: "Staging", values: [] } })
    throw new Error(`Unexpected fixture endpoint: ${url.pathname}`)
  }) as typeof fetch
})
function destroy() {
  act(() => tui?.renderer.destroy())
  tui = undefined
}
afterEach(() => {
  destroy()
  globalThis.fetch = originalFetch
  Object.assign(Bun, { secrets: originalSecrets })
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
  throw new Error(
    `Focused: ${tui?.renderer.currentFocusedRenderable?.id}\n${tui?.captureCharFrame()}`,
  )
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
async function mount(width = 120, height = 38) {
  tui = await testRender(
    <NotificationProvider>
      <HttpClient active />
    </NotificationProvider>,
    { width, height },
  )
  await settle(
    () =>
      Boolean(node("http-source-local-card")?.width) &&
      Boolean(tui?.captureCharFrame().includes("Abrir Postman")),
  )
}
async function openPostman(name = "First team") {
  await click("http-source-postman-card")
  await settle(
    () =>
      Boolean(node("http-empty-state")?.width) && Boolean(tui?.captureCharFrame().includes(name)),
  )
  expect(node("http-postman-modal")).toBeUndefined()
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-navigation-collection")
}

test.each([true, false])(
  "always shows both source cards before accessing an account (connected=%s)",
  async (account) => {
    connected = account
    saveHttpLastWorkspace({ source: "postman", workspaceId: "w2", environmentId: "e2" })
    await mount()
    expect(node("http-source-local-card")).toBeDefined()
    expect(node("http-source-postman-card")).toBeDefined()
    expect(node("http-url-input")).toBeUndefined()
    expect(reads).toEqual([])
  },
)

test.each([
  [52, 24],
  [80, 24],
  [120, 38],
])("source cards fit %s columns and %s rows", async (width, height) => {
  await mount(width, height)
  for (const id of ["http-source-local-card", "http-source-postman-card"]) {
    const card = node(id)
    if (!card) throw new Error(`Missing ${id}`)
    expect(card.screenX).toBeGreaterThanOrEqual(0)
    expect(card.screenY).toBeGreaterThanOrEqual(0)
    expect(card.screenX + card.width).toBeLessThanOrEqual(width)
    expect(card.screenY + card.height).toBeLessThanOrEqual(height)
  }
  await act(async () => tui?.mockInput.pressKey("ARROW_RIGHT"))
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-source-postman-card")
  await act(async () => tui?.mockInput.pressEnter())
  await settle(() => Boolean(node("http-navigation-pane")?.width))
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-navigation-collection")
  await settle(() => Boolean(tui?.captureCharFrame().includes("First team")))
})

test("Postman opens its first workspace immediately; restarting still shows the cards", async () => {
  await mount()
  await openPostman()
  expect(readHttpLastWorkspace()).toEqual({ source: "postman", workspaceId: "w1" })
  destroy()
  reads.length = 0
  await mount()
  expect(reads).toEqual([])
  await openPostman()
})

test("the Postman card restores its last workspace and environment after visiting Local", async () => {
  const selection = { source: "postman" as const, workspaceId: "w2", environmentId: "e2" }
  saveHttpLastWorkspace(selection)
  await mount()
  await click("http-source-local-card")
  await settle(() => Boolean(node("http-empty-state")?.width))
  await click("http-change-source")
  await openPostman("Last team")
  expect(tui?.captureCharFrame()).toContain("Staging")
  expect(readHttpLastWorkspace()).toEqual(selection)
  expect(reads).toContain("/environments/e2")
})

test("a removed remembered workspace falls back to the first accessible workspace", async () => {
  saveHttpLastWorkspace({ source: "postman", workspaceId: "removed", environmentId: "e2" })
  await mount()
  await openPostman()
  expect(reads).not.toContain("/environments/e2")
  expect(readHttpLastWorkspace()).toEqual({ source: "postman", workspaceId: "w1" })
})

test.each(["api", "missing", "disconnected"])(
  "Postman failure keeps the cards and selection, then permits retry (%s)",
  async (cause) => {
    const selection = { source: "postman" as const, workspaceId: "w2" }
    saveHttpLastWorkspace(selection)
    failure = cause === "api"
    missing = cause === "missing"
    connected = cause !== "disconnected"
    await mount()
    await click("http-source-postman-card")
    await settle(() => Boolean(node("http-source-error")?.width))
    expect(node("http-url-input")).toBeUndefined()
    expect(node("http-source-local-card")).toBeDefined()
    expect(readHttpLastWorkspace()).toEqual(selection)
    connected = true
    failure = false
    missing = false
    await openPostman("Last team")
  },
)

test("returning to the cards cannot discard a dirty request", async () => {
  await mount()
  await openPostman()
  await click("http-document-new")
  await click("http-url-input")
  await act(async () => tui?.mockInput.typeText("https://example.invalid/draft"))
  await click("http-change-source")
  expect(node("http-source-picker")).toBeUndefined()
  expect((node("http-url-input") as InputRenderable).value).toBe("https://example.invalid/draft")
})

test.each(["unmount", "local"])(
  "retires a pending Postman session after %s without replacing the selection",
  async (action) => {
    let finish!: () => void
    let loading = false
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const load = spyOn(LivePostmanSession.prototype, "load").mockImplementation(async () => {
      loading = true
      await gate
    })
    const dispose = spyOn(LivePostmanSession.prototype, "dispose")
    try {
      await mount()
      await click("http-source-postman-card")
      await settle(() => loading)
      await click("http-source-postman-card")
      expect(load).toHaveBeenCalledTimes(1)
      if (action === "unmount") destroy()
      else {
        await click("http-source-local-card")
        await settle(() => Boolean(node("http-empty-state")?.width))
      }
      await act(async () => {
        finish()
        await gate
        await Bun.sleep(0)
      })
      expect(dispose).toHaveBeenCalledTimes(1)
      expect(readHttpLastWorkspace()).toEqual({ source: "local" })
    } finally {
      finish()
      load.mockRestore()
      dispose.mockRestore()
    }
  },
)

test.each(["local", "postman"])(
  "%s opens without editors; explicit drafts keep close confirmation",
  async (source) => {
    await mount()
    await click(`http-source-${source}-card`)
    await settle(() => Boolean(node("http-empty-state")?.width))
    expect(tui?.captureCharFrame()).toContain("Escolha uma chamada")
    expect(tui?.captureCharFrame()).toContain("Tuiminal")
    expect(tui?.captureCharFrame()).toContain("Postman")
    expect(tui?.captureCharFrame()).not.toContain("SCRATCH")
    expect(node("http-url-input")).toBeUndefined()
    expect(node("http-split-handle")).toBeUndefined()
    await act(async () => tui?.mockInput.pressKey("n", { ctrl: true }))
    await click("http-url-input")
    await act(async () => tui?.mockInput.typeText("https://example.invalid/keep-me"))
    await click("http-document-close-http-scratch-1")
    await settle(() => Boolean(node("http-discard-document-modal")?.width))
    await act(async () => tui?.mockInput.pressKey("ESCAPE"))
    await settle(() => !node("http-discard-document-modal"))
    expect((node("http-url-input") as InputRenderable).value).toBe(
      "https://example.invalid/keep-me",
    )
    await click("http-document-close-http-scratch-1")
    await settle(() => Boolean(node("http-discard-document-modal")?.width))
    await act(async () => tui?.mockInput.pressKey("d"))
    await settle(() => Boolean(node("http-empty-state")?.width))
    expect(node("http-url-input")).toBeUndefined()
    expect(node("http-split-handle")).toBeUndefined()
  },
)

test("a local collection opens its selected request and returns to the logos after closing it", async () => {
  const root = process.env.TUIMINAL_HTTP_HOME
  if (!root) throw new Error("Missing isolated HTTP home")
  const path = join(root, "empty-selection.http")
  try {
    await writeFile(
      path,
      "### Local call\n# @name empty-local\nGET https://example.invalid/local\n",
    )
    await mount()
    await click("http-source-local-card")
    await settle(() => Boolean(node("http-empty-state")?.width))
    await click("http-navigation-project-empty-selection.http#empty-local")
    await settle(() => Boolean(node("http-url-input")?.width))
    expect(node("http-empty-state")).toBeUndefined()
    expect((node("http-url-input") as InputRenderable).value).toBe("https://example.invalid/local")
    await click("http-document-close-empty-selection.http#empty-local")
    await settle(() => Boolean(node("http-empty-state")?.width))
    expect(node("http-request-pane-empty-selection.http#empty-local")).toBeUndefined()
    expect(node("http-response-pane-empty-selection.http#empty-local")).toBeUndefined()
  } finally {
    await rm(path, { force: true })
  }
})

test("the empty workspace offers cURL import without document-only actions", async () => {
  await mount()
  await click("http-source-local-card")
  await click("http-action-palette-open")
  await settle(() => Boolean(node("http-action-palette")))
  expect(node("http-action-palette-row-send")).toBeUndefined()
  expect(node("http-action-palette-row-save")).toBeUndefined()
  await click("http-action-palette-row-curl-import")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-curl-import-editor")
  await act(async () => tui?.mockInput.typeText("curl https://example.invalid/imported"))
  await click("http-curl-import-apply")
  await settle(() => Boolean(node("http-url-input")?.width))
  expect(node("http-empty-state")).toBeUndefined()
  expect((node("http-url-input") as InputRenderable).value).toBe("https://example.invalid/imported")
})

test("an explicit initial URL opens an edited request and New creates a separate tab", async () => {
  let dirty = false
  tui = await testRender(
    <HttpClient
      active
      initialUrlRequest={{ id: 10, url: "https://example.invalid/prefilled" }}
      onUnsavedChangesChange={(value) => {
        dirty = value
      }}
    />,
    { width: 120, height: 38 },
  )
  await click("http-source-local-card")
  await settle(
    () =>
      (node("http-url-input") as InputRenderable)?.value === "https://example.invalid/prefilled",
  )
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  expect(dirty).toBe(true)
  expect(node("http-empty-state")).toBeUndefined()
  await click("http-document-new")
  await settle(() => Boolean(node("http-document-http-scratch-2")?.width))
  expect(node("http-document-http-scratch-1")).toBeDefined()
  expect((node("http-url-input") as InputRenderable).value).toBe("")
})

test.each([
  ["local", 52],
  ["local", 120],
  ["postman", 52],
  ["postman", 120],
] as const)("%s starts with collection keyboard focus at %s columns", async (source, width) => {
  await mount(width, 38)
  await act(async () => tui?.mockInput.pressKey(source === "local" ? "l" : "p"))
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-navigation-collection")
  expect(node("http-url-input")).toBeUndefined()
  await act(async () => tui?.mockInput.pressKey("a"))
  await settle(() => Boolean(node("http-collection-menu")?.width))
  expect(tui?.captureCharFrame()).toContain("Nova coleção")
  await act(async () => {
    tui?.mockInput.pressKey("ESCAPE")
    await Bun.sleep(70)
  })
  await settle(() => !node("http-collection-menu"))
  await act(async () => tui?.mockInput.pressKey("n", { ctrl: true }))
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
})
