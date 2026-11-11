import "./setup"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { RGBA, type InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { App } from "../../apps/cli/src/App"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { readHttpLastWorkspace } from "../../packages/feature-http/src/storage/last-workspace"

let tui: TestRendererSetup | undefined
const originalFetch = globalThis.fetch
const originalSecrets = Bun.secrets
const privateFile = join(process.env.TUIMINAL_HTTP_HOME!, "http-client.private.env.json")
let privateBackup: Buffer | undefined
let writeGate: Promise<void> | undefined
let failedRead = false
let failedSave = false
let reorderSavedMetadata = false
let dirty = false
let globals: Array<Record<string, unknown>> = []
let remote: { name: string; values: Array<Record<string, unknown>> }
let environments: Array<{ id: string; name: string }>
const writes: Array<{ method: string; path: string; body: any }> = []
const credentials = new Map<string, string>()
beforeEach(() => {
  failedRead = false
  failedSave = false
  reorderSavedMetadata = false
  dirty = false
  writes.length = 0
  privateBackup = existsSync(privateFile) ? readFileSync(privateFile) : undefined
  writeGate = undefined
  credentials.clear()
  globals = [{ key: "base_url", value: "https://global.invalid", enabled: true }]
  remote = {
    name: "Staging",
    values: [
      {
        key: "token",
        value: "fixture-token",
        enabled: false,
        type: "secret",
        description: "Keep metadata",
      },
    ],
  }
  environments = [
    { id: "stage", name: "Staging" },
    { id: "prod", name: "Production" },
  ]
  Object.assign(Bun, {
    secrets: {
      get: async ({ service, name }: { service: string; name: string }) =>
        service === "dev.tuiminal.postman"
          ? JSON.stringify({ apiKey: "PMAK-env-fixture", region: "us" })
          : (credentials.get(name) ?? null),
      set: async ({ name, value }: { name: string; value: string }) => {
        credentials.set(name, value)
      },
      delete: async ({ name }: { name: string }) => credentials.delete(name),
    },
  })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    if (method !== "GET") {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      writes.push({ method, path: url.pathname, body })
      if (writeGate) await writeGate
      if (failedSave) return Response.json({}, { status: 503 })
      if (url.pathname.endsWith("/global-variables")) {
        globals = savedValues(body.values)
        return Response.json({ values: globals })
      }
      if (method === "POST") {
        environments.push({ id: "created", name: body.environment.name })
        remote = body.environment
        return Response.json({ environment: { id: "created" } })
      }
      if (method === "DELETE") {
        environments = environments.filter((entry) => !url.pathname.endsWith(entry.id))
        return Response.json({ environment: { id: "stage" } })
      }
      remote = { ...body.environment, values: savedValues(body.environment.values) }
      return Response.json({ environment: { id: "stage", name: remote.name } })
    }
    if (url.pathname === "/workspaces")
      return Response.json({ workspaces: [{ id: "team", name: "Fixture workspace" }] })
    if (url.pathname === "/collections")
      return Response.json({ collections: [{ id: "collection", name: "Demo API" }] })
    if (url.pathname === "/collections/collection")
      return Response.json({
        collection: {
          info: {
            name: "Demo API",
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
          },
          item: [
            {
              id: "request",
              name: "List users",
              request: { method: "GET", url: "https://example.invalid/users" },
            },
          ],
        },
      })
    if (url.pathname === "/environments") {
      expect(url.searchParams.get("workspace")).toBe("team")
      return Response.json({ environments })
    }
    if (url.pathname.startsWith("/environments/"))
      return failedRead
        ? Response.json({}, { status: 503 })
        : Response.json({ environment: remote })
    if (url.pathname.endsWith("/global-variables")) return Response.json({ values: globals })
    throw new Error(`Unexpected fixture request: ${url}`)
  }) as typeof fetch
})
function savedValues(values: Array<Record<string, unknown>>) {
  return reorderSavedMetadata
    ? values.map((value) => Object.fromEntries(Object.entries(value).reverse()))
    : values
}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  globalThis.fetch = originalFetch
  Object.assign(Bun, { secrets: originalSecrets })
  if (privateBackup) writeFileSync(privateFile, privateBackup)
  else rmSync(privateFile, { force: true })
})
function rememberedEnvironment() {
  const value = readHttpLastWorkspace()
  return value.source === "postman" ? value.environmentId : undefined
}
const node = (id: string) => tui?.renderer.root.findDescendantById(id)
async function settle(check: () => boolean) {
  for (let i = 0; i < 150; i++) {
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
  const target = node(id)!
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + Math.floor(target.width / 2), target.screenY)
    await tui?.renderOnce()
  })
}
async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(
      name.startsWith("CTRL_")
        ? name.slice(5).toLowerCase()
        : name === "ENTER"
          ? "RETURN"
          : ["UP", "DOWN", "LEFT", "RIGHT"].includes(name)
            ? `ARROW_${name}`
            : name,
      name.startsWith("CTRL_") ? { ctrl: true } : {},
    )
    if (name === "ESCAPE") await Bun.sleep(40)
    await tui?.renderOnce()
  })
}
async function input(id: string, value: string) {
  await click(id)
  await act(async () => {
    const target = node(id) as InputRenderable
    target.value = value
    target.emit("input", value)
    await tui?.renderOnce()
  })
}
async function mount(width = 120, source = "postman", height = 38) {
  tui = await testRender(
    <NotificationProvider>
      <HttpClient
        active
        onUnsavedChangesChange={(value) => {
          dirty = value
        }}
      />
    </NotificationProvider>,
    { width, height },
  )
  await click(`http-source-${source}-card`)
  await settle(() => Boolean(node("http-navigation-collection")?.width))
  await click("http-environment-button")
  await settle(() => Boolean(node("http-environment-entry-0")?.width))
}
async function open(index: number) {
  await click(`http-environment-entry-${index}`)
  await settle(
    () =>
      Boolean(node("http-environment-cell-0-name")?.width) ||
      Boolean(node("http-environment-retry")?.width),
  )
}

test.each([52, 80, 120])(
  "environments replace History and open a full-width variable table at %s columns",
  async (width) => {
    await mount(width)
    expect(node("http-navigation-history")).toBeUndefined()
    expect(tui!.captureCharFrame()).not.toContain("Histórico")
    expect(node("http-environment-entry-0")!.screenY).toBeLessThan(
      node("http-environment-entry-1")!.screenY,
    )
    await open(0)
    expect(tui!.captureCharFrame()).toContain("Sempre ativo")
    expect(tui!.captureCharFrame()).toContain("base_url")
    expect(node("http-url-input")).toBeUndefined()
    expect(
      node("http-environment-pane")!.screenX + node("http-environment-pane")!.width,
    ).toBeLessThanOrEqual(width)
    for (const id of [
      "http-environment-cell-0-name",
      "http-environment-cell-0-value",
      "http-environment-save",
    ]) {
      expect(node(id)!.screenX).toBeGreaterThanOrEqual(0)
      expect(node(id)!.screenX + node(id)!.width).toBeLessThanOrEqual(width)
    }
    await key("ESCAPE")
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-entry-0")
    await key("ENTER")
    await settle(() => Boolean(node("http-environment-pane")?.width))
  },
)

test("environment drafts survive switching tabs, failed saves, and cancelled discard", async () => {
  await mount()
  await open(1)
  await input("http-environment-cell-0-value", "draft-token")
  expect(dirty).toBe(true)
  await click("http-navigation-collection")
  // Open a normal request while keeping the environment draft.
  await key("CTRL_N")
  await settle(() => Boolean(node("http-url-input")?.width))
  await key("ESCAPE")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id !== "http-url-input")
  await key("ENTER")
  await key("ESCAPE")
  await key("2")
  await settle(
    () =>
      (node("http-environment-cell-0-value") as InputRenderable)?.value === "draft-token" &&
      tui?.renderer.currentFocusedRenderable?.id === "http-environment-pane",
  )
  await key("RIGHT")
  await key("ENTER")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-cell-0-value")
  failedSave = true
  await key("CTRL_S")
  await settle(() => writes.length === 1 && Boolean(tui!.captureCharFrame().includes("503")))
  expect(dirty).toBe(true)
  failedSave = false
  await key("CTRL_S")
  await settle(() => writes.length === 2 && !dirty)
  expect(remote.values[0]).toEqual({
    key: "token",
    value: "draft-token",
    enabled: false,
    type: "secret",
    description: "Keep metadata",
  })
  await input("http-environment-cell-0-value", "unsaved-again")
  await key("CTRL_W")
  await settle(() => Boolean(node("http-discard-document-modal")))
  await key("ESCAPE")
  await settle(() => !node("http-discard-document-modal"))
  expect((node("http-environment-cell-0-value") as InputRenderable).value).toBe("unsaved-again")
  await key("CTRL_W")
  await settle(() => Boolean(node("http-discard-document-confirm")?.width))
  await click("http-discard-document-confirm")
  await settle(() => !node("http-environment-pane"))
  expect(dirty).toBe(false)
})

test("failed environment reads retry without presenting an editable empty environment", async () => {
  await mount()
  failedRead = true
  await open(1)
  expect(node("http-environment-cell-0-name")).toBeUndefined()
  failedRead = false
  await click("http-environment-retry")
  await settle(() => (node("http-environment-cell-0-name") as InputRenderable)?.value === "token")
})

test("remote conflicts preserve the draft and do not overwrite changes from Postman", async () => {
  await mount()
  await open(1)
  await input("http-environment-cell-0-value", "my-draft")
  remote.values[0]!.value = "changed-elsewhere"
  await click("http-environment-save")
  await settle(() => tui!.captureCharFrame().includes("O ambiente mudou"))
  expect(writes).toHaveLength(0)
  expect((node("http-environment-cell-0-value") as InputRenderable).value).toBe("my-draft")
  expect(dirty).toBe(true)
})

test("selecting a tab does not activate it; activation remembers the workspace environment", async () => {
  await mount()
  await open(1)
  expect(rememberedEnvironment()).toBeUndefined()
  await click("http-environment-activate")
  await settle(() => rememberedEnvironment() === "stage")
  expect(tui!.captureCharFrame()).toContain("Ambiente ativo")
  await click("http-navigation-environments")
  await click("http-environment-none")
  await settle(() => rememberedEnvironment() === undefined)
})

test("Postman create and confirmed delete are scoped to the current workspace", async () => {
  await mount()
  await click("http-environment-new")
  await input("http-environment-name", "Created environment")
  await input("http-environment-cell-0-name", "base_url")
  await input("http-environment-cell-0-value", "https://created.invalid")
  await click("http-environment-save")
  await settle(() => writes.length === 1 && !dirty)
  expect(writes[0]?.method).toBe("POST")
  expect(writes[0]?.body.environment.values[0].key).toBe("base_url")
  await click("http-environment-delete")
  await settle(() => tui!.captureCharFrame().includes("EXCLUIR AMBIENTE?"))
  expect(writes).toHaveLength(1)
  await key("ESCAPE")
  await settle(() => !node("http-discard-document-modal"))
  await click("http-environment-delete")
  await click("http-discard-document-confirm")
  await settle(() => writes.length === 2 && !node("http-environment-pane"))
  expect(writes[1]).toMatchObject({ method: "DELETE", path: "/environments/created" })
})

test("local global variables save through credential storage and reopen in the same tab area", async () => {
  await mount(120, "local")
  await open(0)
  await input("http-environment-cell-0-name", "env_tab_fixture")
  await input("http-environment-cell-0-value", "local-value")
  await key("CTRL_S")
  await settle(() => !dirty && credentials.size > 0)
  expect(writes).toHaveLength(0)
  await key("CTRL_W")
  await settle(() => !node("http-environment-pane"))
  await click("http-navigation-environments")
  await open(0)
  await settle(
    () => (node("http-environment-cell-0-value") as InputRenderable)?.value === "local-value",
  )
})

test("editing during a pending save keeps newer values dirty and supports a second save", async () => {
  reorderSavedMetadata = true
  await mount()
  await open(1)
  await input("http-environment-cell-0-value", "first-save")
  let release = () => {}
  writeGate = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    await key("CTRL_S")
    await settle(() => writes.length === 1)
    await input("http-environment-cell-0-value", "newer-edit")
    await act(async () => {
      release()
      await writeGate
    })
    await settle(() => tui!.captureCharFrame().includes("Ambiente salvo."))
    expect((node("http-environment-cell-0-value") as InputRenderable).value).toBe("newer-edit")
    expect(dirty).toBe(true)
    writeGate = undefined
    await key("CTRL_S")
    await settle(() => writes.length === 2 && !dirty)
    expect(remote.values[0]?.value).toBe("newer-edit")
  } finally {
    release()
  }
})

test.each([0, 1])(
  "consecutive edits ignore metadata field order in environment %s",
  async (index) => {
    reorderSavedMetadata = true
    const values = index === 0 ? globals : remote.values
    values.push({ key: "second", value: "original-second", enabled: true })
    await mount()
    await open(index)
    await input("http-environment-cell-0-value", "first-edit")
    await click("http-environment-save")
    await settle(() => writes.length === 1 && !dirty)
    await input("http-environment-cell-1-value", "second-edit")
    await click("http-environment-save")
    await settle(() => writes.length === 2 && !dirty)
    const saved = index === 0 ? globals : remote.values
    expect(saved.map((row) => row.value)).toEqual(["first-edit", "second-edit"])
    expect(tui!.captureCharFrame()).not.toContain("O ambiente mudou")
    failedSave = true
    await input("http-environment-cell-1-value", "retry-edit")
    await click("http-environment-save")
    await settle(() => writes.length === 3 && tui!.captureCharFrame().includes("503"))
    expect(dirty).toBe(true)
    expect((node("http-environment-cell-1-value") as InputRenderable).value).toBe("retry-edit")
    failedSave = false
    await click("http-environment-save")
    await settle(() => writes.length === 4 && !dirty)
    // A genuine remote metadata change must still block the next save.
    const current = index === 0 ? globals : remote.values
    current[0]!.enabled = current[0]!.enabled === false
    await input("http-environment-cell-1-value", "unsaved-third-edit")
    await click("http-environment-save")
    await settle(() => tui!.captureCharFrame().includes("O ambiente mudou"))
    expect(writes).toHaveLength(4)
    expect(dirty).toBe(true)
    expect((node("http-environment-cell-1-value") as InputRenderable).value).toBe(
      "unsaved-third-edit",
    )
  },
)

test("keyboard navigation scrolls a long table into view in a narrow terminal", async () => {
  remote.values = Array.from({ length: 30 }, (_, i) => ({
    key: `variable_${i}`,
    value: `value_${i}`,
    enabled: true,
  }))
  await mount(52, "postman", 24)
  await open(1)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
  await act(async () => {
    for (const name of ["END", "ARROW_UP", "ARROW_RIGHT", "RETURN"]) tui!.mockInput.pressKey(name)
    await tui!.renderOnce()
  })
  await settle(
    () => tui!.renderer.currentFocusedRenderable?.id === "http-environment-cell-29-value",
  )
  expect(tui!.captureCharFrame()).toContain("value_29")
  const cell = node("http-environment-cell-29-value")!
  const pane = node("http-environment-pane")!
  expect(cell.screenY).toBeGreaterThan(pane.screenY)
  expect(cell.screenY).toBeLessThan(pane.screenY + pane.height - 1)
})

test("arrows select cells, Escape leaves editing and returns to the selected environment", async () => {
  await mount()
  await open(1)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
  await key("RIGHT")
  await key("ENTER")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-cell-0-value")
  await input("http-environment-cell-0-value", "draft-from-keyboard")
  await key("DOWN")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-pane")
  await key("ENTER")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-cell-1-value")
  await key("ESCAPE")
  await key("ESCAPE")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-entry-1")
  await key("UP")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-entry-0")
  await key("ENTER")
  await settle(() => tui!.captureCharFrame().includes("https://global.invalid"))
  await act(async () => {
    tui!.mockInput.pressKey("ARROW_LEFT", { meta: true })
    await tui!.renderOnce()
  })
  await settle(() => tui!.captureCharFrame().includes("draft-from-keyboard"))
  expect(dirty).toBe(true)
  await key("ESCAPE")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-entry-1")
})

test("Tab reaches activation, delete confirmation and the editable name", async () => {
  await mount()
  await open(1)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
  await key("TAB")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-save")
  await key("TAB")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-activate")
  await key("ENTER")
  await settle(() => rememberedEnvironment() === "stage")
  await key("TAB")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-delete")
  await key("ENTER")
  await settle(() => tui!.captureCharFrame().includes("EXCLUIR AMBIENTE?"))
  await key("ESCAPE")
  await settle(() => !tui!.captureCharFrame().includes("EXCLUIR AMBIENTE?"))
  expect(writes).toHaveLength(0)
})

test("read failures expose retry through the keyboard", async () => {
  failedRead = true
  await mount()
  await open(1)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
  await key("TAB")
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-retry")
  failedRead = false
  await key("ENTER")
  await settle(() => Boolean(node("http-environment-cell-0-value")?.width))
  expect(tui!.captureCharFrame()).toContain("fixture-token")
})

test("resizing keeps the selected environment field visible and its draft intact", async () => {
  remote.values = Array.from({ length: 35 }, (_, i) => ({
    key: `variable_${i}`,
    value: `value_${i}`,
  }))
  await mount()
  await open(1)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
  for (const name of ["END", "UP", "RIGHT", "ENTER"]) await key(name)
  await input("http-environment-cell-34-value", "resize-draft")
  await act(async () => {
    tui!.resize(52, 24)
    await tui!.renderOnce()
  })
  await settle(() => tui!.captureCharFrame().includes("resize-draft"))
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-cell-34-value")
  expect(dirty).toBe(true)
})

test("rapid typing across variable and value fields preserves both drafts", async () => {
  await mount(120, "local")
  await click("http-environment-new")
  await input("http-environment-name", "Keyboard QA")
  await key("TAB")
  await act(async () => {
    await tui!.mockInput.typeText("base_url")
    tui!.mockInput.pressKey("TAB")
    await tui!.mockInput.typeText("https://local-keyboard.invalid")
    await tui!.renderOnce()
  })
  await key("CTRL_S")
  await settle(() => !dirty)
  await key("CTRL_W")
  await settle(() => !node("http-environment-pane"))
  await click("http-navigation-environments")
  await open(1)
  expect((node("http-environment-cell-0-name") as InputRenderable).value).toBe("base_url")
  expect((node("http-environment-cell-0-value") as InputRenderable).value).toBe(
    "https://local-keyboard.invalid",
  )
})

test.each([52, 120])(
  "environment rows expose exactly two actions at %s columns without opening a tab",
  async (width) => {
    await mount(width)
    await click("http-environment-actions-1")
    await settle(() => Boolean(node("http-environment-menu")))
    expect(node("http-environment-pane")).toBeUndefined()
    const menu = node("http-environment-menu")!
    expect(
      menu.getChildren().filter((child) => child.id.startsWith("http-environment-menu-")),
    ).toHaveLength(2)
    expect(menu.screenX + menu.width).toBeLessThanOrEqual(width)
    await key("ENTER")
    await settle(() => rememberedEnvironment() === "stage")
    expect(node("http-environment-pane")).toBeUndefined()
    expect(node("http-environment-menu")).toBeUndefined()
    expect(writes).toHaveLength(0)
    expect(node("http-environment-actions-0")).toBeUndefined()
  },
)

test("A opens the selected row's menu; Escape restores the row and blocks workspace shortcuts", async () => {
  await mount()
  await key("DOWN")
  await key("a")
  await settle(() => Boolean(node("http-environment-menu")))
  await key("CTRL_G")
  expect(node("http-source-picker")).toBeUndefined()
  await key("ESCAPE")
  await settle(() => !node("http-environment-menu"))
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-entry-1")
  await key("a")
  await key("DOWN")
  await key("ENTER")
  await settle(() => Boolean(node("http-discard-document-modal")))
  expect(writes).toHaveLength(0)
  await key("ESCAPE")
  await settle(() => !node("http-discard-document-modal"))
  expect(node("http-environment-pane")).toBeUndefined()
  expect(tui!.captureCharFrame()).toContain("Staging")
})

test("list deletion confirms once, preserves failed drafts and permits retry", async () => {
  await mount()
  await open(1)
  await input("http-environment-cell-0-value", "keep-my-draft")
  await key("ESCAPE")
  await key("ESCAPE")
  await click("http-environment-actions-1")
  await click("http-environment-menu-delete")
  await settle(() => Boolean(node("http-discard-document-modal")))
  await key("ESCAPE")
  expect(dirty).toBe(true)
  failedSave = true
  await click("http-environment-actions-1")
  await click("http-environment-menu-delete")
  await key("d")
  await settle(() => writes.length === 1 && !node("http-discard-document-modal"))
  expect(dirty).toBe(true)
  expect((node("http-environment-cell-0-value") as InputRenderable).value).toBe("keep-my-draft")
  failedSave = false
  await click("http-environment-actions-1")
  await click("http-environment-menu-delete")
  let release = () => {}
  writeGate = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    await key("d")
    await settle(() => writes.length === 2)
    await key("d")
    expect(writes).toHaveLength(2)
  } finally {
    release()
  }
  await settle(() => !node("http-discard-document-modal") && !node("http-environment-pane"))
  expect(writes[1]?.method).toBe("DELETE")
})

test("an unopened environment can be deleted from its row after read failure and retry", async () => {
  await mount()
  failedRead = true
  await click("http-environment-actions-1")
  await click("http-environment-menu-delete")
  await settle(
    () => tui!.captureCharFrame().includes("503") && !node("http-discard-document-modal"),
  )
  expect(writes).toHaveLength(0)
  failedRead = false
  await click("http-environment-actions-1")
  await click("http-environment-menu-delete")
  await settle(
    () =>
      Boolean(node("http-discard-document-confirm")) &&
      !tui!.captureCharFrame().includes("Carregando…"),
  )
  await key("d")
  await settle(() => writes.length === 1 && !node("http-discard-document-modal"))
  expect(node("http-environment-pane")).toBeUndefined()
  expect(writes[0]).toMatchObject({ method: "DELETE", path: "/environments/stage" })
})

test("M selects the environment table from the list and cancels back to an edited field", async () => {
  await mount()
  await open(1)
  await input("http-environment-cell-0-value", "keep-focus-draft")
  await key("ESCAPE")
  await key("ESCAPE")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-entry-1")
  await key("m")
  await settle(() => Boolean(node("http-navigation-pane-focus-selection-tint")))
  await key("RIGHT")
  await settle(() => Boolean(node("http-environment-pane-focus-selection-tint")))
  await key("ENTER")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
  await key("RIGHT")
  await key("ENTER")
  const field = node("http-environment-cell-0-value") as InputRenderable
  expect(tui!.renderer.currentFocusedRenderable).toBe(field)
  await click("http-jump-button")
  await settle(() => Boolean(node("http-environment-pane-focus-selection-tint")))
  await key("ESCAPE")
  await settle(() => tui!.renderer.currentFocusedRenderable === field)
  expect(field.value).toBe("keep-focus-draft")
  expect(dirty).toBe(true)
})

test.each(["RIGHT", "l"])(
  "%s enters the selected environment table and preserves its draft",
  async (direction) => {
    await mount()
    await key("DOWN")
    await key(direction)
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
    expect(tui!.captureCharFrame()).toContain("fixture-token")
    await input("http-environment-cell-0-value", "arrow-draft")
    await key("ESCAPE")
    await key("ESCAPE")
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-entry-1")
    await key(direction)
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
    expect((node("http-environment-cell-0-value") as InputRenderable).value).toBe("arrow-draft")
  },
)

test.each(["UP", "k"])(
  "%s selects Name in blue without editing, and Down returns to the table",
  async (up) => {
    await mount()
    await open(1)
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
    await key("DOWN")
    await key(up)
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-pane")
    await key(up)
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-pane")
    const name = node("http-environment-name") as InputRenderable
    expect(name.backgroundColor.equals(RGBA.fromHex("#4b75ff"))).toBe(true)
    await key("b")
    expect(name.value).toBe("Staging")
    await key("DELETE")
    expect(node("http-environment-cell-0-name")).toBeDefined()
    await key("ENTER")
    expect(tui!.renderer.currentFocusedRenderable).toBe(name)
    await key("ESCAPE")
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-pane")
    expect(name.backgroundColor.equals(RGBA.fromHex("#4b75ff"))).toBe(true)
    await key("DOWN")
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-pane")
    await key("ENTER")
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-cell-0-name")
  },
)

test("Global clamps upward navigation to its first variable", async () => {
  await mount()
  await open(0)
  await key("UP")
  expect(node("http-environment-name")).toBeUndefined()
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-pane")
})

test("the row menu can delete a tab whose initial read failed after the service recovers", async () => {
  failedRead = true
  await mount()
  await open(1)
  await key("ESCAPE")
  failedRead = false
  await click("http-environment-actions-1")
  await click("http-environment-menu-delete")
  await settle(
    () =>
      Boolean(node("http-discard-document-modal")) &&
      !tui!.captureCharFrame().includes("Carregando…"),
  )
  await key("d")
  await settle(() => writes.length === 1 && !node("http-discard-document-modal"))
  expect(writes[0]?.method).toBe("DELETE")
  expect(node("http-environment-pane")).toBeUndefined()
})

test.each(["LEFT", "h"])(
  "%s beyond the variable column returns to the list with its draft",
  async (left) => {
    await mount()
    await open(1)
    await input("http-environment-cell-0-value", "left-draft")
    await key("ESCAPE")
    await key(left)
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-pane")
    await key("ENTER")
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-cell-0-name")
    await key("ESCAPE")
    await key(left)
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-entry-1")
    await key("RIGHT")
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
    expect((node("http-environment-cell-0-value") as InputRenderable).value).toBe("left-draft")
  },
)

test("Name selection clamps above, accepts mouse editing and returns left to its environment", async () => {
  await mount()
  await open(1)
  await key("UP")
  await key("k")
  const name = node("http-environment-name") as InputRenderable
  expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-pane")
  expect(name.value).toBe("Staging")
  await click("http-environment-name")
  expect(tui!.renderer.currentFocusedRenderable).toBe(name)
  await key("h")
  expect(name.value).toContain("h")
  await key("LEFT")
  expect(tui!.renderer.currentFocusedRenderable).toBe(name)
  await key("ESCAPE")
  await key("h")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-entry-1")
})

test("environment browsing allows application shortcuts while inputs and menus retain text keys", async () => {
  const previous = process.env.TUIMINAL_ONLY_TAB
  process.env.TUIMINAL_ONLY_TAB = "http"
  try {
    tui = await testRender(<App />, { width: 120, height: 38 })
    await click("http-source-postman-card")
    await settle(() => Boolean(node("http-empty-state")?.width))
    await click("http-environment-button")
    await open(1)
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-pane")
    await key(",")
    await settle(() => Boolean(node("configuration-modal")))
    await key("ESCAPE")
    await settle(() => !node("configuration-modal"))
    await click("http-environment-cell-0-value")
    await key(",")
    await key("q")
    expect(node("configuration-modal")).toBeUndefined()
    expect(node("unsaved-changes-exit-modal")).toBeUndefined()
    const value = (node("http-environment-cell-0-value") as InputRenderable).value
    expect(value).toContain(",q")
    await key("ESCAPE")
    await key("UP")
    expect(tui!.renderer.currentFocusedRenderable?.id).toBe("http-environment-pane")
    await key("q")
    await settle(() => Boolean(node("unsaved-changes-exit-modal")))
    await key("ESCAPE")
    await settle(() => !node("unsaved-changes-exit-modal"))
    expect((node("http-environment-cell-0-value") as InputRenderable).value).toBe(value)
    await key("ESCAPE")
    await settle(() => tui!.renderer.currentFocusedRenderable?.id === "http-environment-entry-1")
    expect(tui!.renderer.isDestroyed).toBe(false)
    await key("a")
    await settle(() => Boolean(node("http-environment-menu")))
    await key(",")
    await key("q")
    expect(node("configuration-modal")).toBeUndefined()
    expect(node("unsaved-changes-exit-modal")).toBeUndefined()
    await key("ESCAPE")
    await settle(() => !node("http-environment-menu"))
    await key(",")
    await settle(() => Boolean(node("configuration-modal")))
  } finally {
    if (previous === undefined) delete process.env.TUIMINAL_ONLY_TAB
    else process.env.TUIMINAL_ONLY_TAB = previous
  }
})
