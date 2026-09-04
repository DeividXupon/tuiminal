import "./setup"
import { afterEach, afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { readFile, stat, unlink, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { act } from "react"
import { HttpClient } from "../../src/features/http/HttpWorkspace"
import { App } from "../../src/app/App"
import { UnsavedChangesExitModal } from "../../src/app/ui/UnsavedChangesExitModal"
import { HttpExternalConflictModal } from "../../src/features/http/ui/HttpExternalConflictModal"

let tui: TestRendererSetup | undefined

async function settle(until: () => boolean) {
  if (!tui) throw new Error("TUI HTTP não montada")
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(`TUI HTTP não estabilizou:\n${tui.captureCharFrame()}`)
}

async function key(name: string, ctrl = false) {
  await act(async () => {
    tui?.mockInput.pressKey(name, { ctrl })
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
})

describe("HTTP TUI", () => {
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
      await settle(() => tui?.captureCharFrame().includes("MODIFICADO") ?? false)
      await key("ESCAPE")
      await key("q")
      await settle(
        () =>
          (tui?.captureCharFrame().includes("SAIR COM ALTERAÇÕES") ?? false) &&
          tui?.renderer.currentFocusedRenderable?.id === "unsaved-changes-exit-modal",
      )
      expect(tui.captureCharFrame()).toContain("[Q] Sair sem salvar")
      await key("ESCAPE")
      await settle(() => !(tui?.captureCharFrame().includes("SAIR COM ALTERAÇÕES") ?? true))
    } finally {
      if (previousOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
      else process.env.TUIMINAL_ONLY_TAB = previousOnlyTab
    }
  })

  test("keeps document editing mounted across tabs and responsive layouts", async () => {
    tui = await testRender(<HttpClient active />, { width: 160, height: 36 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    expect(tui.captureCharFrame()).toContain("REQUISIÇÃO")
    expect(tui.captureCharFrame()).toContain("RESPOSTA")
    expect(tui.captureCharFrame()).toContain("SCRATCH")

    await key("ESCAPE")
    await key("n", true)
    expect(tui.captureCharFrame().match(/GET Scratch/g)).toHaveLength(4)
    await key("ESCAPE")
    await key("h")
    await settle(() =>
      (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("http-key-value-name-"),
    )
    const focusedEditor = tui.renderer.currentFocusedRenderable

    act(() => tui?.resize(68, 20))
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain("[1] Requisição")
    expect(tui.captureCharFrame()).toContain("[2] Resposta")
    expect(tui.renderer.currentFocusedRenderable).toBe(focusedEditor)
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
    await key("h")
    expect(tui.captureCharFrame()).not.toContain("IR PARA")
    expect(tui.captureCharFrame()).toContain("HEADERS")
  })

  describe("execution", () => {
    let server: Server
    let url = ""

    beforeAll(async () => {
      server = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" })
        response.end('{"answer":42}')
      })
      server.listen(0, "127.0.0.1")
      await new Promise<void>((resolve) => server.once("listening", resolve))
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/answer`
    })

    afterAll(async () => {
      if (server.listening) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
      }
      server.closeAllConnections()
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
  })
})
