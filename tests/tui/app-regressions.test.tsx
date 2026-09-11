import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../src/app/App"
import { getUiSettings, updateUiSettings } from "../../src/core/settings/theme"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const initialOnlyTab = process.env.TUIMINAL_ONLY_TAB
const initialTab = process.env.TUIMINAL_INITIAL_TAB
const initialDemo = process.env.TUIMINAL_GIT_PR_DEMO

async function settle(until: () => boolean) {
  if (!tui) throw new Error("TUI não montada")
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(
    `TUI não estabilizou (foco: ${tui.renderer.currentFocusedRenderable?.id ?? "nenhum"}):\n${tui.captureCharFrame()}`,
  )
}

async function key(name: string, options: { ctrl?: boolean; meta?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, options)
    await Bun.sleep(name === "ESCAPE" ? 60 : 5)
    await tui?.renderOnce()
  })
}

async function click(id: string) {
  if (!tui) throw new Error("TUI não montada")
  const target = tui.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Alvo de mouse ausente: ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(
      target.screenX + Math.max(0, Math.floor(target.width / 2)),
      target.screenY + Math.max(0, Math.floor(target.height / 2)),
    )
    await tui?.renderOnce()
  })
}

function selectInitialTool(tool: "database" | "git" | "runner" | "http") {
  delete process.env.TUIMINAL_ONLY_TAB
  process.env.TUIMINAL_INITIAL_TAB = tool
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
  if (initialOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = initialOnlyTab
  if (initialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = initialTab
  if (initialDemo === undefined) delete process.env.TUIMINAL_GIT_PR_DEMO
  else process.env.TUIMINAL_GIT_PR_DEMO = initialDemo
})

test("switches from framed to compact without registering duplicate global tabs", async () => {
  selectInitialTool("runner")
  updateUiSettings({ layout: "framed", language: "pt-BR" })
  tui = await testRender(<App />, { width: 80, height: 20 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))
  for (const shortcut of ["[Alt+1]", "[Alt+2]", "[Alt+3]", "[Alt+4]", "[Alt+5]"]) {
    expect(tui.captureCharFrame()).toContain(shortcut)
  }

  await click("tutorial-settings-button")
  await key("ARROW_DOWN")
  await key("ARROW_DOWN")
  await key("ARROW_RIGHT")

  expect(getUiSettings().layout).toBe("compact")
  expect(tui.renderer.root.findDescendantById("configuration-section-layout")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("tutorial-app-header")).toBeDefined()
})

test("switches from the default Dark mode to Light in global settings", async () => {
  selectInitialTool("runner")
  updateUiSettings({ colorMode: "dark", language: "pt-BR" })
  tui = await testRender(<App />, { width: 80, height: 20 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))

  await click("tutorial-settings-button")
  expect(tui.captureCharFrame()).toContain("MODO DE COR")
  expect(tui.captureCharFrame()).toContain("DARK")
  expect(tui.captureCharFrame()).toContain("LIGHT")
  expect(tui.captureCharFrame()).toContain("Dracula")
  expect(tui.captureCharFrame()).toContain("Catppuccin")
  expect(tui.captureCharFrame()).toContain("Tokyo Night")
  await key("ARROW_RIGHT")

  expect(getUiSettings().colorMode).toBe("light")
  expect(tui.renderer.root.findDescendantById("configuration-section-colorMode")).toBeDefined()
})

test("global shortcuts leave Git PR after its local controls have focus", async () => {
  selectInitialTool("git")
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  tui = await testRender(<App />, { width: 120, height: 30, kittyKeyboard: true })
  await settle(() => tui?.captureCharFrame().includes("GIT · DIFFS") ?? false)
  await key("2")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("git-pr-query")))
  await key("3", { meta: true })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))
})

test("Diffs opens the local target configuration directly with Ctrl+P", async () => {
  selectInitialTool("git")
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.captureCharFrame().includes("GIT · DIFFS") ?? false)

  await key("p", { ctrl: true })
  await settle(() => tui?.captureCharFrame().includes("PROJETO LOCAL") ?? false)
  expect(tui.captureCharFrame()).toContain("PROJETO LOCAL")
  expect(tui.captureCharFrame()).toContain("BRANCH LOCAL")
})

test("Git comparison Escape returns to Diffs without exiting the application", async () => {
  selectInitialTool("git")
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.captureCharFrame().includes("GIT · DIFFS") ?? false)

  await key("c")
  await settle(() => tui?.captureCharFrame().includes("BRANCH BASE") ?? false)
  expect(tui.captureCharFrame()).toContain("BRANCH BASE")
  expect(tui.captureCharFrame()).toContain("BRANCH COMPARADA")

  await key("ESCAPE")
  await settle(() => tui?.captureCharFrame().includes("GIT · DIFFS") ?? false)
  expect(tui.captureCharFrame()).toContain("TUIMINAL")
})

test("Git settings opens the unified Diffs, PR, Issue, and repository configuration", async () => {
  selectInitialTool("git")
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.captureCharFrame().includes("Nenhum repositório Git encontrado") ?? false)

  await click("tutorial-settings-button")
  expect(tui.captureCharFrame()).toContain("CONFIGURAÇÕES DO GIT")
  expect(tui.captureCharFrame()).toContain("PR, Issues e repositórios")
  expect(tui.captureCharFrame()).not.toContain("CONFIGURAÇÕES DO BANCO")

  await act(async () => {
    tui?.mockInput.pressEnter()
    await Bun.sleep(5)
    await tui?.renderOnce()
  })
  await settle(() => tui?.captureCharFrame().includes("Seletores de PR") ?? false)
  expect(tui.captureCharFrame()).toContain("Seletores de PR")
  expect(tui.captureCharFrame()).toContain("Seletores de Issues")
  expect(tui.captureCharFrame()).toContain("Repositórios")
  expect(tui.captureCharFrame()).toContain("PROJETO LOCAL")
  expect(tui.captureCharFrame()).toContain("BRANCH LOCAL")
  await click("git-configuration-local-project")
  expect(tui.captureCharFrame()).toContain("ESCOLHER PROJETO LOCAL")
  await key("ESCAPE")
  await settle(() => !tui?.captureCharFrame().includes("CARREGANDO CONFIGURAÇÃO GIT…"))
  await click("git-configuration-tab-repositories")
  expect(tui.captureCharFrame()).toContain("TODOS")
})

test("global shortcuts leave Database after closing the connection form", async () => {
  selectInitialTool("database")
  tui = await testRender(<App />, { width: 120, height: 30, kittyKeyboard: true })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")
  await key("ESCAPE")
  await key("ESCAPE")
  await key("3", { meta: true })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))
})

test("global shortcuts leave HTTP after its URL input releases focus", async () => {
  selectInitialTool("http")
  tui = await testRender(<App />, { width: 120, height: 30, kittyKeyboard: true })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("3", { meta: true })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))
})

test("keeps global listener counts bounded after visiting multiple tools", async () => {
  selectInitialTool("runner")
  tui = await testRender(<App />, { width: 120, height: 30, kittyKeyboard: true })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))

  await key("2", { meta: true })
  await settle(() => tui?.captureCharFrame().includes("GIT · DIFFS") ?? false)
  await key("1", { meta: true })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")

  expect(tui.renderer.listenerCount("resize")).toBeLessThanOrEqual(10)
  expect(tui.renderer.keyInput.listenerCount("keypress")).toBeLessThanOrEqual(10)
})
