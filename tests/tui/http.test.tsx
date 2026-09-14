import "./setup"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { RGBA, type BoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { mkdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { act } from "react"
import {
  COLORS,
  getUiSettings,
  type LayoutMode,
  updateUiSettings,
} from "../../packages/core/src/settings/theme"
import { HttpClient } from "../../packages/feature-http/src/HttpWorkspace"
import { HTTP_TUTORIAL_STEPS } from "../../packages/feature-http/src"
import { App } from "../../apps/cli/src/App"
import { UnsavedChangesExitModal } from "../../apps/cli/src/ui/UnsavedChangesExitModal"
import { HttpExternalConflictModal } from "../../packages/feature-http/src/ui/HttpExternalConflictModal"
import { resolveHttpWorkspaceLayout } from "../../packages/feature-http/src/model/layout"
import { HTTP_RENDERER_LISTENER_BUDGET } from "../../packages/feature-http/src/model/renderer-listener-budget"
import { displayWidth, type LanguageId } from "../../packages/core/src/i18n"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()

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

async function click(id: string) {
  if (!tui) throw new Error("TUI HTTP não montada")
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
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

describe("HTTP TUI", () => {
  test("keeps a fresh Scratch saved when its URL input receives focus", async () => {
    const dirtyStates: boolean[] = []
    tui = await testRender(
      <HttpClient active onUnsavedChangesChange={(dirty) => dirtyStates.push(dirty)} />,
      { width: 120, height: 30 },
    )
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

  test("shows contextual request arrows and cycles all five request views", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
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
      () => tui?.captureCharFrame().includes("Nenhuma autenticação configurada.") ?? false,
    )
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

  test("navigates Params vertically, adds only to the focused subpanel, and cycles nested strips", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("TAB")
    await key("TAB")

    expect(
      Boolean(tui.renderer.root.findDescendantById("http-key-value-add-http-scratch-1-query")),
    ).toBe(true)
    expect(
      Boolean(tui.renderer.root.findDescendantById("http-key-value-add-http-scratch-1-path")),
    ).toBe(false)

    await key("j")
    await settle(
      () =>
        !tui?.renderer.root.findDescendantById("http-key-value-add-http-scratch-1-query") &&
        Boolean(tui?.renderer.root.findDescendantById("http-key-value-add-http-scratch-1-path")),
    )
    expect(
      Boolean(tui.renderer.root.findDescendantById("http-key-value-add-http-scratch-1-query")),
    ).toBe(false)
    expect(
      Boolean(tui.renderer.root.findDescendantById("http-key-value-add-http-scratch-1-path")),
    ).toBe(true)
    expect(tui.captureCharFrame().match(/Nenhum item definido\./g)?.length).toBe(2)

    await key("n")
    await settle(() => tui?.captureCharFrame().match(/Nenhum item definido\./g)?.length === 1)
    expect(tui.captureCharFrame().match(/Nenhum item definido\./g)?.length).toBe(1)

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
    expect(tui.renderer.root.findDescendantById("http-request-more-next")).toBeDefined()
    await key("v")
    await settle(() => tui?.captureCharFrame().includes("ASSERTIONS DO REQUEST") ?? false)
    expect(tui.renderer.root.findDescendantById("http-assertion-add")).toBeDefined()
    await key("l")
    await settle(() => !tui?.renderer.root.findDescendantById("http-assertion-add"))
  })

  test("opens opaque .http blocks as exact read-only raw content", async () => {
    const path = resolve(process.env.TUIMINAL_WORKDIR ?? "", "opaque-ui.http")
    const source = "### Opaque UI\n# @name opaque-ui\nGET x.test > h.js\n"
    await writeFile(path, source)
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
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
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
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

  test("creates and selects a masked private environment from the empty state", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const privatePath = resolve(root, "http-client.private.env.json")
    const gitignorePath = resolve(root, ".gitignore")
    await Promise.all([
      unlink(privatePath).catch(() => undefined),
      unlink(gitignorePath).catch(() => undefined),
    ])
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await press("http-environment-button")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-choice-none",
      )
      await press("http-environment-new-private")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-create-name",
      )
      await press("http-environment-keychain")
      await settle(() => tui?.captureCharFrame().includes("referência opaca ao keychain") ?? false)
      await press("http-environment-keychain")
      await settle(() => tui?.captureCharFrame().includes("arquivo privado protegido") ?? false)
      await act(async () => tui?.mockInput.typeText("local"))
      await focus("http-environment-create-variable")
      await act(async () => tui?.mockInput.typeText("apiToken"))
      await focus("http-environment-create-secret")
      await act(async () => {
        tui?.mockInput.typeText("fixture-secret")
        await tui?.renderOnce()
      })
      expect(tui.captureCharFrame()).not.toContain("fixture-secret")
      await press("http-environment-create-save")
      await settle(
        () =>
          !(tui?.captureCharFrame().includes("AMBIENTES HTTP") ?? true) &&
          (tui?.captureCharFrame().includes("[E] local") ?? false),
      )
      expect(JSON.parse(await readFile(privatePath, "utf8"))).toEqual({
        local: { apiToken: "fixture-secret" },
      })
      expect((await stat(privatePath)).mode & 0o777).toBe(0o600)
      expect(await readFile(gitignorePath, "utf8")).toContain("http-client.private.env.json")
    } finally {
      await Promise.all([
        unlink(privatePath).catch(() => undefined),
        unlink(gitignorePath).catch(() => undefined),
      ])
    }
  })

  test("scopes environments and private creation to the active request directory", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const scopeRoot = resolve(root, "scoped-environment")
    const requestDirectory = resolve(scopeRoot, "api")
    const siblingDirectory = resolve(scopeRoot, "sibling")
    const requestPath = resolve(requestDirectory, "requests.http")
    const privatePath = resolve(requestDirectory, "http-client.private.env.json")
    await mkdir(requestDirectory, { recursive: true })
    await mkdir(siblingDirectory, { recursive: true })
    await writeFile(requestPath, "### Scoped\n# @name scoped\nGET https://example.test/scoped\n")
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
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-environment-choice-dev")),
      )
      const listFrame = tui.captureCharFrame()
      expect(listFrame).toContain("dev")
      expect(listFrame).toContain("scoped-environment/api")
      expect(listFrame).toContain("parent-only")
      expect(listFrame).not.toContain("sibling-only")

      await press("http-environment-new-private")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-create-name",
      )
      expect(tui.captureCharFrame()).toContain(
        "ARQUIVO  scoped-environment/api/http-client.private.env.json",
      )
      await press("http-environment-gitignore")
      await act(async () => tui?.mockInput.typeText("created-local"))
      await focus("http-environment-create-variable")
      await act(async () => tui?.mockInput.typeText("apiToken"))
      await focus("http-environment-create-secret")
      await act(async () => {
        tui?.mockInput.typeText("nested-ui-secret")
        await tui?.renderOnce()
      })
      expect(tui.captureCharFrame()).not.toContain("nested-ui-secret")
      await press("http-environment-create-save")
      await settle(
        () =>
          !(tui?.captureCharFrame().includes("AMBIENTES HTTP") ?? true) &&
          (tui?.captureCharFrame().includes("[E] created-local") ?? false),
      )
      expect(JSON.parse(await readFile(privatePath, "utf8"))).toEqual({
        "created-local": { apiToken: "nested-ui-secret" },
      })
      expect((await stat(privatePath)).mode & 0o777).toBe(0o600)
    } finally {
      await rm(scopeRoot, { recursive: true, force: true })
    }
  })

  test("edits and persists non-secret HTTP workspace defaults", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const configPath = resolve(root, ".tuiminal/http/config.json")
    await unlink(configPath).catch(() => undefined)
    try {
      tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await press("http-environment-button")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-choice-none",
      )
      await press("http-environment-workspace-settings")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-workspace-settings-modal",
      )
      expect(tui.captureCharFrame()).toContain("DEFAULTS DO WORKSPACE HTTP")
      expect(tui.captureCharFrame()).toContain("Nenhum item definido.")
      await key("n")
      await settle(() => !(tui?.captureCharFrame().includes("Nenhum item definido.") ?? true))
      await press("http-workspace-default-timeout")
      await settle(() => tui?.captureCharFrame().includes("[T] Timeout: 5s") ?? false)
      await press("http-workspace-history-metadata")
      await settle(() => tui?.captureCharFrame().includes("[M] ◆ Histórico persistente") ?? false)
      await press("http-workspace-settings-save")
      await settle(() => !(tui?.captureCharFrame().includes("DEFAULTS DO WORKSPACE HTTP") ?? true))
      expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
        version: 1,
        headers: {},
        options: { timeoutMs: 5_000 },
        history: { persistMetadata: true, persistBodies: false },
      })
      expect((await stat(configPath)).mode & 0o777).toBe(0o600)
    } finally {
      await unlink(configPath).catch(() => undefined)
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
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      expect(tui.captureCharFrame()).toContain("REQUISIÇÃO")
      expect(tui.captureCharFrame()).toContain("RESPOSTA")
      expect(tui.captureCharFrame()).toContain("SCRATCH")

      await key("ESCAPE")
      await key("n", true)
      expect(tui.captureCharFrame().match(/GET Scratch/g)).toHaveLength(4)
      await key("ESCAPE")
      await press("http-request-view-headers")
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
            "http-help-button",
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
              "http-navigation-history",
              "http-collection-import-button",
              "http-collection-runner-button",
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
              "http-help-button",
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
  })

  test("previews and applies a versioned Postman import through the collection UI", async () => {
    const root = process.env.TUIMINAL_WORKDIR ?? ""
    const sourcePath = resolve(root, "postman-import-fixture.json")
    const outputDirectory = resolve(root, ".tuiminal/http/imported")
    const fixture = await readFile(
      resolve(import.meta.dir, "../fixtures/http/import/postman-v2.1.json"),
      "utf8",
    )
    await writeFile(sourcePath, fixture)
    try {
      tui = await testRender(<HttpClient active />, { width: 160, height: 40 })
      await settle(() =>
        Boolean(tui?.renderer.root.findDescendantById("http-collection-import-button")),
      )
      await click("http-collection-import-button")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-import-source",
      )
      await act(async () => {
        tui?.mockInput.typeText("postman-import-fixture.json")
        await tui?.renderOnce()
      })
      await click("http-collection-import-apply")
      await settle(() => tui?.captureCharFrame().includes("IMPORTADOS 8") ?? false)
      const preview = tui.captureCharFrame()
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
      await unlink(sourcePath).catch(() => undefined)
      await rm(outputDirectory, { recursive: true, force: true })
    }
  })

  test("opens contextual help and jump mode as one keyboard layer", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await press("http-help-button")
    await settle(() => tui?.captureCharFrame().includes("AJUDA HTTP") ?? false)
    expect(tui.captureCharFrame()).toContain("AJUDA HTTP")
    expect(tui.captureCharFrame()).toContain("ATALHOS DO CONTEXTO ATUAL")
    await key("ESCAPE")
    expect(tui.captureCharFrame()).not.toContain("AJUDA HTTP")

    await press("http-jump-button")
    await settle(() => tui?.captureCharFrame().includes("IR PARA") ?? false)
    expect(tui.captureCharFrame()).toContain("IR PARA")
    expect(tui.renderer.root.findDescendantById("http-overlay-jump-headers")).toBeUndefined()
    await key("p")
    expect(tui.captureCharFrame()).toContain("IR PARA")
    await key("r")
    await settle(() => !(tui?.captureCharFrame().includes("IR PARA") ?? true))
    expect(tui.captureCharFrame()).toContain("SEM RESPOSTA")
  })

  test("resizes the request/response split with a real mouse drag", async () => {
    tui = await testRender(<HttpClient active />, { width: 120, height: 30 })
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
      )
      await tui?.renderOnce()
    })
    expect(
      tui.renderer.root.findDescendantById("http-request-pane-http-scratch-1")?.height,
    ).toBeGreaterThan(initialHeight)
  })

  test("toggles cookie jar use and exposes it in the prepared preview", async () => {
    tui = await testRender(
      <HttpClient active initialUrlRequest={{ id: 1, url: "http://localhost:3000/api" }} />,
      { width: 120, height: 30 },
    )
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("ESCAPE")
    await key("a")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-request-cookie-jar")))
    await key("c")
    await settle(() => tui?.captureCharFrame().includes("[C] Cookie jar: ignorar") ?? false)
    await key("z")
    await key("F10")
    await settle(() => tui?.captureCharFrame().includes("COOKIE JAR") ?? false)
    expect(tui.captureCharFrame()).toContain("ignorar")
  })

  test("edits an explicit proxy and exposes the prepared route", async () => {
    tui = await testRender(
      <HttpClient active initialUrlRequest={{ id: 1, url: "https://example.test/api" }} />,
      { width: 120, height: 30 },
    )
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
    await key("z")
    await key("F10")
    await settle(() => tui?.captureCharFrame().includes("http://proxy.test:8080/") ?? false)
    expect(tui.captureCharFrame()).toContain("PROXY")
  })

  test("confirms insecure TLS for the current target before transport", async () => {
    tui = await testRender(
      <HttpClient active initialUrlRequest={{ id: 1, url: "https://127.0.0.1:1/private" }} />,
      { width: 120, height: 30 },
    )
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await key("ESCAPE")
    await key("a")
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("http-request-tls-verification")),
    )
    await key("v", false, true)
    await settle(() => tui?.captureCharFrame().includes("[Shift+V] TLS INSEGURO") ?? false)
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

    beforeEach(async () => {
      server = createServer((request, response) => {
        receivedUrl = request.url ?? ""
        if (request.url === "/continuous") {
          response.writeHead(200, { "content-type": "text/plain" })
          const chunk = `${"0123456789abcdef".repeat(4)}\n`.repeat(1_000)
          const timer = setInterval(() => response.write(chunk), 1)
          response.on("close", () => clearInterval(timer))
          return
        }
        if (request.url === "/nested") {
          response.writeHead(200, { "content-type": "application/json" })
          response.end('{"user":{"profile":{"name":"Ada"}},"tags":["one","two"]}')
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
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      act(() => tui?.mockInput.pressEnter())
      await settle(() => tui?.captureCharFrame().includes('▾ "user": {') ?? false)
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-response-scroll-http-scratch-1",
      )
      expect(tui.captureCharFrame()).toContain('"name": "Ada"')

      await key("ARROW_DOWN")
      await key("ARROW_LEFT")
      await settle(() => tui?.captureCharFrame().includes('▸ "user": {… 1},') ?? false)
      expect(tui.captureCharFrame()).not.toContain('"name": "Ada"')

      await key("ARROW_RIGHT")
      await settle(() => tui?.captureCharFrame().includes('"name": "Ada"') ?? false)
      await key("RETURN")
      await settle(() => tui?.captureCharFrame().includes('▸ "user": {… 1},') ?? false)
    })

    test("submits the freshly pasted URL when Enter follows in the same input batch", async () => {
      const origin = new URL(url).origin
      tui = await testRender(<HttpClient active />, { width: 120, height: 32 })
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")

      await act(async () => {
        await tui?.mockInput.pasteBracketedText(`${origin}/pasted`)
        tui?.mockInput.pressEnter()
      })

      await settle(() => receivedUrl === "/pasted")
      expect(receivedUrl).toBe("/pasted")
      expect(tui.captureCharFrame()).toContain("200 OK")
    })

    test("keeps a continuous response bounded and the response pane interactive", async () => {
      const continuousUrl = `${new URL(url).origin}/continuous`
      tui = await testRender(
        <HttpClient active initialUrlRequest={{ id: 1, url: continuousUrl }} />,
        { width: 120, height: 32 },
      )
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
      await press("http-send-button")
      await settle(() => tui?.captureCharFrame().includes("TRUNCADO") ?? false)
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
