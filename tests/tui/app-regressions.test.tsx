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

async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    await Bun.sleep(name === "ESCAPE" ? 60 : 5)
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
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))

  await key(",")
  await key("ARROW_DOWN")
  await key("ARROW_RIGHT")

  expect(getUiSettings().layout).toBe("compact")
  expect(tui.captureCharFrame()).toContain("CONFIGURAÇÕES GLOBAIS")
  expect(tui.renderer.root.findDescendantById("tutorial-app-header")).toBeDefined()
})

test("global shortcuts leave Git PR after its local controls have focus", async () => {
  selectInitialTool("git")
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.captureCharFrame().includes("GIT · BASE LOCAL") ?? false)
  await key("2")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("git-pr-query")))
  await key("$")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))
})

test("global shortcuts leave Database after closing the connection form", async () => {
  selectInitialTool("database")
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")
  await key("ESCAPE")
  await key("ESCAPE")
  await key("$")
  await settle(() => tui?.captureCharFrame().includes("LOG DO PROCESSO") ?? false)
})

test("global shortcuts leave HTTP after its URL input releases focus", async () => {
  selectInitialTool("http")
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("$")
  await settle(() => tui?.captureCharFrame().includes("LOG DO PROCESSO") ?? false)
})

test("keeps global listener counts bounded after visiting multiple tools", async () => {
  selectInitialTool("runner")
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("runner-command-list")))

  await key("#")
  await settle(() => tui?.captureCharFrame().includes("GIT · BASE LOCAL") ?? false)
  await key("@")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")

  expect(tui.renderer.listenerCount("resize")).toBeLessThanOrEqual(10)
  expect(tui.renderer.keyInput.listenerCount("keypress")).toBeLessThanOrEqual(10)
})
