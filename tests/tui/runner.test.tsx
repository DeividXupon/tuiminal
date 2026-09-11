import "./setup"
import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { RGBA } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { Runner } from "../../src/features/runner/RunnerWorkspace"
import { RunnerSaveCommandModal } from "../../src/features/runner/ui/RunnerSaveCommandModal"
import { App } from "../../src/app/App"
import { getUiSettings, updateUiSettings } from "../../src/core/settings/theme"
import { BRAND_COLOR } from "../../src/shared/ui/brand"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()

async function settle(until: () => boolean) {
  if (!tui) throw new Error("TUI not mounted")
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => {
      await Bun.sleep(10)
    })
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(`TUI did not settle:\n${tui.captureCharFrame()}`)
}

async function key(name: string, ctrl = false, meta = false) {
  act(() => tui?.mockInput.pressKey(name, { ctrl, meta }))
  // A lone Escape waits for the terminal's escape-sequence disambiguation timer.
  await act(async () => {
    await Bun.sleep(60)
  })
  await tui?.renderOnce()
}

function colorOf(text: string) {
  const span = tui
    ?.captureSpans()
    .lines.flatMap((line) => line.spans)
    .find((candidate) => candidate.text.includes(text))
  if (!span) throw new Error(`Trecho colorido ausente: ${text}\n${tui?.captureCharFrame()}`)
  return span.fg.toInts()
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

describe("Runner TUI behavior", () => {
  test("normal startup opens Runner with Alt+number global shortcuts", async () => {
    const initialTab = process.env.TUIMINAL_INITIAL_TAB
    const onlyTab = process.env.TUIMINAL_ONLY_TAB
    try {
      delete process.env.TUIMINAL_INITIAL_TAB
      delete process.env.TUIMINAL_ONLY_TAB
      tui = await testRender(<App />, { width: 180, height: 36 })
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "runner-command-list")
      const frame = tui.captureCharFrame()
      expect(frame).toContain("◆ Runner [Alt+3]")
      for (const shortcut of ["[Alt+1]", "[Alt+2]", "[Alt+4]", "[Alt+5]"]) {
        expect(frame).toContain(shortcut)
      }
      expect(frame).toContain("[N] EXECUTAR EM OUTRO PROJETO…")
      expect(colorOf("[N]")).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
      expect(frame).not.toMatch(/pomodoro/i)
      expect(frame).not.toContain("[!]")
      expect(frame).not.toContain("MODO ISOLADO")
      await key("!")
      expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-command-list")
      expect(tui.captureCharFrame()).toContain("◆ Runner [Alt+3]")
      await key("%")
      expect(tui.captureCharFrame()).toContain("◆ Runner [Alt+3]")
      await key("4", false, true)
      await settle(() => tui?.captureCharFrame().includes("◆ HTTP [Alt+4]") ?? false)
      expect(tui.captureCharFrame()).not.toContain("LOG DO PROCESSO")
    } finally {
      if (initialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
      else process.env.TUIMINAL_INITIAL_TAB = initialTab
      if (onlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
      else process.env.TUIMINAL_ONLY_TAB = onlyTab
    }
  })

  test("application shortcuts cannot escape a focused input or save modal", async () => {
    tui = await testRender(<App />, { width: 140, height: 36 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "runner-command-list")
    await key("/")
    await act(async () => {
      await tui?.mockInput.typeText("echo q,!+fixture")
    })
    await key("s", true)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "runner-save-command-name")
    await key("ESCAPE")
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-save-command-modal")
    expect(tui.captureCharFrame()).toContain("SALVAR COMANDO")
    await key("ESCAPE")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "runner-command-input")
    expect(tui.captureCharFrame()).toContain("echo q,!+fixture")
    expect(tui.captureCharFrame()).toContain("COMANDOS")
  })

  test("Escape unfocuses the name before closing the save modal", async () => {
    let closes = 0
    tui = await testRender(
      <RunnerSaveCommandModal
        open
        command="echo fixture"
        availableWidth={120}
        onClose={() => {
          closes += 1
        }}
        onSave={() => undefined}
      />,
      { width: 120, height: 36 },
    )
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "runner-save-command-name")
    await key("ESCAPE")
    expect(closes).toBe(0)
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-save-command-modal")
    expect(tui.captureCharFrame()).toContain("SALVAR COMANDO")
    await key("ESCAPE")
    expect(closes).toBe(1)
  })

  test("N opens projects, plus remains text in inputs, and multi view preserves commands", async () => {
    tui = await testRender(<Runner active />, { width: 140, height: 36 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "runner-command-list")
    expect(tui.captureCharFrame()).toContain("LOG DO PROCESSO")
    expect(tui.captureCharFrame()).not.toContain("▣ MULTI")
    await key("n")
    await settle(() => tui?.captureCharFrame().includes("PROCURAR NOS ARQUIVOS") ?? false)
    expect(tui.captureCharFrame()).toContain("PROJETOS")
    await key("ESCAPE")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "runner-command-list")
    await key("/")
    await act(async () => {
      await tui?.mockInput.typeText("echo 1+1")
    })
    await settle(() => tui?.captureCharFrame().includes("Salvar comando [Ctrl+S]") ?? false)
    expect(tui.captureCharFrame()).toContain("echo 1+1")
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-command-input")
    await key("ESCAPE")
    await key("m")
    expect(tui.captureCharFrame()).toContain("MULTI")
    expect(tui.captureCharFrame()).toContain("COMANDOS")
    await key("n")
    await settle(() => tui?.captureCharFrame().includes("PROCURAR NOS ARQUIVOS") ?? false)
    expect(tui.captureCharFrame()).toContain("PROJETOS")
  })

  test("keeps the command header and details inside a 120-column framed panel", async () => {
    updateUiSettings({ layout: "framed", language: "pt-BR" })
    tui = await testRender(<Runner active />, { width: 120, height: 30 })
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "runner-command-list")
    const panel = tui.renderer.root.findDescendantById("runner-command-panel")
    if (!panel) throw new Error("Painel de comandos ausente")

    for (const id of ["runner-command-mode", "runner-active-mode", "runner-scan"]) {
      const target = tui.renderer.root.findDescendantById(id)
      expect(target, `${id} ausente`).toBeDefined()
      expect((target?.screenX ?? 0) + (target?.width ?? 0)).toBeLessThanOrEqual(
        panel.screenX + panel.width,
      )
    }

    const detail = tui.renderer.root.findDescendantById("runner-command-detail")
    const meta = tui.renderer.root.findDescendantById("runner-command-detail-meta")
    if (detail && meta) expect(meta.screenY).toBe(detail.screenY + 1)
    expect(tui.captureCharFrame()).not.toMatch(/Scan│/)
  })

  test("does not autostart before trust and asks again after a material change", async () => {
    const root = process.env.TUIMINAL_WORKDIR
    if (!root) throw new Error("Runner fixture root is unavailable")
    const configDirectory = join(root, ".tuiminal")
    const configPath = join(configDirectory, "runner.yaml")
    const firstSentinel = join(root, "autostart-first.txt")
    const secondSentinel = join(root, "autostart-second.txt")
    mkdirSync(configDirectory, { recursive: true })
    writeFileSync(
      configPath,
      "commands:\n  trust-fixture:\n    command: bun -e \"await Bun.write('autostart-first.txt', 'started')\"\n    autostart: true\n",
    )

    try {
      tui = await testRender(<Runner active />, { width: 140, height: 36 })
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "runner-autostart-trust-modal",
      )
      expect(existsSync(firstSentinel)).toBe(false)
      expect(tui.captureCharFrame()).toContain("AUTOSTART DO RUNNER")
      expect(tui.captureCharFrame()).toContain("bun -e")

      await key("y")
      await settle(() => existsSync(firstSentinel))
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "runner-command-list")

      writeFileSync(
        configPath,
        "commands:\n  trust-fixture:\n    command: bun -e \"await Bun.write('autostart-second.txt', 'started')\"\n    autostart: true\n",
      )
      await key("d")
      await settle(
        () => tui?.renderer.currentFocusedRenderable?.id === "runner-autostart-trust-modal",
      )
      expect(existsSync(secondSentinel)).toBe(false)
      await key("RETURN")
      await settle(() => existsSync(secondSentinel))
    } finally {
      rmSync(configDirectory, { recursive: true, force: true })
      rmSync(firstSentinel, { force: true })
      rmSync(secondSentinel, { force: true })
    }
  })
})
