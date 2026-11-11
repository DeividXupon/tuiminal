import { openLocalHttp, openHttpWorkspaceChooser } from "./http-source"
import "./setup"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import {
  RGBA,
  type BoxRenderable,
  type InputRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { act } from "react"
import {
  COLORS,
  getUiSettings,
  type LayoutMode,
  updateUiSettings,
} from "../../packages/core/src/settings/theme"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { withNotifications } from "../../packages/core/src/notifications/index"
import { HTTP_TUTORIAL_STEPS } from "../../packages/feature-http/src"
import { App } from "../../apps/cli/src/App"
import { UnsavedChangesExitModal } from "../../apps/cli/src/ui/UnsavedChangesExitModal"
import { HttpExternalConflictModal } from "../../packages/feature-http/src/ui/HttpExternalConflictModal"
import { resolveHttpWorkspaceLayout } from "../../packages/feature-http/src/model/layout"
import { HTTP_RENDERER_LISTENER_BUDGET } from "../../packages/feature-http/src/model/renderer-listener-budget"
import { displayWidth, type LanguageId } from "../../packages/core/src/i18n"
import { BRAND_COLOR } from "../../packages/core/src/ui/brand"
import { savePostmanAccount } from "../../packages/feature-http/src/postman/account"

const HttpClientWithNotifications = withNotifications(HttpClient)
let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const originalSecrets = Bun.secrets
const storedSecrets = new Map<string, string>()
const testSecrets = {
  async get({ name }: { name: string }) {
    return storedSecrets.get(name) ?? null
  },
  async set({ name, value }: { name: string; value: string }) {
    storedSecrets.set(name, value)
  },
  async delete({ name }: { name: string }) {
    return storedSecrets.delete(name)
  },
}

beforeEach(() => {
  storedSecrets.clear()
  Object.assign(Bun, { secrets: testSecrets })
})

async function settle(until: () => boolean) {
  if (!tui) throw new Error("TUI HTTP não montada")
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(`TUI HTTP não estabilizou:\n${tui.captureCharFrame()}`)
}

async function key(name: string, ctrl = false, shift = false) {
  await act(async () => {
    tui?.mockInput.pressKey(name, { ctrl, shift })
    await Bun.sleep(name === "ESCAPE" || name.startsWith("F") ? 60 : 5)
    await tui?.renderOnce()
  })
}

async function enter() {
  await act(async () => {
    tui?.mockInput.pressEnter()
    await Bun.sleep(5)
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

async function typeEnvironmentFields(name: string, variables: Array<[string, string]>) {
  await click("http-environment-name")
  await act(async () => tui?.mockInput.typeText(name))
  for (let index = 0; index < variables.length; index++) {
    await key("TAB")
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === `http-environment-cell-${index}-name`,
    )
    await act(async () => tui?.mockInput.typeText(variables[index]?.[0] ?? ""))
    await key("TAB")
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === `http-environment-cell-${index}-value`,
    )
    await act(async () => tui?.mockInput.typeText(variables[index]?.[1] ?? ""))
  }
}

async function collectionAction(action: string, workspace = false) {
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-navigation-collection")))
  await press("http-navigation-collection")
  if (workspace) {
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-collection-workspace-heading")),
    )
    await press("http-collection-workspace-heading")
  }
  await key("a")
  const id = `http-collection-menu-${action}`
  await settle(() => Boolean(tui?.renderer.root.findDescendantById(id)))
  await press(id)
}

async function keyboardCollectionAction(index: number) {
  await key("a")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-collection-menu")))
  for (let i = 0; i < index; i++) await key("ARROW_DOWN")
  await enter()
}

async function click(id: string) {
  if (!tui) throw new Error("TUI HTTP não montada")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById(id)?.width))
  const target = tui.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Mouse target ${id} não encontrado`)
  await act(async () => {
    await tui?.mockMouse.click(
      target.screenX + Math.max(0, Math.floor(target.width / 2)),
      target.screenY + Math.max(0, Math.floor(target.height / 2)),
    )
    await tui?.renderOnce()
  })
}

async function focus(id: string) {
  await act(async () => {
    const renderable = tui?.renderer.root.findDescendantById(id) as
      | { focus?: () => void }
      | undefined
    if (!renderable?.focus) throw new Error(`Renderable ${id} não aceita foco`)
    renderable.focus()
    await tui?.renderOnce()
  })
}

afterEach(() => {
  Object.assign(Bun, { secrets: originalSecrets })
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

describe("HTTP TUI", () => {
  test("separates local files and hides unlinked Postman files at the HTTP entrance", async () => {
    const root = process.env.TUIMINAL_HTTP_HOME ?? ""
    const originalFetch = globalThis.fetch
    await mkdir(resolve(root, "postman"), { recursive: true })
    await writeFile(
      resolve(root, "local-source.http"),
      "# @name Local only\nGET https://local.test\n",
    )
    await writeFile(
      resolve(root, "postman/remote-source.http"),
      "# @name Remote only\nGET https://remote.test\n",
    )
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path === "/workspaces")
        return Response.json({ workspaces: [{ id: "w1", name: "Remote" }] })
      if (path === "/environments") return Response.json({ environments: [] })
      if (path === "/collections") return Response.json({ collections: [] })
      return Response.json({ values: [] })
    }) as typeof fetch
    try {
      await savePostmanAccount({ apiKey: "PMAK-fixture", region: "us" })
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-collection-file-local-source.http")),
      )
      expect(
        tui.renderer.root.findDescendantById("http-collection-directory-postman"),
      ).toBeUndefined()
      await click("http-change-source")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-source-picker")))
      await click("http-source-postman-card")
      await openHttpWorkspaceChooser(tui)
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-postman-modal")))
      await key("ESCAPE")
      await settle(() => !tui?.renderer.root.findDescendantById("http-postman-modal"))
      expect(
        tui?.renderer.root.findDescendantById("http-collection-file-postman/remote-source.http"),
      ).toBeUndefined()
      expect(
        tui.renderer.root.findDescendantById("http-collection-file-local-source.http"),
      ).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
      await rm(resolve(root, "postman/remote-source.http"), { force: true })
      await rm(resolve(root, "postman"), { recursive: true, force: true })
      await rm(resolve(root, "local-source.http"), { force: true })
    }
  })

  test("keeps a dirty HTTP draft open when changing source", async () => {
    await savePostmanAccount({ apiKey: "PMAK-fixture", region: "us" })
    tui = await testRender(<HttpClientWithNotifications active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-url-input")))
    await click("http-url-input")
    await key("x")
    await click("http-change-source")
    expect(tui.renderer.root.findDescendantById("http-source-picker")).toBeUndefined()
    await settle(
      () => tui?.captureCharFrame().includes("Salve ou feche os requests alterados") ?? false,
    )
    expect(tui.captureCharFrame()).toContain("Salve ou feche os requests alterados")
  })

  test("keeps a fresh Scratch saved when its URL input receives focus", async () => {
    const dirtyStates: boolean[] = []
    tui = await testRender(
      <HttpClient active onUnsavedChangesChange={(dirty) => dirtyStates.push(dirty)} />,
      { width: 120, height: 30 },
    )
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await act(async () => Bun.sleep(80))
    await tui.renderOnce()

    expect(tui.captureCharFrame()).not.toContain("● MODIFICADO")
    expect(dirtyStates.at(-1)).toBe(false)
  })

  test("renders every HTTP tutorial target from simulated local data", async () => {
    tui = await testRender(<HttpClient active tutorialMode />, { width: 120, height: 30 })
    await settle(() =>
      HTTP_TUTORIAL_STEPS.every((step) =>
        Boolean(tui?.renderer.root.findDescendantById(step.targetId)),
      ),
    )
    const frame = tui.captureCharFrame()
    expect(frame).toContain("GET Buscar usuário")
    expect(frame).toContain("200 OK")
    expect(frame).toContain("TOKEN EXTRAÍDO · VOLÁTIL")
  })

  test("cycles URL, navigation, request, and response panels from the keyboard", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")

    await key("TAB")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-navigation-collection")
    await key("TAB")
    const requestPane = tui.renderer.root.findDescendantById("http-request-pane-http-scratch-1") as
      | BoxRenderable
      | undefined
    expect(requestPane?.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.http).toInts())

    await key("l")
    const responsePane = tui.renderer.root.findDescendantById(
      "http-response-pane-http-scratch-1",
    ) as BoxRenderable | undefined
    expect(responsePane?.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.http).toInts())

    await key("l")
    const urlPane = tui.renderer.root.findDescendantById("http-url-pane") as
      | BoxRenderable
      | undefined
    expect(urlPane?.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.http).toInts())

    await key("h")
    expect(responsePane?.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.http).toInts())
  })

  test("shows contextual request arrows and cycles all six request views", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    expect(tui.renderer.root.findDescendantById("http-request-view-next")).toBeUndefined()

    await key("TAB")
    await key("TAB")
    expect(tui.renderer.root.findDescendantById("http-request-view-previous")).toBeDefined()
    expect(tui.renderer.root.findDescendantById("http-request-view-next")).toBeDefined()

    await key("f")
    await settle(() => tui?.captureCharFrame().includes("HEADERS") ?? false)
    expect(tui.captureCharFrame()).not.toContain("QUERY PARAMS")
    await key("f")
    await settle(() => tui?.captureCharFrame().includes("BODY DESATIVADO") ?? false)
    await key("f")
    await settle(
      () => tui?.captureCharFrame().includes("Nenhuma credencial configurada nesta aba.") ?? false,
    )
    await key("f")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-script-tab-preRequest")))
    await key("f")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-request-cookie-jar")))
    await key("f")
    await settle(() => tui?.captureCharFrame().includes("QUERY PARAMS") ?? false)
    await key("a")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-request-cookie-jar")))

    await key("l")
    expect(tui.renderer.root.findDescendantById("http-request-view-next")).toBeUndefined()
    await key("f")
    await key("h")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-request-cookie-jar")))
  })

  test("enters empty request tables and creates rows while typing", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("TAB")
    await key("TAB")

    for (const section of ["query", "path"]) {
      expect(
        Boolean(
          tui.renderer.root.findDescendantById(`http-key-value-enter-http-scratch-1-${section}`),
        ),
      ).toBe(true)
    }
    expect(
      tui
        .captureCharFrame()
        .split("\n")
        .find((line) => line.includes("QUERY PARAMS")),
    ).toContain("[Enter] Adicionar")

    await key("j")
    await settle(
      () =>
        tui
          ?.captureCharFrame()
          .split("\n")
          .find((line) => line.includes("PATH PARAMS"))
          ?.includes("[Enter] Adicionar") ?? false,
    )
    expect(tui.captureCharFrame().match(/Nenhum item definido\./g)?.length).toBe(2)

    await enter()
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
        "http-key-value-name-http-scratch-1-path-",
      ),
    )
    await act(async () => tui?.mockInput.typeText("id"))
    await key("TAB")
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
        "http-key-value-value-http-scratch-1-path-",
      ),
    )
    await act(async () => tui?.mockInput.typeText("42"))
    await key("TAB")
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id?.startsWith(
          "http-key-value-name-http-scratch-1-path-",
        ) ?? false,
    )
    expect((tui.renderer.currentFocusedRenderable as InputRenderable).value).toBe("")
    expect(tui.captureCharFrame().match(/Nenhum item definido\./g)?.length).toBe(1)
    await key("ESCAPE")
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id === "http-key-value-section-http-scratch-1-path",
    )
    await key("ESCAPE")
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-key-value-enter-http-scratch-1-path")),
    )
    await key("n")
    expect(tui.captureCharFrame().match(/\[●\] id/g)).toHaveLength(1)

    await key("f")
    await key("f")
    expect(tui.renderer.root.findDescendantById("http-body-kind-previous")).toBeDefined()
    expect(tui.renderer.root.findDescendantById("http-body-kind-next")).toBeDefined()
    await key("v")
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-body-editor-http-scratch-1")),
    )

    await key("f")
    expect(tui.renderer.root.findDescendantById("http-auth-kind-next")).toBeDefined()
    await key("v")
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-auth-token-http-scratch-1")),
    )

    await key("f")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-script-tab-preRequest")))
    await key("f")
    expect(tui.renderer.root.findDescendantById("http-request-more-next")).toBeDefined()
    await key("v")
    await settle(() => tui?.captureCharFrame().includes("ASSERTIONS DO REQUEST") ?? false)
    expect(tui.renderer.root.findDescendantById("http-assertion-add")).toBeDefined()
    await key("l")
    await settle(() => !(tui?.captureCharFrame().includes("[N] Adicionar") ?? true))
    expect(tui.renderer.root.findDescendantById("http-assertion-add")).toBeDefined()
  })

  test("navigates populated request tables before editing a selected cell", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await act(async () => tui?.mockInput.typeText("https://example.test/search?manga=2&lang=pt"))
    await key("TAB")
    await key("TAB")
    await enter()
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id ===
        "http-key-value-section-http-scratch-1-query",
    )
    const firstName = tui.renderer.root.findDescendantById(
      "http-key-value-name-http-scratch-1-url-query-0",
    ) as InputRenderable
    expect(firstName.backgroundColor.equals(RGBA.fromHex(COLORS.http))).toBe(true)
    await key("j")
    await key("l")
    const secondValue = tui.renderer.root.findDescendantById(
      "http-key-value-value-http-scratch-1-url-query-1",
    ) as InputRenderable
    expect(firstName.backgroundColor.equals(RGBA.fromHex(COLORS.canvas))).toBe(true)
    expect(secondValue.backgroundColor.equals(RGBA.fromHex(COLORS.http))).toBe(true)
    await enter()
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id ===
        "http-key-value-value-http-scratch-1-url-query-1",
    )
    await act(async () => tui?.mockInput.typeText("x"))
    await settle(
      () =>
        (
          tui?.renderer.root.findDescendantById("http-url-input") as InputRenderable
        )?.value.includes("lang=ptx") ?? false,
    )
    await key("ESCAPE")
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id ===
        "http-key-value-section-http-scratch-1-query",
    )
    await key("ESCAPE")
    await key("j")
    expect(
      tui.renderer.root.findDescendantById("http-key-value-enter-http-scratch-1-path"),
    ).toBeDefined()
  })

  test("selects an inactive request block and enters its table with the mouse", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("TAB")
    await key("TAB")
    await click("http-key-value-heading-http-scratch-1-path")
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-key-value-enter-http-scratch-1-path")),
    )
    await press("http-key-value-enter-http-scratch-1-path")
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
        "http-key-value-name-http-scratch-1-path-",
      ),
    )
  })

  test("toggles and deletes a selected request row in table mode", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("TAB")
    await key("TAB")
    await press("http-request-view-headers")
    await enter()
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id ===
        "http-key-value-section-http-scratch-1-header",
    )
    await key(" ")
    await settle(() => tui?.captureCharFrame().includes("[○] Accept") ?? false)
    await key("h")
    await enter()
    await settle(() => tui?.captureCharFrame().includes("[●] Accept") ?? false)
    await key("d")
    await settle(() => !(tui?.captureCharFrame().includes("Accept") ?? true))
    await key("ESCAPE")
    await settle(() => tui?.captureCharFrame().includes("Nenhum item definido.") ?? false)
  })

  test("navigates to row actions and deletes query parameters with Enter", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await act(async () => tui?.mockInput.typeText("https://example.test/search?manga=2&lang=pt"))
    await key("TAB")
    await key("TAB")
    await enter()
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id ===
        "http-key-value-section-http-scratch-1-query",
    )
    expect(tui.captureCharFrame()).toContain("[Space] Ativar/desativar")
    await key("l")
    await key("l")
    await settle(() => tui?.captureCharFrame().includes("[Enter] Excluir linha") ?? false)
    expect(
      tui.renderer.root.findDescendantById("http-key-value-delete-http-scratch-1-url-query-0"),
    ).toBeDefined()
    await enter()
    await settle(
      () =>
        (tui?.renderer.root.findDescendantById("http-url-input") as InputRenderable)?.value ===
        "https://example.test/search?lang=pt",
    )
    await enter()
    await settle(
      () =>
        (tui?.renderer.root.findDescendantById("http-url-input") as InputRenderable)?.value ===
        "https://example.test/search",
    )
    await enter()
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
        "http-key-value-name-http-scratch-1-query-",
      ),
    )
  })

  test("uses the same enter and draft-row flow for Headers, Form, and Multipart", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("TAB")
    await key("TAB")
    await press("http-request-view-headers")
    expect(tui.captureCharFrame()).not.toContain("[N] Adicionar")
    await enter()
    await settle(
      () =>
        tui?.renderer.currentFocusedRenderable?.id ===
        "http-key-value-section-http-scratch-1-header",
    )
    await key("j")
    await enter()
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
        "http-key-value-name-http-scratch-1-header-",
      ),
    )
    await key("TAB")
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
        "http-key-value-value-http-scratch-1-header-",
      ),
    )
    await key("TAB", false, true)
    await act(async () => tui?.mockInput.typeText("X-Test"))
    await key("TAB")
    await act(async () => tui?.mockInput.typeText("yes"))
    await key("ESCAPE")
    await key("ESCAPE")

    await press("http-request-view-body")
    for (let index = 0; index < 4; index += 1) await key("v")
    await settle(() => tui?.captureCharFrame().includes("FORM URL ENCODED") ?? false)
    await enter()
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
        "http-key-value-name-http-scratch-1-form-",
      ),
    )
    await act(async () => tui?.mockInput.typeText("tag"))
    await key("ESCAPE")
    await key("ESCAPE")

    await key("v")
    await settle(() => tui?.captureCharFrame().includes("MULTIPART") ?? false)
    await enter()
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
        "http-key-value-name-http-scratch-1-part-",
      ),
    )
    await act(async () => tui?.mockInput.typeText("upload"))
    await key("TAB")
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith(
        "http-key-value-value-http-scratch-1-part-",
      ),
    )
    await key("ESCAPE")
    await key("h")
    await key("h")
    await enter()
    await settle(() => tui?.captureCharFrame().includes("File") ?? false)
    await key("l")
    await key("l")
    await key("l")
    await enter()
    await settle(() => !(tui?.captureCharFrame().includes("upload") ?? true))
  })

  test("opens opaque .http blocks as exact read-only raw content", async () => {
    const path = resolve(process.env.TUIMINAL_WORKDIR ?? "", "opaque-ui.http")
    const source = "### Opaque UI\n# @name opaque-ui\nGET x.test > h.js\n"
    await writeFile(path, source)
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById("http-navigation-project-opaque-ui.http#opaque-ui"),
        ),
      )
      await press("http-navigation-project-opaque-ui.http#opaque-ui")
      await settle(
        () =>
          tui?.renderer.currentFocusedRenderable?.id ===
          "http-request-raw-opaque-ui.http#opaque-ui",
      )

      const frame = tui.captureCharFrame()
      expect(frame).toContain("SOMENTE LEITURA")
      expect(frame).toContain("# @name opaque-ui")
      expect(frame).toContain("GET x.test > h.js")
      expect(tui.renderer.root.findDescendantById("http-url-input")).toBeUndefined()
      expect(tui.renderer.root.findDescendantById("http-url-read-only")).toBeDefined()

      await key("s")
      expect(tui.captureCharFrame()).toContain("PRONTO PARA ENVIAR")
      expect(tui.captureCharFrame()).not.toContain("ENVIANDO")
    } finally {
      await unlink(path).catch(() => undefined)
    }
  })

  test("renders a redacted external conflict and exposes mouse resolutions", async () => {
    let resolution = ""
    tui = await testRender(
      <HttpExternalConflictModal
        conflict={{
          documentId: "request",
          requestName: "List users",
          path: "api/users.http",
          canUseExternal: true,
          diff: [
            { kind: "remove", text: "Authorization: <redacted>" },
            { kind: "add", text: "GET https://example.test/local" },
          ],
        }}
        busy={false}
        terminalWidth={100}
        terminalHeight={24}
        onResolve={(next) => {
          resolution = next
        }}
        onClose={() => undefined}
      />,
      { width: 100, height: 24 },
    )
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === "http-external-conflict-modal",
    )
    expect(tui.captureCharFrame()).toContain("CONFLITO EXTERNO")
    expect(tui.captureCharFrame()).toContain("Authorization: <redacted>")
    await press("http-external-conflict-apply-local")
    expect(resolution).toBe("apply-local")
  })

  test("opens the conflict review instead of overwriting an externally changed request", async () => {
    const path = resolve(process.env.TUIMINAL_WORKDIR ?? "", "conflict.http")
    const initial = "### Conflict request\n# @name conflict\nGET https://example.test/original\n"
    await writeFile(path, initial)
    try {
      tui = await testRender(<HttpClientWithNotifications active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById("http-navigation-project-conflict.http#conflict"),
        ),
      )
      await press("http-navigation-project-conflict.http#conflict")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await key("a", true)
      await act(async () => {
        tui?.mockInput.typeText("https://example.test/local")
        await tui?.renderOnce()
      })
      await writeFile(
        path,
        initial.replace("https://example.test/original", "https://example.test/external"),
      )
      await press("http-save-button")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-external-conflict-modal",
      )
      expect(tui.captureCharFrame()).toContain("− ARQUIVO EXTERNO · + VERSÃO LOCAL")
      expect(tui.captureCharFrame()).toContain("example.test/external")
      expect(tui.captureCharFrame()).toContain("example.test/local")
      await press("http-external-conflict-reload")
      await settle(() => tui?.captureCharFrame().includes("VERSÃO EXTERNA RECARREGADA") ?? false)
      expect(tui.captureCharFrame()).toContain("example.test/external")
    } finally {
      await unlink(path).catch(() => undefined)
    }
  })

  test.each([120, 52])("keeps environment sidebar actions visible at %i columns", async (width) => {
    updateUiSettings({ language: "pt-BR" })
    tui = await testRender(<HttpClient active />, { width, height: 30 })
    await openLocalHttp(tui)
    await press("http-environment-button")
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-environment-new")?.width),
    )
    for (const id of [
      "http-environment-entry-0",
      "http-environment-new",
      "http-environment-refresh",
      "http-environment-none",
    ]) {
      const control = tui.renderer.root.findDescendantById(id)!
      expect(control.screenX).toBeGreaterThanOrEqual(0)
      expect(control.screenX + control.width).toBeLessThanOrEqual(width)
      expect(control.screenY + control.height).toBeLessThan(30)
    }
    expect(tui.renderer.root.findDescendantById("http-navigation-history")).toBeUndefined()
  })

  test("creates a local private environment with keyboard table editing", async () => {
    const privatePath = resolve(process.env.TUIMINAL_WORKDIR ?? "", "http-client.private.env.json")
    await unlink(privatePath).catch(() => undefined)
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await press("http-environment-button")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-new")))
      await press("http-environment-new")
      await typeEnvironmentFields("local", [
        ["apiToken", "fixture-secret"],
        ["tenant", "fixture-tenant"],
      ])
      expect(tui.captureCharFrame()).toContain("fixture-secret")
      await press("http-environment-save")
      await settle(() => tui?.captureCharFrame().includes("[E] local") ?? false)
      const saved = await readFile(privatePath, "utf8")
      expect(saved).not.toContain("fixture-secret")
      expect(saved).not.toContain("fixture-tenant")
      expect(JSON.parse(saved).local.apiToken.startsWith("{{$tuiminal.keychain.")).toBe(true)
      expect([...storedSecrets.values()]).toEqual(["fixture-secret", "fixture-tenant"])
      expect((await stat(privatePath)).mode & 0o777).toBe(0o600)
    } finally {
      await unlink(privatePath).catch(() => undefined)
    }
  })

  test.each(["framed", "compact"] as const)(
    "environment tabs replace the request editor in %s layout",
    async (layout) => {
      updateUiSettings({ layout, language: "pt-BR" })
      tui = await testRender(<HttpClient active />, { width: 120, height: 40 })
      await openLocalHttp(tui)
      await press("http-environment-button")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-entry-0")))
      await press("http-environment-entry-0")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-environment-pane")
      expect(tui.renderer.root.findDescendantById("http-url-input")).toBeUndefined()
      expect(tui.renderer.root.findDescendantById("http-environment-manager-modal")).toBeUndefined()
      await enter()
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-cell-0-name",
      )
      await key("ESCAPE")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-environment-pane")
      await key("w", true)
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-url-input")))
    },
  )

  test("opens every collection in a Postman workspace and imports with an environment", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const originalFetch = globalThis.fetch
    let remoteMethod = "GET"
    let remoteUrl = "{{baseUrl}}/users"
    let pushes = 0
    let collectionReads = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path === "/workspaces")
        return Response.json({ workspaces: [{ id: "w1", name: "My Workspace" }], meta: {} })
      if (path === "/environments")
        return Response.json({ environments: [{ id: "e1", name: "Stage" }] })
      if (path === "/collections")
        return Response.json({
          collections: [
            { id: "c1", name: "Users" },
            { id: "c2", name: "Orders" },
          ],
          meta: { total: 2 },
        })
      if (path === "/collections/c2")
        return Response.json({
          collection: {
            info: {
              schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            },
            item: [
              {
                id: "f1",
                name: "Admin",
                item: [
                  {
                    id: "r2",
                    name: "Create",
                    request: { method: "POST", url: "https://example.test/orders" },
                  },
                ],
              },
            ],
          },
        })
      if (path === "/collections/c1") {
        collectionReads++
        return Response.json({
          collection: {
            info: {
              schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            },
            item: [{ id: "r1", name: "List", request: { method: remoteMethod, url: remoteUrl } }],
          },
        })
      }
      if (path === "/collections/c1/requests/r1" && init?.method === "PUT") {
        pushes += 1
        const changes = JSON.parse(String(init.body)) as { method?: string; url?: string }
        if (changes.method) remoteMethod = changes.method
        if (changes.url) remoteUrl = changes.url
        return Response.json({ data: { id: "r1" } })
      }
      if (path === "/environments/e1")
        return Response.json({
          environment: {
            name: "Stage",
            values: [{ key: "baseUrl", value: "https://stage.example.test" }],
          },
        })
      if (path === "/workspaces/w1/global-variables") return Response.json({ values: [] })
      return new Response(null, { status: 404 })
    }) as typeof fetch
    try {
      await savePostmanAccount({ apiKey: "PMAK-fixture", region: "us" })
      tui = await testRender(<HttpClientWithNotifications active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await click("http-change-source")
      await click("http-source-postman-card")
      await openHttpWorkspaceChooser(tui)
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-postman-workspace-w1")),
      )
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-postman-environment")))
      expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-postman-modal")
      expect(
        tui.renderer.root.findDescendantById("http-postman-environment")?.width,
      ).toBeGreaterThan(0)
      await key("e")
      await settle(() => tui?.captureCharFrame().includes("[E] Ambiente Stage") ?? false)
      const environmentButton = tui.renderer.root.findDescendantById("http-postman-environment")
      expect(tui.captureCharFrame().split("\n")[environmentButton?.screenY ?? 0]).toContain("Stage")
      expect(tui.captureCharFrame()).toContain("[E] Ambiente Stage")
      await enter()
      await settle(() => !tui?.renderer.root.findDescendantById("http-postman-modal"))
      expect(await Bun.file(resolve(root, "postman/c1.http")).exists()).toBe(false)
      expect(await Bun.file(resolve(root, "postman/c2.http")).exists()).toBe(false)
      await settle(() => tui?.captureCharFrame().includes("[E] Stage") ?? false)
      expect(
        tui?.renderer.root.findDescendantById("http-collection-directory-postman"),
      ).toBeUndefined()
      expect(tui?.captureCharFrame()).toContain("My Workspace")
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-collection-file-postman/c2.http")),
      )
      expect(
        tui?.renderer.root.findDescendantById("http-collection-folder-postman/c2.http:f1"),
      ).toBeUndefined()
      await press("http-collection-file-postman/c2.http")
      const folderId = "http-collection-folder-postman/c2.http:f1"
      await settle(() => Boolean(tui?.renderer.root.findDescendantById(folderId)))
      const orderRequestId = "http-navigation-project-postman/c2.http#r2"
      expect(tui?.renderer.root.findDescendantById(orderRequestId)).toBeUndefined()
      await press(folderId)
      await settle(() => Boolean(tui?.renderer.root.findDescendantById(orderRequestId)))
      const coloredMethod = tui
        .captureSpans()
        .lines.flatMap((line) => line.spans)
        .find((span) => span.text.trim() === "POST")
      expect(coloredMethod?.fg.toInts()).toEqual(RGBA.fromHex("#FFE083").toInts())
      const requestRow = tui.renderer.root.findDescendantById(orderRequestId)
      const requestName = tui
        .captureSpans()
        .lines[requestRow?.screenY ?? 0]?.spans.find((span) => span.text.includes("Create"))
      expect(requestName?.fg.toInts()).toEqual(RGBA.fromHex(COLORS.text).toInts())
      const folderRow = tui.renderer.root.findDescendantById(folderId)
      const folderName = tui
        .captureSpans()
        .lines[folderRow?.screenY ?? 0]?.spans.find((span) => span.text.includes("Admin"))
      expect(folderName?.fg.toInts()).toEqual(RGBA.fromHex(COLORS.text).toInts())
      await press(folderId)
      expect(tui?.renderer.root.findDescendantById(orderRequestId)).toBeUndefined()
      await press(folderId)
      await settle(() => Boolean(tui?.renderer.root.findDescendantById(orderRequestId)))
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-collection-file-postman/c1.http")),
      )
      await click("http-collection-file-postman/c1.http")
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById("http-navigation-project-postman/c1.http#r1"),
        ),
      )
      await click("http-navigation-project-postman/c1.http#r1")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-postman-push-button")))
      const urlMethod = tui.renderer.root.findDescendantById("http-method-button")
      const urlMethodText = tui
        .captureSpans()
        .lines[urlMethod?.screenY ?? 0]?.spans.find((span) => span.text.trim() === "GET")
      expect(urlMethodText?.fg.toInts()).toEqual(RGBA.fromHex("#9DDEB9").toInts())
      await key("m")
      await key("s", true)
      await settle(() => pushes === 1)
      expect(remoteUrl).toBe("{{baseUrl}}/usersm")
      await settle(() => tui?.captureCharFrame().includes("REQUEST SALVO NO POSTMAN") ?? false)
      const beforeMouseSave = collectionReads
      await click("http-postman-push-button")
      await settle(() => collectionReads > beforeMouseSave)
      const beforeKeyboardSave = collectionReads
      await key("p", true)
      await settle(() => collectionReads > beforeKeyboardSave)
      expect(pushes).toBe(1)
      remoteUrl = "https://changed-elsewhere.test/users"
      await click("http-url-input")
      await key("x")
      await key("s", true)
      await settle(() => tui?.captureCharFrame().includes("A request mudou no Postman") ?? false)
      expect(pushes).toBe(1)
      expect(
        (tui.renderer.root.findDescendantById("http-url-input") as InputRenderable).value,
      ).toBe("{{baseUrl}}/usersmx")
      expect(remoteUrl).toBe("https://changed-elsewhere.test/users")
      expect(await Bun.file(resolve(root, "postman/c1.http")).exists()).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
      await rm(resolve(root, "postman"), { recursive: true, force: true })
      await rm(resolve(root, "http-client.private.env.json"), { force: true })
    }
  })

  test("hides repeated Postman requests when their folder or collection closes", async () => {
    const root = process.env.TUIMINAL_HTTP_HOME ?? ""
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path === "/workspaces")
        return Response.json({ workspaces: [{ id: "w1", name: "Repeated Workspace" }], meta: {} })
      if (path === "/collections")
        return Response.json({ collections: [{ id: "c1", name: "Repeated" }], meta: { total: 1 } })
      if (path === "/collections/c1")
        return Response.json({
          collection: {
            info: {
              schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            },
            item: [
              {
                id: "f1",
                name: "Folder",
                item: [
                  {
                    id: "f2",
                    name: "Nested",
                    item: Array.from({ length: 20 }, (_, index) => ({
                      id: `r${index + 1}`,
                      name: "New Request",
                      request: { method: "GET", url: `https://example.test/${index + 1}` },
                    })),
                  },
                ],
              },
            ],
          },
        })
      if (path === "/workspaces/w1/global-variables") return Response.json({ values: [] })
      return new Response(null, { status: 404 })
    }) as typeof fetch
    try {
      await savePostmanAccount({ apiKey: "PMAK-fixture", region: "us" })
      tui = await testRender(<HttpClient active />, { width: 100, height: 32 })
      await openLocalHttp(tui)
      await click("http-change-source")
      await click("http-source-postman-card")
      await openHttpWorkspaceChooser(tui)
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-postman-workspace-w1")),
      )
      await enter()
      const fileId = "http-collection-file-postman/c1.http"
      const folderId = "http-collection-folder-postman/c1.http:f1"
      const nestedId = "http-collection-folder-postman/c1.http:f2"
      await settle(() => Boolean(tui?.renderer.root.findDescendantById(fileId)))
      expect(tui?.renderer.root.findDescendantById(folderId)).toBeUndefined()
      expect(tui.captureCharFrame()).not.toContain("GET New R")
      await press(fileId)
      await settle(() => Boolean(tui?.renderer.root.findDescendantById(folderId)))
      expect(tui?.renderer.root.findDescendantById(nestedId)).toBeUndefined()
      await press(folderId)
      await settle(() => Boolean(tui?.renderer.root.findDescendantById(nestedId)))
      expect(tui.captureCharFrame()).not.toContain("GET New R")
      await press(nestedId)
      await settle(() => tui?.captureCharFrame().includes("GET New R") ?? false)
      await press(nestedId)
      await settle(() => !(tui?.captureCharFrame().includes("GET New R") ?? true))
      expect(tui.captureCharFrame()).toContain("▸ Nest")
      await press(nestedId)
      await settle(() => tui?.captureCharFrame().includes("GET New R") ?? false)
      await press(fileId)
      await settle(() => !(tui?.captureCharFrame().includes("GET New R") ?? true))
      expect(tui.captureCharFrame()).toContain("▸ Repeated")
      await press(fileId)
      await settle(() => tui?.captureCharFrame().includes("GET New R") ?? false)
      const requestIds = Array.from(
        { length: 20 },
        (_, index) => `http-navigation-project-postman/c1.http#r${index + 1}`,
      )
      expect(requestIds.every((id) => tui?.renderer.root.findDescendantById(id))).toBe(true)
      expect(new Set(requestIds).size).toBe(20)
      expect(await Bun.file(resolve(root, "postman/c1.http")).exists()).toBe(false)
      await collectionAction("select-workspace", true)
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-postman-modal")))
      await enter()
      await settle(() => !tui?.renderer.root.findDescendantById("http-postman-modal"))
      expect(tui?.renderer.root.findDescendantById(folderId)).toBeUndefined()
      expect(tui.captureCharFrame()).not.toContain("GET New R")
    } finally {
      globalThis.fetch = originalFetch
      await rm(resolve(root, "postman"), { recursive: true, force: true })
    }
  })

  test("clears request rows while closing many Postman collections", async () => {
    const root = process.env.TUIMINAL_HTTP_HOME ?? ""
    const originalFetch = globalThis.fetch
    const collections = Array.from({ length: 15 }, (_, index) => ({
      id: `c${index}`,
      name: `Collection${String(index).padStart(2, "0")}`,
    }))
    const requestCounts = [35, 1, 11, 1, 28, 18, 4, 0, 2, 42, 4, 96, 97, 8, 11]
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path === "/workspaces")
        return Response.json({ workspaces: [{ id: "w1", name: "Many Collections" }], meta: {} })
      if (path === "/collections")
        return Response.json({ collections, meta: { total: collections.length } })
      if (path === "/workspaces/w1/global-variables") return Response.json({ values: [] })
      const match = path.match(/^\/collections\/c(\d+)$/)
      if (match) {
        const index = Number(match[1])
        return Response.json({
          collection: {
            info: {
              schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            },
            item: Array.from({ length: requestCounts[index] ?? 0 }, (_, requestIndex) => ({
              id: `r${index}-${requestIndex}`,
              name: "New Request",
              request: { method: "GET", url: `https://example.test/${index}/${requestIndex}` },
            })),
          },
        })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    try {
      await savePostmanAccount({ apiKey: "PMAK-fixture", region: "us" })
      tui = await testRender(<HttpClient active />, { width: 100, height: 32 })
      await openLocalHttp(tui)
      await click("http-change-source")
      await click("http-source-postman-card")
      await openHttpWorkspaceChooser(tui)
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-postman-workspace-w1")),
      )
      await enter()
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-collection-file-postman/c14.http")),
      )
      await settle(() => !tui?.renderer.root.findDescendantById("http-postman-modal"))
      const scroll = tui.renderer.root.findDescendantById(
        "http-collection-scroll",
      ) as ScrollBoxRenderable
      expect(scroll.viewportCulling).toBe(false)
      expect(tui.captureCharFrame()).toContain("▸ Collecti")
      expect(tui.captureCharFrame()).not.toContain("GET New Req")
      for (const collection of collections) {
        const id = `http-collection-file-postman/${collection.id}.http`
        await press(id)
        await press(id)
      }
      await settle(() => !(tui?.captureCharFrame().includes("GET New Req") ?? true))
      expect(tui.captureCharFrame()).toContain("▸ Collecti")
    } finally {
      globalThis.fetch = originalFetch
      await rm(resolve(root, "postman"), { recursive: true, force: true })
    }
  })

  test("chooses a Postman workspace when creating a collection and creates its request remotely", async () => {
    const root = process.env.TUIMINAL_HTTP_HOME ?? ""
    const postmanDirectory = resolve(root, "postman")
    const postmanDirectoryExisted = await stat(postmanDirectory).then(
      () => true,
      () => false,
    )
    const originalFetch = globalThis.fetch
    const collectionName = `Remote${Date.now()}`
    const remote = {
      info: {
        name: collectionName,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [] as Array<
        | {
            id: string
            name: string
            request: {
              method: string
              url: string
              auth?: unknown
              header?: unknown
              description?: string
            }
          }
        | {
            id: string
            name: string
            item: Array<{
              id: string
              name: string
              request: {
                method: string
                url: string
                auth?: unknown
                header?: unknown
                description?: string
              }
            }>
          }
      >,
    }
    const writes: string[] = []
    let requestIndex = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname === "/workspaces")
        return Response.json({
          workspaces: [
            { id: "w1", name: "First" },
            { id: "w2", name: "Second" },
          ],
          meta: {},
        })
      if (url.pathname === "/collections" && (!init?.method || init.method === "GET"))
        return Response.json({
          collections: writes.length ? [{ id: "c1", name: collectionName }] : [],
        })
      if (url.pathname === "/environments") return Response.json({ environments: [] })
      if (url.pathname.endsWith("/global-variables")) return Response.json({ values: [] })
      if (url.pathname === "/collections" && init?.method === "POST") {
        writes.push(`collection:${url.searchParams.get("workspace")}`)
        return Response.json({ collection: { id: "c1" } })
      }
      if (url.pathname === "/collections/c1" && init?.method === "GET")
        return Response.json({ collection: remote })
      if (url.pathname === "/collections/c1/folders" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name: string }
        writes.push(`folder:${body.name}`)
        remote.item.push({ id: "f1", name: body.name, item: [] })
        return Response.json({ data: { id: "f1" } })
      }
      if (url.pathname === "/collections/c1/requests" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          name: string
          method: string
          url: string
          auth?: unknown
          headerData?: unknown
          description?: string
        }
        const folderId = url.searchParams.get("folderId")
        writes.push(`request:${body.name}:${folderId ?? "root"}`)
        const target = folderId
          ? remote.item.find((item) => item.id === folderId && "item" in item)
          : null
        const destination = target && "item" in target ? target.item : remote.item
        const id = `r${++requestIndex}`
        destination.push({
          id,
          name: body.name,
          request: {
            method: body.method,
            url: body.url,
            auth: body.auth,
            header: body.headerData,
            description: body.description ?? "",
          },
        })
        return Response.json({ data: { id } })
      }
      if (url.pathname.startsWith("/collections/c1/requests/") && init?.method === "PUT") {
        const id = url.pathname.split("/").at(-1)
        const changes = JSON.parse(String(init.body)) as { url?: string; method?: string }
        const request = remote.item
          .flatMap((item) => ("item" in item ? item.item : [item]))
          .find((item) => item.id === id)
        if (!request) return new Response(null, { status: 404 })
        Object.assign(request.request, changes)
        writes.push(`update:${id}`)
        return Response.json({ data: { id } })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    try {
      await savePostmanAccount({ apiKey: "PMAK-fixture", region: "us" })
      tui = await testRender(<HttpClientWithNotifications active />, { width: 130, height: 36 })
      await openLocalHttp(tui)
      await click("http-change-source")
      await click("http-source-postman-card")
      await openHttpWorkspaceChooser(tui)
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-postman-workspace-w1")),
      )
      await click("http-postman-workspace-w2")
      await settle(() => !tui?.renderer.root.findDescendantById("http-postman-modal"))
      await collectionAction("create-collection", true)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText(collectionName)
        await tui?.renderOnce()
      })
      await enter()
      await settle(
        () =>
          Boolean(tui?.renderer.root.findDescendantById(`http-collection-file-postman/c1.http`)) &&
          !tui?.renderer.root.findDescendantById("http-collection-action-form"),
      )
      expect(writes).toContain("collection:w2")
      expect(await Bun.file(resolve(root, "postman/c1.http.postman.json")).exists()).toBe(false)
      await click(`http-collection-file-postman/c1.http`)
      await collectionAction("create-request")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText("List")
        await tui?.renderOnce()
      })
      await enter()
      await settle(
        () =>
          Boolean(
            tui?.renderer.root.findDescendantById(`http-navigation-project-postman/c1.http#r1`),
          ) && !tui?.renderer.root.findDescendantById("http-collection-action-form"),
      )
      expect(writes).toContain("request:List:root")
      await click(`http-collection-file-postman/c1.http`)
      await collectionAction("create-folder")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText("People")
        await tui?.renderOnce()
      })
      await enter()
      const folderRow = `http-collection-folder-postman/c1.http:f1`
      await settle(
        () =>
          Boolean(tui?.renderer.root.findDescendantById(folderRow)) &&
          !tui?.renderer.root.findDescendantById("http-collection-action-form"),
      )
      expect(writes).toContain("folder:People")
      await click(folderRow)
      await collectionAction("create-request")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText("Search")
        await tui?.renderOnce()
      })
      await enter()
      await settle(
        () =>
          writes.includes("request:Search:f1") &&
          !tui?.renderer.root.findDescendantById("http-collection-action-form"),
      )
      expect(remote.item.find((item) => item.id === "f1")).toMatchObject({
        item: [expect.objectContaining({ name: "Search" })],
      })
      await key("ESCAPE")
      await key("n", true)
      // The omnibar keeps its native input across documents; focus alone can be stale.
      await settle(
        () =>
          Boolean(tui?.renderer.root.findDescendantById("http-document-http-scratch-1")) &&
          tui?.renderer.currentFocusedRenderable?.id === "http-url-input" &&
          (tui.renderer.currentFocusedRenderable as InputRenderable).value === "",
      )
      await act(async () => {
        tui?.mockInput.typeText("https://draft.example.test")
        await tui?.renderOnce()
      })
      await key("s", true)
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-postman-save-modal")))
      await key("ARROW_DOWN")
      await enter()
      await settle(() => writes.includes("request:Scratch:f1"))
      await settle(() => tui?.captureCharFrame().includes("REQUEST SALVO NO POSTMAN") ?? false)
      expect(writes).toContain("request:Scratch:f1")
      expect(
        remote.item
          .flatMap((item) => ("item" in item ? item.item : [item]))
          .find((item) => item.id === "r3")?.request.url,
      ).toBe("https://draft.example.test")
      expect(writes).not.toContain("update:r3")
      expect(await Bun.file(resolve(root, "postman/c1.http")).exists()).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
      await rm(resolve(root, `postman/c1.http`), { force: true })
      await rm(resolve(root, `postman/c1.http.postman.json`), { force: true })
      if (!postmanDirectoryExisted) await rm(postmanDirectory, { recursive: true, force: true })
    }
  }, 15_000)

  test("manages folders, collections and requests through mouse controls", async () => {
    const root = process.env.TUIMINAL_HTTP_HOME ?? ""
    const folder = `mouse-tree-${Date.now()}`
    const folderPath = resolve(root, folder)
    const renamedFolder = `${folder}-renamed`
    const renamedFolderPath = resolve(root, renamedFolder)
    const typeName = async (value: string) => {
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText(value)
        await tui?.renderOnce()
      })
      await enter()
    }
    try {
      tui = await testRender(<HttpClient active />, { width: 160, height: 42 })
      await openLocalHttp(tui)
      await collectionAction("create-folder", true)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText(folder)
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById(`http-collection-directory-${folder}`)),
      )

      await click(`http-collection-directory-${folder}`)
      await collectionAction("create-collection")
      await typeName("Service")
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-file-${folder}/Service.http`),
        ),
      )
      await click(`http-collection-file-${folder}/Service.http`)
      await collectionAction("create-request")
      await typeName("Listar")
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(
            `http-navigation-project-${folder}/Service.http#listar`,
          ),
        ),
      )
      expect(await readFile(resolve(folderPath, "Service.http"), "utf8")).toContain("### Listar")

      await click(`http-navigation-project-${folder}/Service.http#listar`)
      await collectionAction("rename")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        const input = tui?.renderer.root.findDescendantById("http-collection-name-input") as
          | InputRenderable
          | undefined
        expect(input).toBeDefined()
        input?.selectAll()
        tui?.mockInput.typeText("Consultar")
      })
      await enter()
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(
            `http-navigation-project-${folder}/Service.http#consultar`,
          ),
        ),
      )

      await click(`http-navigation-project-${folder}/Service.http#consultar`)
      await collectionAction("delete")
      expect(await readFile(resolve(folderPath, "Service.http"), "utf8")).toContain("Consultar")
      await click("http-collection-action-apply")
      await settle(
        () =>
          !tui?.renderer.root.findDescendantById(
            `http-navigation-project-${folder}/Service.http#consultar`,
          ),
      )
      expect(await Bun.file(resolve(folderPath, "Service.http")).exists()).toBe(false)

      await click(`http-collection-directory-${folder}`)
      await collectionAction("create-collection")
      await typeName("Users")
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById(`http-collection-file-${folder}/Users.http`)),
      )
      await click(`http-collection-file-${folder}/Users.http`)
      await collectionAction("rename")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        const input = tui?.renderer.root.findDescendantById("http-collection-name-input") as
          | InputRenderable
          | undefined
        input?.selectAll()
        tui?.mockInput.typeText("Accounts")
      })
      await enter()
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-file-${folder}/Accounts.http`),
        ),
      )
      await click(`http-collection-file-${folder}/Accounts.http`)
      await collectionAction("delete")
      await click("http-collection-action-apply")
      await settle(
        () =>
          !tui?.renderer.root.findDescendantById(`http-collection-file-${folder}/Accounts.http`),
      )

      await click(`http-collection-directory-${folder}`)
      await collectionAction("rename")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        const input = tui?.renderer.root.findDescendantById("http-collection-name-input") as
          | InputRenderable
          | undefined
        input?.selectAll()
        tui?.mockInput.typeText(renamedFolder)
      })
      await enter()
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-directory-${renamedFolder}`),
        ),
      )
      await click(`http-collection-directory-${renamedFolder}`)
      await collectionAction("delete")
      await click("http-collection-action-apply")
      await settle(
        () => !tui?.renderer.root.findDescendantById(`http-collection-directory-${renamedFolder}`),
      )
    } finally {
      await rm(folderPath, { recursive: true, force: true })
      await rm(renamedFolderPath, { recursive: true, force: true })
    }
  })

  test("navigates and manages the collection tree entirely by keyboard", async () => {
    const root = process.env.TUIMINAL_HTTP_HOME ?? ""
    const folder = `keyboard-tree-${Date.now()}`
    const folderPath = resolve(root, folder)
    const collectionPath = resolve(folderPath, "Service.http")
    try {
      await mkdir(folderPath, { recursive: true })
      for (let index = 0; index < 28; index += 1) {
        await writeFile(
          resolve(folderPath, `Seed${String(index).padStart(2, "0")}.http`),
          "### Seed\nGET https://example.test\n",
        )
      }
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById(`http-collection-directory-${folder}`)),
      )
      await key("TAB")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-navigation-collection",
      )
      await key("?")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-action-palette")))
      await key("ESCAPE")
      expect(tui?.renderer.root.findDescendantById("http-action-palette")).toBeUndefined()
      await key("f")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-search")
      await act(async () => {
        tui?.mockInput.typeText(folder)
        await tui?.renderOnce()
      })
      await key("ESCAPE")
      await key("ARROW_DOWN")
      await key("END")
      const scroll = tui.renderer.root.findDescendantById(
        "http-collection-scroll",
      ) as ScrollBoxRenderable
      expect(scroll.scrollTop).toBeGreaterThan(0)
      await key("HOME")
      await key("f")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-search")
      await act(async () => {
        const input = tui?.renderer.root.findDescendantById(
          "http-collection-search",
        ) as InputRenderable
        input.selectAll()
        tui?.mockInput.pressKey("BACKSPACE")
        await tui?.renderOnce()
      })
      await key("ESCAPE")
      await key("HOME")
      await key("ARROW_DOWN")
      await keyboardCollectionAction(4)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText("Service")
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-file-${folder}/Service.http`) &&
            !tui?.renderer.root.findDescendantById("http-collection-action-form"),
        ),
      )
      await settle(() => !tui?.renderer.root.findDescendantById("http-collection-action-form"))
      expect(await Bun.file(collectionPath).exists()).toBe(true)
      await keyboardCollectionAction(2)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        const input = tui?.renderer.root.findDescendantById(
          "http-collection-name-input",
        ) as InputRenderable
        input.selectAll()
        tui?.mockInput.typeText("Api")
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-file-${folder}/Api.http`) &&
            !tui?.renderer.root.findDescendantById("http-collection-action-form"),
        ),
      )
      await settle(() => !tui?.renderer.root.findDescendantById("http-collection-action-form"))
      await keyboardCollectionAction(2)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        const input = tui?.renderer.root.findDescendantById(
          "http-collection-name-input",
        ) as InputRenderable
        input.selectAll()
        tui?.mockInput.typeText("Service")
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-file-${folder}/Service.http`) &&
            !tui?.renderer.root.findDescendantById("http-collection-action-form"),
        ),
      )
      await settle(() => !tui?.renderer.root.findDescendantById("http-collection-action-form"))
      await keyboardCollectionAction(0)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText("Listar")
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(
            `http-navigation-project-${folder}/Service.http#listar`,
          ) && !tui?.renderer.root.findDescendantById("http-collection-action-form"),
        ),
      )
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await key("TAB")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-navigation-collection",
      )
      await key("ARROW_DOWN")
      await keyboardCollectionAction(0)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        const input = tui?.renderer.root.findDescendantById(
          "http-collection-name-input",
        ) as InputRenderable
        input.selectAll()
        tui?.mockInput.typeText("Consultar")
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(
            `http-navigation-project-${folder}/Service.http#consultar`,
          ) && !tui?.renderer.root.findDescendantById("http-collection-action-form"),
        ),
      )
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await key("TAB")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-navigation-collection",
      )
      await key("END")
      await keyboardCollectionAction(1)
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-collection-action-form")),
      )
      await key("ESCAPE")
      expect(await readFile(collectionPath, "utf8")).toContain("Consultar")
      await keyboardCollectionAction(1)
      await enter()
      await settle(
        () =>
          !tui?.renderer.root.findDescendantById("http-collection-action-form") &&
          !tui?.renderer.root.findDescendantById(
            `http-navigation-project-${folder}/Service.http#consultar`,
          ) &&
          !tui?.renderer.root.findDescendantById("http-collection-action-form"),
      )
      await key("HOME")
      await key("ARROW_DOWN")
      await keyboardCollectionAction(4)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText("ToDelete")
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-file-${folder}/ToDelete.http`) &&
            !tui?.renderer.root.findDescendantById("http-collection-action-form"),
        ),
      )
      await settle(() => !tui?.renderer.root.findDescendantById("http-collection-action-form"))
      await key("a")
      await key("ARROW_UP")
      await enter()
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-action-form",
      )
      await enter()
      await settle(
        () =>
          !tui?.renderer.root.findDescendantById("http-collection-action-form") &&
          !tui?.renderer.root.findDescendantById(`http-collection-file-${folder}/ToDelete.http`) &&
          !tui?.renderer.root.findDescendantById("http-collection-action-form"),
      )
      await key("HOME")
      await key("ARROW_DOWN")
      await keyboardCollectionAction(1)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText("Nested")
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-directory-${folder}/Nested`) &&
            !tui?.renderer.root.findDescendantById("http-collection-action-form"),
        ),
      )
      await settle(() => !tui?.renderer.root.findDescendantById("http-collection-action-form"))
      await keyboardCollectionAction(2)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        const input = tui?.renderer.root.findDescendantById(
          "http-collection-name-input",
        ) as InputRenderable
        input.selectAll()
        tui?.mockInput.typeText("Renamed")
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-directory-${folder}/Renamed`) &&
            !tui?.renderer.root.findDescendantById("http-collection-action-form"),
        ),
      )
      await settle(() => !tui?.renderer.root.findDescendantById("http-collection-action-form"))
      await key("a")
      await key("ARROW_UP")
      await enter()
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-action-form",
      )
      await enter()
      await settle(
        () =>
          !tui?.renderer.root.findDescendantById("http-collection-action-form") &&
          !tui?.renderer.root.findDescendantById(`http-collection-directory-${folder}/Renamed`) &&
          !tui?.renderer.root.findDescendantById("http-collection-action-form"),
      )
      await press("http-navigation-environments")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-environment-entry-0")
      await key("c")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-navigation-collection",
      )
      await key("HOME")
      await key("ARROW_DOWN")
      await keyboardCollectionAction(1)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input",
      )
      await act(async () => {
        tui?.mockInput.typeText("AfterHistory")
        tui?.mockInput.pressEnter()
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(`http-collection-directory-${folder}/AfterHistory`),
        ),
      )
    } finally {
      await rm(folderPath, { recursive: true, force: true })
    }
  }, 15_000)

  test("uses the same global environments while browsing a collection", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const globalPath = resolve(root, "http-client.env.json")
    const privatePath = resolve(root, "http-client.private.env.json")
    const scopeRoot = resolve(root, "scoped-environment")
    const requestDirectory = resolve(scopeRoot, "api")
    const siblingDirectory = resolve(scopeRoot, "sibling")
    const requestPath = resolve(requestDirectory, "requests.http")
    await mkdir(requestDirectory, { recursive: true })
    await mkdir(siblingDirectory, { recursive: true })
    await writeFile(requestPath, "### Scoped\n# @name scoped\nGET https://example.test/scoped\n")
    await writeFile(globalPath, JSON.stringify({ shared: { host: "global" } }))
    await unlink(privatePath).catch(() => undefined)
    await writeFile(
      resolve(requestDirectory, "http-client.env.json"),
      JSON.stringify({ dev: { host: "local" } }),
    )
    await writeFile(
      resolve(scopeRoot, "http-client.env.json"),
      JSON.stringify({ "parent-only": { host: "parent" } }),
    )
    await writeFile(
      resolve(siblingDirectory, "http-client.env.json"),
      JSON.stringify({ "sibling-only": { host: "sibling" } }),
    )
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById(
            "http-navigation-project-scoped-environment/api/requests.http#scoped",
          ),
        ),
      )
      await press("http-navigation-project-scoped-environment/api/requests.http#scoped")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await press("http-environment-button")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-entry-1")))
      const listFrame = tui.captureCharFrame()
      expect(listFrame).toContain("shared")
      expect(listFrame).not.toContain("dev")
      expect(listFrame).not.toContain("parent-only")
      expect(listFrame).not.toContain("sibling-only")

      await press("http-environment-new")
      await typeEnvironmentFields("created-local", [["apiToken", "global-ui-value"]])
      await press("http-environment-save")
      await settle(() => tui?.captureCharFrame().includes("[E] created-local") ?? false)
      expect(JSON.parse(await readFile(globalPath, "utf8"))).toEqual({ shared: { host: "global" } })
      const saved = await readFile(privatePath, "utf8")
      expect(saved).not.toContain("global-ui-value")
      expect(JSON.parse(saved)["created-local"].apiToken.startsWith("{{$tuiminal.keychain.")).toBe(
        true,
      )
      expect([...storedSecrets.values()]).toContain("global-ui-value")
      expect((await stat(privatePath)).mode & 0o777).toBe(0o600)
    } finally {
      await rm(scopeRoot, { recursive: true, force: true })
      await unlink(globalPath).catch(() => undefined)
      await unlink(privatePath).catch(() => undefined)
    }
  })

  test("edits always-active Globals and omits workspace defaults", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const configPath = resolve(root, ".tuiminal/http/config.json")
    const privatePath = resolve(root, "http-client.private.env.json")
    const original = await readFile(privatePath).catch(() => null)
    await unlink(privatePath).catch(() => undefined)
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await press("http-environment-button")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-entry-0")))
      await press("http-environment-entry-0")
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-environment-cell-0-name")?.width),
      )
      expect(tui.captureCharFrame()).toContain("Global")
      expect(tui.captureCharFrame()).not.toContain("DEFAULTS DO WORKSPACE HTTP")
      await click("http-environment-cell-0-name")
      await act(async () => tui?.mockInput.typeText("manga"))
      await key("TAB")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-cell-0-value",
      )
      await act(async () => tui?.mockInput.typeText("2"))
      await press("http-environment-save")
      await settle(() => !(tui?.captureCharFrame().includes("Global ●") ?? true))
      const saved = JSON.parse(await readFile(privatePath, "utf8")) as {
        Globals: { manga: string }
      }
      expect(saved.Globals.manga.startsWith("{{$tuiminal.keychain.")).toBe(true)
      expect([...storedSecrets.values()]).toContain("2")
      expect((await stat(privatePath)).mode & 0o777).toBe(0o600)
      expect(await readFile(configPath, "utf8").catch(() => "")).not.toContain("Globals")
    } finally {
      if (original) await writeFile(privatePath, original)
      else await unlink(privatePath).catch(() => undefined)
    }
  })

  test("completes URL variables and mirrors URL query parameters into Params", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const privatePath = resolve(root, "http-client.private.env.json")
    const original = await readFile(privatePath).catch(() => null)
    await writeFile(privatePath, JSON.stringify({ Globals: { manga: "secret-fixture" } }))
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-button")))
      await act(async () => Bun.sleep(100))
      await act(async () => tui?.mockInput.typeText("https://example.test/{{"))
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-url-variable-manga")))
      expect(tui.captureCharFrame()).toContain("secret-fixture")
      await key("TAB")
      await settle(
        () =>
          (tui?.renderer.root.findDescendantById("http-url-input") as InputRenderable)?.value ===
          "https://example.test/{{manga}}",
      )
      await act(async () => tui?.mockInput.typeText("?manga=2"))
      await settle(() =>
        Boolean(
          tui?.renderer.root.findDescendantById("http-key-value-name-http-scratch-1-url-query-0"),
        ),
      )
      const value = tui.renderer.root.findDescendantById(
        "http-key-value-value-http-scratch-1-url-query-0",
      ) as InputRenderable
      expect(value.value).toBe("2")
    } finally {
      if (original) await writeFile(privatePath, original)
      else await unlink(privatePath).catch(() => undefined)
    }
  })

  test("reopens URL variable suggestions after a failed request", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const privatePath = resolve(root, "http-client.private.env.json")
    const original = await readFile(privatePath).catch(() => null)
    await writeFile(privatePath, JSON.stringify({ Globals: { manga: "secret-fixture" } }))
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-button")))
      await act(async () => Bun.sleep(100))
      await act(async () => tui?.mockInput.typeText("http://{{"))
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-url-variable-manga")))

      await act(async () => {
        tui?.mockInput.pressEnter()
        await Bun.sleep(10)
        await tui?.renderOnce()
      })
      await key("ESCAPE")
      await key("ESCAPE")
      await key("/")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-url-variable-manga")))
      await key("ESCAPE")
      await settle(() => !tui?.renderer.root.findDescendantById("http-url-variable-manga"))
      await key("ESCAPE")
      await key("/")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-url-variable-manga")))
      await key("TAB")
      await settle(
        () =>
          (tui?.renderer.root.findDescendantById("http-url-input") as InputRenderable)?.value ===
          "http://{{manga}}",
      )
    } finally {
      if (original) await writeFile(privatePath, original)
      else await unlink(privatePath).catch(() => undefined)
    }
  })

  test("keeps a query parameter name unfinished while typing in the URL", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await act(async () => tui?.mockInput.typeText("https://example.test/search?"))
    for (const [index, letter] of [..."manga"].entries()) {
      await act(async () => {
        tui?.mockInput.typeText(letter)
        await tui?.renderOnce()
      })
      const input = tui.renderer.root.findDescendantById("http-url-input") as InputRenderable
      expect(input.value).toBe(`https://example.test/search?${"manga".slice(0, index + 1)}`)
    }
    await settle(() =>
      Boolean(
        tui?.renderer.root.findDescendantById("http-key-value-name-http-scratch-1-url-query-0"),
      ),
    )
    await act(async () => {
      tui?.mockInput.typeText("=2")
      await tui?.renderOnce()
    })
    const input = tui.renderer.root.findDescendantById("http-url-input") as InputRenderable
    expect(input.value).toBe("https://example.test/search?manga=2")
    const value = tui.renderer.root.findDescendantById(
      "http-key-value-value-http-scratch-1-url-query-0",
    ) as InputRenderable
    expect(value.value).toBe("2")
    await focus("http-key-value-value-http-scratch-1-url-query-0")
    value.cursorOffset = value.value.length
    await act(async () => {
      tui?.mockInput.typeText("3")
      await tui?.renderOnce()
    })
    await settle(() => input.value === "https://example.test/search?manga=23")
  })

  test("edits and deletes a saved environment from its tab", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const privatePath = resolve(root, "http-client.private.env.json")
    const original = await readFile(privatePath).catch(() => null)
    await writeFile(privatePath, JSON.stringify({ local: { manga: "private-fixture" } }))
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await press("http-environment-button")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-entry-1")))
      await press("http-environment-entry-1")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-name")))
      const nameInput = tui.renderer.root.findDescendantById(
        "http-environment-name",
      ) as InputRenderable
      expect(nameInput.value).toBe("local")
      expect(tui.captureCharFrame()).toContain("private-fixture")
      await press("http-environment-save")
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-delete")))
      await press("http-environment-delete")
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-discard-document-confirm")),
      )
      expect(tui.captureCharFrame()).toContain("local")
      await press("http-discard-document-confirm")
      await settle(
        () =>
          Boolean(tui?.renderer.root.findDescendantById("http-environment-entry-0")) &&
          !tui?.renderer.root.findDescendantById("http-environment-entry-1"),
      )
      expect(JSON.parse(await readFile(privatePath, "utf8"))).toEqual({})
    } finally {
      if (original) await writeFile(privatePath, original)
      else await unlink(privatePath).catch(() => undefined)
    }
  })

  test("exit modal owns Escape directly", async () => {
    let closed = false
    tui = await testRender(
      <UnsavedChangesExitModal
        open
        terminalWidth={80}
        terminalHeight={20}
        onConfirm={() => undefined}
        onClose={() => {
          closed = true
        }}
      />,
      { width: 80, height: 20 },
    )
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "unsaved-changes-exit-modal")
    await key("ESCAPE")
    expect(closed).toBe(true)
  })

  test("guards application exit while an HTTP draft is dirty", async () => {
    const previousOnlyTab = process.env.TUIMINAL_ONLY_TAB
    process.env.TUIMINAL_ONLY_TAB = "http"
    try {
      tui = await testRender(<App />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await act(async () => {
        tui?.mockInput.typeText("example.test")
        await Bun.sleep(10)
        await tui?.renderOnce()
      })
      await key("ESCAPE")
      expect(tui.renderer.currentFocusedRenderable?.id).toBeUndefined()
      await key("q")
      await settle(
        () =>
          tui?.renderer.isDestroyed === true ||
          ((tui?.captureCharFrame().includes("SAIR COM ALTERAÇÕES") ?? false) &&
            tui?.renderer.currentFocusedRenderable?.id === "unsaved-changes-exit-modal"),
      )
      expect(tui.renderer.isDestroyed).toBe(false)
      expect(tui.captureCharFrame()).toContain("[Q] Sair sem salvar")
      await key("ESCAPE")
      await settle(() => !(tui?.captureCharFrame().includes("SAIR COM ALTERAÇÕES") ?? true))
    } finally {
      if (previousOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
      else process.env.TUIMINAL_ONLY_TAB = previousOnlyTab
    }
  })

  test("keeps document editing mounted across tabs and responsive layouts", async () => {
    for (const layout of ["framed", "compact"] as const) {
      updateUiSettings({ layout, language: "pt-BR" })
      tui = await testRender(<HttpClient active />, { width: 160, height: 40 })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      expect(tui.captureCharFrame()).toContain("REQUISIÇÃO")
      expect(tui.captureCharFrame()).toContain("RESPOSTA")
      expect(tui.captureCharFrame()).toContain("SCRATCH")

      await key("ESCAPE")
      await key("n", true)
      await settle(() => tui?.captureCharFrame().match(/GET Scratch/g)?.length === 4)
      expect(tui.captureCharFrame().match(/GET Scratch/g)).toHaveLength(4)
      await key("ESCAPE")
      await settle(() => true)
      const activePane = tui.renderer.root.findDescendantById("http-request-pane-http-scratch-2")
      const headers = activePane?.findDescendantById("http-request-view-headers")
      if (!headers) throw new Error("Missing Headers tab on the active document")
      await act(async () => tui?.mockMouse.click(headers.screenX + 1, headers.screenY))
      await settle(() => tui?.captureCharFrame().includes("[Enter] Tabela") ?? false)
      await enter()
      await settle(
        () =>
          tui?.renderer.currentFocusedRenderable?.id ===
          "http-key-value-section-http-scratch-2-header",
      )
      await enter()
      await settle(() =>
        (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-name-"),
      )
      const focusedEditor = tui.renderer.currentFocusedRenderable

      for (const [width, height] of [
        [120, 30],
        [96, 24],
        [80, 24],
        [72, 18],
        [60, 16],
        [72, 18],
        [96, 24],
        [160, 40],
      ] as const) {
        act(() => tui?.resize(width, height))
        await tui.renderOnce()
        expect(tui.captureCharFrame()).not.toContain("undefined")
        expect(tui.renderer.currentFocusedRenderable).toBe(focusedEditor)
      }
      act(() => tui?.renderer.destroy())
      tui = undefined
    }
  })

  test("keeps primary actions and content inside the required visual matrix", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const matrixPath = resolve(root, "http-visual-matrix.http")
    const requests = [
      ["顧客一覧を読み込む", "matrix-one"],
      ["Crear usuario con nombre largo", "matrix-two"],
      ["상세 응답 헤더 검사", "matrix-three"],
      ["深い JSON 応答", "matrix-four"],
      ["Falha de autenticação", "matrix-five"],
    ] as const
    await writeFile(
      matrixPath,
      requests
        .map(
          ([title, name], index) =>
            `### ${title}\n# @name ${name}\nGET https://example.test/api/very/long/path/${index}?include=profile,permissions,teams&language=日本語\n`,
        )
        .join("\n"),
    )
    const sizes = [
      [60, 16],
      [72, 18],
      [80, 24],
      [96, 24],
      [120, 30],
      [160, 40],
    ] as const
    const languages: LanguageId[] = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"]
    const layouts: LayoutMode[] = ["framed", "compact"]
    try {
      for (const layoutMode of layouts) {
        for (const [index, [width, height]] of sizes.entries()) {
          updateUiSettings({ layout: layoutMode, language: languages[index]! })
          tui = await testRender(
            <HttpClient
              active
              initialUrlRequest={{
                id: index + 1,
                url: "https://example.test/api/very/long/path?include=profile&language=日本語",
              }}
            />,
            { width, height },
          )
          await openLocalHttp(tui)
          await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
          const frame = tui.captureCharFrame()
          expect(frame).not.toContain("undefined")
          expect(frame).not.toContain("NaN")
          for (const line of frame.split("\n"))
            expect(displayWidth(line)).toBeLessThanOrEqual(width)

          for (const id of [
            "http-url-input",
            "http-environment-button",
            "http-send-button",
            "http-save-button",
            "http-action-palette-open",
          ]) {
            const target = tui.renderer.root.findDescendantById(id)
            expect(target, `${id} ausente em ${width}x${height} ${layoutMode}`).toBeDefined()
            expect(
              target?.screenX ?? -1,
              `${id} começa fora de ${width}x${height} ${layoutMode}`,
            ).toBeGreaterThanOrEqual(0)
            expect(
              (target?.screenX ?? width) + (target?.width ?? 1),
              `${id} termina fora de ${width}x${height} ${layoutMode}`,
            ).toBeLessThanOrEqual(width)
            expect(
              target?.screenY ?? -1,
              `${id} começa fora de ${width}x${height} ${layoutMode}`,
            ).toBeGreaterThanOrEqual(0)
            expect(
              (target?.screenY ?? height) + (target?.height ?? 1),
              `${id} termina fora de ${width}x${height} ${layoutMode}`,
            ).toBeLessThanOrEqual(height)
          }

          if (width === 120) {
            const navigation = tui.renderer.root.findDescendantById("http-navigation-pane")
            const footer = tui.renderer.root.findDescendantById("http-workspace-footer")
            expect(navigation).toBeDefined()
            expect(footer).toBeDefined()
            for (const id of [
              "http-navigation-collection",
              "http-navigation-environments",
              "http-collection-workspace-heading",
              "http-collection-search-button",
            ]) {
              const target = tui.renderer.root.findDescendantById(id)
              expect(target, `${id} ausente em ${layoutMode}`).toBeDefined()
              expect((target?.screenX ?? 0) + (target?.width ?? 0)).toBeLessThanOrEqual(
                (navigation?.screenX ?? 0) + (navigation?.width ?? 0),
              )
            }
            for (const id of [
              "http-workspace-footer-copy",
              "http-split-decrease",
              "http-split-increase",
              "http-maximize-button",
              "http-jump-button",
              "http-save-button",
              "http-action-palette-open",
            ]) {
              const target = tui.renderer.root.findDescendantById(id)
              expect(target, `${id} ausente em ${layoutMode}`).toBeDefined()
              expect((target?.screenX ?? 0) + (target?.width ?? 0)).toBeLessThanOrEqual(
                (footer?.screenX ?? 0) + (footer?.width ?? 0),
              )
            }
          }

          const resolved = resolveHttpWorkspaceLayout({
            terminalWidth: width,
            terminalHeight: height,
            appHeaderRows: layoutMode === "compact" ? 1 : 2,
            outerPadding: layoutMode === "compact" ? 0 : 1,
            spacing: layoutMode === "compact" ? 0 : 1,
          }).layout
          const requestSelector = tui.renderer.root.findDescendantById("http-pane-request")
          const responseSelector = tui.renderer.root.findDescendantById("http-pane-response")
          const collectionSelector = tui.renderer.root.findDescendantById("http-pane-collection")
          expect(Boolean(requestSelector)).toBe(resolved.mode === "minimum")
          expect(Boolean(responseSelector)).toBe(resolved.mode === "minimum")
          expect(Boolean(collectionSelector)).toBe(
            resolved.mode === "minimum" || resolved.mode === "focus",
          )
          if (resolved.mode === "minimum") {
            const requestFrame = frame
            await press("http-pane-response")
            await settle(() => tui?.captureCharFrame() !== requestFrame)
            await press("http-pane-request")
          }

          if (width === 160 && layoutMode === "framed") {
            await settle(() =>
              Boolean(
                tui?.renderer.root.findDescendantById(
                  "http-navigation-project-http-visual-matrix.http#matrix-one",
                ),
              ),
            )
            for (const [, name] of requests) {
              await press(`http-navigation-project-http-visual-matrix.http#${name}`)
            }
            expect(
              tui.renderer.root.findDescendantById("http-document-http-scratch-1"),
            ).toBeDefined()
            for (const [, name] of requests) {
              expect(
                tui.renderer.root.findDescendantById(
                  `http-document-http-visual-matrix.http#${name}`,
                ),
              ).toBeDefined()
            }
            expect(tui.renderer.listenerCount("selection")).toBeLessThanOrEqual(
              HTTP_RENDERER_LISTENER_BUDGET,
            )
            expect(tui.renderer.getMaxListeners()).toBeGreaterThanOrEqual(
              HTTP_RENDERER_LISTENER_BUDGET,
            )
            expect(tui.captureCharFrame()).toContain("深い JSON")
          }

          act(() => tui?.renderer.destroy())
          tui = undefined
        }
      }
    } finally {
      await unlink(matrixPath).catch(() => undefined)
    }
  }, 15_000)

  test.each(["framed", "compact"] as const)(
    "keeps the import modal border visible in %s layout",
    async (layout) => {
      updateUiSettings({ layout, language: "pt-BR" })
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await collectionAction("import-collection", true)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-import-source",
      )
      const modal = tui.renderer.root.findDescendantById(
        "http-collection-import-modal",
      ) as BoxRenderable
      expect(modal.border).toBe(true)
      expect(modal.borderStyle).toBe("rounded")
      expect(tui.captureCharFrame().split("\n")[modal.screenY]?.[modal.screenX]).toBe("╭")
    },
  )

  test("previews and applies a versioned Postman import through the collection UI", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const sourceDirectory = await mkdtemp(resolve(tmpdir(), "tuiminal-http-ui-source-"))
    const sourcePath = resolve(sourceDirectory, "postman-import-fixture.json")
    const outputDirectory = resolve(root, "imported")
    const fixture = await readFile(
      resolve(import.meta.dir, "../fixtures/http/import/postman-v2.1.json"),
      "utf8",
    )
    await writeFile(sourcePath, fixture)
    try {
      tui = await testRender(<HttpClientWithNotifications active />, { width: 160, height: 40 })
      await openLocalHttp(tui)
      await collectionAction("import-collection", true)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-import-source",
      )
      expect(tui.captureCharFrame()).toContain("SOLTE UM ARQUIVO AQUI")
      const dropZone = tui.renderer.root.findDescendantById("http-collection-import-drop-zone")
      expect(dropZone?.height).toBeGreaterThanOrEqual(10)
      expect(tui.renderer.root.findDescendantById("http-collection-import-format")).toBeUndefined()
      expect(tui.renderer.root.findDescendantById("http-collection-import-output")).toBeUndefined()
      await act(async () => {
        tui?.mockInput.typeText(sourcePath.slice(0, -5))
        await tui?.renderOnce()
      })
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-collection-import-suggestion-0")),
      )
      await key("TAB")
      await settle(
        () =>
          (
            tui?.renderer.root.findDescendantById(
              "http-collection-import-source",
            ) as InputRenderable
          )?.value === sourcePath,
      )
      await click("http-collection-import-apply")
      await settle(() => tui?.captureCharFrame().includes("IMPORTADOS 8") ?? false)
      const preview = tui.captureCharFrame()
      expect(preview).toContain("FORMATO DETECTADO  POSTMAN")
      expect(preview).toContain("IGNORADOS 2")
      expect(preview).toContain("postman-import-fixture.http")
      expect(preview).not.toContain("literal-password")
      expect(preview).not.toContain("literal-api-key")

      await click("http-collection-import-apply")
      await settle(
        () =>
          !(tui?.captureCharFrame().includes("IMPORTAR COLEÇÃO") ?? true) &&
          (tui?.captureCharFrame().includes("COLEÇÃO IMPORTADA") ?? false),
      )
      const outputPath = resolve(outputDirectory, "postman-import-fixture.http")
      const output = await readFile(outputPath, "utf8")
      expect(output).toContain("# @name users-get-structured")
      expect(output).toContain("{{postman_1_users_get_structured_basic_password}}")
      expect(output).not.toContain("literal-password")
    } finally {
      await rm(sourceDirectory, { recursive: true, force: true })
      await rm(outputDirectory, { recursive: true, force: true })
    }
  })

  test("detects OpenAPI YAML without selecting an import format", async () => {
    const sourceDirectory = await mkdtemp(resolve(tmpdir(), "tuiminal-http-openapi-source-"))
    const sourcePath = resolve(sourceDirectory, "schema.yaml")
    await writeFile(
      sourcePath,
      'openapi: 3.0.0\ninfo:\n  title: API\n  version: 1.0.0\npaths:\n  /ping:\n    get:\n      operationId: ping\n      responses:\n        "200":\n          description: OK\n',
    )
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await collectionAction("import-collection", true)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-import-source",
      )
      await act(async () => {
        tui?.mockInput.typeText(sourcePath)
        await tui?.renderOnce()
      })
      await press("http-collection-import-apply")
      await settle(() => tui?.captureCharFrame().includes("FORMATO DETECTADO  OPENAPI") ?? false)
      expect(tui.captureCharFrame()).toContain("IMPORTADOS 1")
    } finally {
      await rm(sourceDirectory, { recursive: true, force: true })
    }
  })

  test("keeps the import path, drop area and action visible in a short terminal", async () => {
    tui = await testRender(<HttpClient active />, { width: 56, height: 18 })
    await openLocalHttp(tui)
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-navigation-collection")))
    await press("http-navigation-collection")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-pane-collection")))
    await collectionAction("import-collection", true)
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-collection-import-modal")),
    )
    const modal = tui.renderer.root.findDescendantById("http-collection-import-modal")
    const source = tui.renderer.root.findDescendantById("http-collection-import-source")
    const dropZone = tui.renderer.root.findDescendantById("http-collection-import-drop-zone")
    const apply = tui.renderer.root.findDescendantById("http-collection-import-apply")
    if (!modal || !source || !dropZone || !apply) throw new Error("Import modal is incomplete")
    expect(dropZone.height).toBeGreaterThanOrEqual(4)
    expect(dropZone.screenY + dropZone.height).toBeLessThanOrEqual(apply.screenY)
    expect(apply.screenY).toBeLessThan(modal.screenY + modal.height)
  })

  test("fills the import source when a file path is dropped into the terminal", async () => {
    const sourceDirectory = await mkdtemp(resolve(tmpdir(), "tuiminal-http-drop-source-"))
    const sourcePath = resolve(sourceDirectory, "collection with spaces.json")
    await writeFile(sourcePath, "{}")
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await collectionAction("import-collection", true)
      await click("http-collection-import-drop-zone")
      await act(async () => {
        await tui?.mockInput.pasteBracketedText(pathToFileURL(sourcePath).href)
        await tui?.renderOnce()
      })
      await settle(
        () =>
          (
            tui?.renderer.root.findDescendantById(
              "http-collection-import-source",
            ) as InputRenderable
          )?.value === sourcePath,
      )
    } finally {
      await rm(sourceDirectory, { recursive: true, force: true })
    }
  })

  test("opens the action palette and keeps legacy jump navigation", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await press("http-action-palette-open")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-action-palette")))
    expect(tui.captureCharFrame()).toContain("Escolher box")
    await key("ESCAPE")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    expect(tui.renderer.root.findDescendantById("http-action-palette")).toBeUndefined()
    await key("ESCAPE")
    await key("o", true)
    await settle(() => tui?.captureCharFrame().includes("IR PARA") ?? false)
    await key("r")
    await settle(() => !(tui?.captureCharFrame().includes("IR PARA") ?? true))
    expect(tui.captureCharFrame()).toContain("SEM RESPOSTA")
  })

  test.each([0, 10])(
    "resizes the request/response split with a real mouse drag (%i ms)",
    async (delayMs) => {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await openLocalHttp(tui)
      await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-split-handle")))
      const request = tui.renderer.root.findDescendantById("http-request-pane-http-scratch-1")
      const response = tui.renderer.root.findDescendantById("http-response-pane-http-scratch-1")
      const handle = tui.renderer.root.findDescendantById("http-split-handle")
      if (!request || !response || !handle) throw new Error("Split HTTP não renderizado")
      expect(Math.abs(request.height - response.height)).toBeLessThanOrEqual(1)
      const initialHeight = request.height
      await act(async () => {
        await tui?.mockMouse.drag(
          handle.screenX + Math.floor(handle.width / 2),
          handle.screenY,
          handle.screenX + Math.floor(handle.width / 2),
          handle.screenY + 3,
          undefined,
          { delayMs },
        )
        await tui?.renderOnce()
      })
      await settle(
        () =>
          (tui?.renderer.root.findDescendantById("http-request-pane-http-scratch-1")?.height ?? 0) >
          initialHeight,
      )
      expect(
        tui.renderer.root.findDescendantById("http-request-pane-http-scratch-1")?.height,
      ).toBeGreaterThan(initialHeight)
    },
  )

  test("toggles cookie jar use and exposes it in the prepared preview", async () => {
    tui = await testRender(
      <HttpClient active initialUrlRequest={{ id: 1, url: "http://localhost:3000/api" }} />,
      { width: 120, height: 30 },
    )
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("ESCAPE")
    await key("a")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-request-cookie-jar")))
    await press("http-request-cookie-jar")
    await settle(() => tui?.captureCharFrame().includes("ignorar") ?? false)
    await press("http-request-more-preview")
    await key("F10")
    await settle(() => tui?.captureCharFrame().includes("COOKIE JAR") ?? false)
    expect(tui.captureCharFrame()).toContain("ignorar")
  })

  test("edits an explicit proxy and exposes the prepared route", async () => {
    tui = await testRender(
      <HttpClient active initialUrlRequest={{ id: 1, url: "https://example.test/api" }} />,
      { width: 120, height: 30 },
    )
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("ESCAPE")
    await key("a")
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-request-proxy-http-scratch-1")),
    )
    await focus("http-request-proxy-http-scratch-1")
    await act(async () => {
      tui?.mockInput.typeText("proxy.test:8080")
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    await key("ESCAPE")
    await press("http-request-more-preview")
    await key("F10")
    await settle(() => tui?.captureCharFrame().includes("http://proxy.test:8080/") ?? false)
    expect(tui.captureCharFrame()).toContain("PROXY")
  })

  test("confirms insecure TLS for the current target before transport", async () => {
    tui = await testRender(
      <HttpClient active initialUrlRequest={{ id: 1, url: "https://127.0.0.1:1/private" }} />,
      { width: 120, height: 30 },
    )
    await openLocalHttp(tui)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("ESCAPE")
    await key("a")
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-request-tls-verification")),
    )
    await press("http-request-tls-verification")
    await settle(() => tui?.captureCharFrame().includes("TLS INSEGURO") ?? false)
    await press("http-send-button")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-insecure-tls-modal")))

    const frame = tui.captureCharFrame()
    expect(frame).toContain("CONFIRMAR TLS INSEGURO")
    expect(frame).toContain("https://127.0.0.1:1")
    expect(frame).toContain("[I] Autorizar nesta sessão")
    await key("ESCAPE")
    expect(tui.renderer.root.findDescendantById("http-insecure-tls-modal")).toBeUndefined()
  })

  describe("execution", () => {
    let server: Server
    let url = ""
    let receivedUrl = ""
    let continuousClosed = false

    beforeEach(async () => {
      server = createServer((request, response) => {
        receivedUrl = request.url ?? ""
        if (request.url === "/continuous") {
          response.writeHead(200, { "content-type": "text/plain" })
          const chunk = `${"0123456789abcdef".repeat(4)}\n`.repeat(1_000)
          continuousClosed = false
          let scheduled: ReturnType<typeof setImmediate> | undefined
          const send = () => {
            if (continuousClosed) return
            if (response.write(chunk)) scheduled = setImmediate(send)
            else
              response.once("drain", () => {
                scheduled = setImmediate(send)
              })
          }
          // Bun 1.3.14 emits socket close when the client cancels, but does not
          // reliably emit ServerResponse.close. Stop the exact fixture producer.
          request.socket.once("close", () => {
            continuousClosed = true
            clearImmediate(scheduled)
          })
          send()
          return
        }
        if (request.url === "/nested") {
          response.writeHead(200, { "content-type": "application/json" })
          response.end('{"user":{"profile":{"name":"Ada"}},"tags":["one","two"]}')
          return
        }
        if (request.url === "/large-json") {
          response.writeHead(200, { "content-type": "application/json" })
          response.end(
            JSON.stringify({
              items: Array.from({ length: 700 }, (_, index) => ({
                id: index,
                name: `item-${index}`,
                active: true,
              })),
            }),
          )
          return
        }
        response.writeHead(200, { "content-type": "application/json" })
        response.end('{"answer":42}')
      })
      server.listen(0, "127.0.0.1")
      await new Promise<void>((resolve) => server.once("listening", resolve))
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/answer`
    })

    afterEach(async () => {
      server.closeAllConnections()
      if (server.listening) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
      }
    })

    test("sends from the omnibar and renders the real response", async () => {
      tui = await testRender(<HttpClient active initialUrlRequest={{ id: 1, url }} />, {
        width: 120,
        height: 32,
      })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      act(() => tui?.mockInput.pressEnter())
      await settle(() => tui?.captureCharFrame().includes('"answer": 42') ?? false)
      const frame = tui.captureCharFrame()
      expect(frame).toContain("200 OK")
      expect(frame).toContain('"answer": 42')

      await settle(() =>
        (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-response-scroll-"),
      )
      await key("f", true)
      await settle(() =>
        (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-response-search-"),
      )
      await act(async () => tui?.mockInput.typeText("answer"))
      await settle(() => tui?.captureCharFrame().includes("1/1") ?? false)
      expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-response-search-http-scratch-1")
      expect(tui.captureCharFrame()).toContain("[Enter] Próximo")
      await key("ESCAPE")
      await settle(() => !(tui?.captureCharFrame().includes("[Enter] Próximo") ?? true))
      expect(tui.captureCharFrame()).not.toContain("[Enter] Próximo")
    })

    test("navigates, collapses, and expands formatted JSON blocks", async () => {
      const nestedUrl = `${new URL(url).origin}/nested`
      tui = await testRender(<HttpClient active initialUrlRequest={{ id: 1, url: nestedUrl }} />, {
        width: 120,
        height: 32,
      })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      act(() => tui?.mockInput.pressEnter())
      await settle(() => tui?.captureCharFrame().includes('▾   "user": {') ?? false)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-response-scroll-http-scratch-1",
      )
      expect(tui.captureCharFrame()).toContain('"name": "Ada"')
      expect(tui.captureCharFrame()).not.toContain("  Wrap  ")

      const jsonDocument = tui.renderer.root.findDescendantById("http-response-json-http-scratch-1")
      const initialContent = (jsonDocument as { content?: unknown } | undefined)?.content

      await key("ARROW_DOWN")
      await settle(() => tui?.captureCharFrame().includes("JSON 2/4") ?? false)
      const selection = tui.renderer.root.findDescendantById(
        "http-response-json-selection-http-scratch-1",
      )
      if (!selection) throw new Error("JSON selection is not visible")
      const selectedSpan = tui
        .captureSpans()
        .lines[selection.screenY]?.spans.find((span) => span.text.includes('"user"'))
      expect(selectedSpan?.bg.toInts()).toEqual(RGBA.fromHex(COLORS.http).toInts())
      await act(async () => {
        await tui?.mockMouse.click(selection.screenX + 8, selection.screenY + 1)
        await tui?.renderOnce()
      })
      await settle(() => tui?.captureCharFrame().includes("JSON 3/4  /user/profile") ?? false)
      await key("ARROW_UP")
      await settle(() => tui?.captureCharFrame().includes("JSON 2/4  /user") ?? false)
      expect(
        (
          tui.renderer.root.findDescendantById("http-response-json-http-scratch-1") as
            | { content?: unknown }
            | undefined
        )?.content,
      ).toBe(initialContent)
      await key("ARROW_LEFT")
      await settle(() => tui?.captureCharFrame().includes('▸   "user": {… 1},') ?? false)
      expect(tui.captureCharFrame()).not.toContain('"name": "Ada"')

      await key("ARROW_RIGHT")
      await settle(() => tui?.captureCharFrame().includes('"name": "Ada"') ?? false)
      await key("RETURN")
      await settle(() => tui?.captureCharFrame().includes('▸   "user": {… 1},') ?? false)
    })

    test("keeps the large JSON document mounted while navigating structural rows", async () => {
      const largeUrl = `${new URL(url).origin}/large-json`
      tui = await testRender(<HttpClient active initialUrlRequest={{ id: 1, url: largeUrl }} />, {
        width: 120,
        height: 32,
      })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      act(() => tui?.mockInput.pressEnter())
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-response-json-http-scratch-1")),
      )
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-response-scroll-http-scratch-1",
      )
      const rendered = tui.renderer.root.findDescendantById(
        "http-response-json-http-scratch-1",
      ) as { content?: unknown }
      const originalContent = rendered.content
      for (let index = 0; index < 12; index += 1) await key("ARROW_DOWN")
      await settle(() => /JSON 13\/702  \/items\/\d+/.test(tui?.captureCharFrame() ?? ""))
      const selection = tui.renderer.root.findDescendantById(
        "http-response-json-selection-http-scratch-1",
      )
      const scroll = tui.renderer.root.findDescendantById(
        "http-response-scroll-http-scratch-1",
      ) as ScrollBoxRenderable
      if (!selection) throw new Error("JSON selection is not visible")
      expect(selection.screenY).toBeGreaterThanOrEqual(scroll.viewport.screenY)
      expect(selection.screenY).toBeLessThan(scroll.viewport.screenY + scroll.viewport.height)
      expect(
        tui
          .captureSpans()
          .lines[selection.screenY]?.spans.some(
            (span) =>
              JSON.stringify(span.bg.toInts()) ===
              JSON.stringify(RGBA.fromHex(COLORS.http).toInts()),
          ),
      ).toBe(true)
      expect(
        (
          tui.renderer.root.findDescendantById("http-response-json-http-scratch-1") as {
            content?: unknown
          }
        ).content,
      ).toBe(originalContent)
    }, 15_000)

    test("submits the freshly pasted URL when Enter follows in the same input batch", async () => {
      const origin = new URL(url).origin
      tui = await testRender(<HttpClient active />, { width: 120, height: 32 })
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")

      await act(async () => {
        await tui?.mockInput.pasteBracketedText(`${origin}/pasted`)
        tui?.mockInput.pressEnter()
      })

      await settle(() => receivedUrl === "/pasted")
      expect(receivedUrl).toBe("/pasted")
      await settle(() => tui?.captureCharFrame().includes("200 OK") ?? false)
      expect(tui.captureCharFrame()).toContain("200 OK")
    })

    test("keeps a continuous response bounded and the response pane interactive", async () => {
      const continuousUrl = `${new URL(url).origin}/continuous`
      tui = await testRender(
        <HttpClient active initialUrlRequest={{ id: 1, url: continuousUrl }} />,
        { width: 120, height: 32 },
      )
      await openLocalHttp(tui)
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await press("http-send-button")
      await settle(() => tui?.captureCharFrame().includes("TRUNCADO") ?? false)
      // Socket retirement is an I/O condition. Repainting a 1.5 MB response on
      // every poll can delay that event and exhaust the TUI test's deadline.
      const deadline = performance.now() + 2_000
      while (!continuousClosed && performance.now() < deadline) await Bun.sleep(10)
      expect(continuousClosed).toBe(true)
      await key("2")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-response-scroll-http-scratch-1",
      )
      await key("F10")
      expect(tui.captureCharFrame()).toContain("TRUNCADO")
      await key("j")
      expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-response-scroll-http-scratch-1")
    }, 15_000)
  })
})
