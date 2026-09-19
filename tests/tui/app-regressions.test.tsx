import "./setup"
import { afterEach, expect, test } from "bun:test"
import { RGBA, type BoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { BRAND_COLOR } from "../../packages/core/src/ui/brand"
import {
  loadGitBrowserConfig,
  saveGitBrowserConfig,
} from "../../packages/feature-git/src/storage/browser/config"

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
    if (name === "ENTER" || name === "RETURN") tui?.mockInput.pressEnter()
    else tui?.mockInput.pressKey(name, options)
    await Bun.sleep(name === "ESCAPE" ? 60 : 5)
  })
  await tui?.renderOnce()
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
  })
  await tui.renderOnce()
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
  await act(async () => tui?.mockMouse.click(0, 0))
  await settle(() => !tui?.renderer.root.findDescendantById("configuration-modal"))
})

test("settings center supports Vim and mouse navigation across categories and options", async () => {
  selectInitialTool("runner")
  updateUiSettings({
    colorMode: "dark",
    palette: "prime",
    layout: "framed",
    language: "pt-BR",
  })
  tui = await testRender(<App />, { width: 100, height: 28 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))

  await click("tutorial-settings-button")
  expect(tui.renderer.root.findDescendantById("configuration-navigation")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("configuration-detail-colorMode")).toBeDefined()
  expect(tui.captureCharFrame()).toContain("MODO DE COR")
  expect(tui.captureCharFrame()).toContain("DARK")
  expect(tui.captureCharFrame()).toContain("LIGHT")
  expect(
    tui
      .captureCharFrame()
      .split("\n")
      .some((line) => line.includes("MODO DE COR") && line.includes("[Enter]")),
  ).toBe(false)
  expect(tui.renderer.root.findDescendantById("configuration-modal")).toBeDefined()
  await key("l")

  expect(getUiSettings().colorMode).toBe("light")
  await key("j")
  expect(tui.renderer.root.findDescendantById("configuration-detail-palette")).toBeDefined()
  await settle(() => tui?.captureCharFrame().includes("Dracula") ?? false)
  expect(tui.captureCharFrame()).toContain("Catppuccin")
  expect(tui.captureCharFrame()).toContain("Tokyo Night")
  await key("l")
  expect(getUiSettings().palette).toBe("midnight")
  await key("h")
  expect(getUiSettings().palette).toBe("prime")
  await key("j")
  expect(tui.renderer.root.findDescendantById("configuration-detail-layout")).toBeDefined()
  await key("l")
  expect(getUiSettings().layout).toBe("compact")
  await key("k")
  expect(tui.renderer.root.findDescendantById("configuration-detail-palette")).toBeDefined()
  await click("configuration-section-language")
  expect(tui.renderer.root.findDescendantById("configuration-detail-language")).toBeDefined()
  await click("configuration-language-en")
  expect(getUiSettings().language).toBe("en")
})

test("narrow settings keeps full-width details and compact category controls", async () => {
  selectInitialTool("runner")
  updateUiSettings({ colorMode: "dark", palette: "prime", language: "pt-BR" })
  tui = await testRender(<App />, { width: 60, height: 20 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))

  await click("tutorial-settings-button")
  expect(tui.renderer.root.findDescendantById("configuration-mobile-navigation")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("configuration-navigation")).toBeUndefined()
  expect(tui.renderer.root.findDescendantById("configuration-detail-colorMode")).toBeDefined()
  await click("configuration-category-next")
  expect(tui.renderer.root.findDescendantById("configuration-detail-palette")).toBeDefined()
  await settle(() => tui?.captureCharFrame().includes("Tokyo Night") ?? false)
  await key("l")
  expect(getUiSettings().palette).toBe("midnight")
  await key("j")
  expect(tui.renderer.root.findDescendantById("configuration-detail-layout")).toBeDefined()
})

test("global shortcuts leave Git PR after its local controls have focus", async () => {
  selectInitialTool("git")
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  tui = await testRender(<App />, { width: 120, height: 30, kittyKeyboard: true })
  await settle(() => tui?.captureCharFrame().includes("[C] DIFFS") ?? false)
  await key("2")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("git-pr-query")))
  await key("3", { meta: true })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))
})

test("Diffs opens the local target configuration directly with Ctrl+P", async () => {
  selectInitialTool("git")
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.captureCharFrame().includes("[C] DIFFS") ?? false)

  await key("p", { ctrl: true })
  await settle(() => tui?.captureCharFrame().includes("PROJETO LOCAL") ?? false)
  expect(tui.renderer.root.findDescendantById("configuration-modal")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("git-configuration-context")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("git-configuration-modal")).toBeUndefined()
  expect(tui.captureCharFrame()).toContain("PROJETO LOCAL")
  expect(tui.captureCharFrame()).toContain("BRANCH LOCAL")
})

test("Git comparison Escape returns to Diffs without exiting the application", async () => {
  selectInitialTool("git")
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.captureCharFrame().includes("[C] DIFFS") ?? false)

  await key("c")
  await settle(() => tui?.captureCharFrame().includes("BRANCH BASE") ?? false)
  expect(tui.captureCharFrame()).toContain("BRANCH BASE")
  expect(tui.captureCharFrame()).toContain("BRANCH COMPARADA")

  await key("ESCAPE")
  await settle(() => tui?.captureCharFrame().includes("[C] DIFFS") ?? false)
  expect(tui.captureCharFrame()).toContain("TUIMINAL")
})

test("Git settings configures Diffs, PR, Issues, repositories, and browser", async () => {
  selectInitialTool("git")
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.captureCharFrame().includes("Nenhum repositório Git encontrado") ?? false)

  await click("tutorial-settings-button")
  expect(tui.captureCharFrame()).toContain("◆ CONFIGURAÇÕES · GIT")
  expect(tui.captureCharFrame()).not.toContain("CONFIGURAÇÕES DO BANCO")
  await settle(() => tui?.captureCharFrame().includes("PROJETO LOCAL") ?? false)
  expect(tui.renderer.root.findDescendantById("git-configuration-context")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("git-configuration-modal")).toBeUndefined()
  for (const section of [
    "gitDiffs",
    "gitPullRequests",
    "gitIssues",
    "gitRepositories",
    "gitBrowser",
  ]) {
    expect(tui.renderer.root.findDescendantById(`configuration-section-${section}`)).toBeDefined()
  }
  expect(tui.captureCharFrame()).toContain("PULL REQUESTS")
  expect(tui.captureCharFrame()).toContain("ISSUES")
  expect(tui.captureCharFrame()).toContain("REPOSITÓRIOS")
  expect(tui.captureCharFrame()).toContain("NAVEGADOR")
  expect(tui.captureCharFrame()).toContain("GITHUB")
  expect(tui.captureCharFrame()).toContain("PROJETO LOCAL")
  expect(tui.captureCharFrame()).toContain("BRANCH LOCAL")
  expect(
    tui
      .captureCharFrame()
      .split("\n")
      .some((line) => line.includes("DIFFS") && line.includes("[Enter]")),
  ).toBe(true)
  await key("j")
  expect(
    tui
      .captureCharFrame()
      .split("\n")
      .some((line) => line.includes("PULL REQUESTS") && line.includes("[Enter]")),
  ).toBe(true)
  expect(tui.captureCharFrame()).not.toContain("PROJETO LOCAL")
  expect(tui.captureCharFrame()).not.toContain("[Alt+↑]")
  expect(tui.captureCharFrame()).not.toContain("[Alt+↓]")
  expect(tui.renderer.root.findDescendantById("git-configuration-context")).toBeDefined()
  await key("k")
  expect(tui.captureCharFrame()).toContain("PROJETO LOCAL")
  await key("ENTER")
  expect(
    (
      tui.renderer.root.findDescendantById("configuration-detail-git") as BoxRenderable
    ).borderColor.toInts(),
  ).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  await click("git-configuration-local-project")
  expect(tui.captureCharFrame()).toContain("ESCOLHER PROJETO LOCAL")
  expect(tui.renderer.root.findDescendantById("git-local-target-picker")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("git-configuration-modal")).toBeUndefined()
  await key("ESCAPE")
  await settle(() => !tui?.captureCharFrame().includes("CARREGANDO CONFIGURAÇÃO GIT…"))
  await key("ESCAPE")
  expect(
    tui
      .captureCharFrame()
      .split("\n")
      .some((line) => line.includes("DIFFS") && line.includes("[Enter]")),
  ).toBe(true)
  expect(tui.captureCharFrame()).not.toContain("[J/K] Navegar")
  expect(tui.captureCharFrame()).not.toContain("[H] Categorias")
  await click("configuration-section-gitRepositories")
  expect(tui.captureCharFrame()).toContain("TODOS")
  await click("configuration-section-gitBrowser")
  expect(tui.captureCharFrame()).toContain("Carbonyl")
  expect(tui.captureCharFrame()).toContain("terminal-browser")
  await click("git-configuration-browser-carbonyl")
  expect(loadGitBrowserConfig().browser).toBe("carbonyl")
  saveGitBrowserConfig("system")
  expect(tui.renderer.root.findDescendantById("configuration-modal")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("git-configuration-context")).toBeDefined()
  await act(async () => tui?.mockMouse.click(119, 0))
  await settle(() => !tui?.renderer.root.findDescendantById("configuration-modal"))
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
  await settle(() => tui?.captureCharFrame().includes("[C] DIFFS") ?? false)
  await key("1", { meta: true })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")

  expect(tui.renderer.listenerCount("resize")).toBeLessThanOrEqual(10)
  expect(tui.renderer.keyInput.listenerCount("keypress")).toBeLessThanOrEqual(10)
})
