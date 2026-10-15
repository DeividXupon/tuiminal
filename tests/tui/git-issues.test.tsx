import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import {
  getUiSettings,
  PALETTES,
  type LayoutMode,
  type PaletteId,
  updateUiSettings,
} from "../../packages/core/src/settings/theme"
import { GitViewer } from "../../packages/feature-git/src"
import { IssuesWorkspace } from "../../packages/feature-git/src/IssuesWorkspace"
import type { LanguageId } from "../../packages/core/src/i18n"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const initialIssueDemo = process.env.TUIMINAL_GIT_ISSUES_DEMO

async function key(
  name: string,
  options: { shift?: boolean; ctrl?: boolean; option?: boolean } = {},
) {
  act(() => tui?.mockInput.pressKey(name, options))
  if (name.toLowerCase() === "escape") await act(async () => Bun.sleep(60))
  await tui?.renderOnce()
}

async function click(id: string) {
  if (!tui) throw new Error("TUI not mounted")
  const target = tui.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing mouse target: ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(
      target.screenX + Math.max(0, Math.floor(target.width / 2)),
      target.screenY + Math.max(0, Math.floor(target.height / 2)),
    )
  })
  await tui.renderOnce()
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
  if (initialIssueDemo === undefined) delete process.env.TUIMINAL_GIT_ISSUES_DEMO
  else process.env.TUIMINAL_GIT_ISSUES_DEMO = initialIssueDemo
})

test("Git lazy mounts Issues as tab 3 and preserves its section", async () => {
  process.env.TUIMINAL_GIT_ISSUES_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 32 })
  await tui.renderOnce()

  expect(tui.captureCharFrame()).toContain("[C] DIFFS")
  expect(tui.captureCharFrame()).toContain("[2] PR")
  expect(tui.captureCharFrame()).toContain("[3] ISSUES")
  expect(tui.captureCharFrame()).not.toContain("ISSUES · DEMO")

  await key("3")
  expect(tui.captureCharFrame()).toContain("ISSUES · DEMO")
  expect(tui.captureCharFrame()).toContain("equipe/api #318")
  expect(tui.captureCharFrame()).toContain("Cache expira")
  expect(tui.captureCharFrame()).toContain("VISÃO GERAL")

  await key("f")
  expect(tui.captureCharFrame()).toContain("is:open assignee:@me")
  await key("f")
  expect(tui.captureCharFrame()).toContain("is:open involves:@me")
  await key("1")
  expect(tui.captureCharFrame()).not.toContain("ISSUES · DEMO")
  await key("3")
  expect(tui.captureCharFrame()).toContain("is:open involves:@me")
})

test("narrow Issues view switches between list and activity preview", async () => {
  process.env.TUIMINAL_GIT_ISSUES_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 64, height: 18 })
  await tui.renderOnce()
  await key("3")

  expect(tui.captureCharFrame()).toContain("equipe/api #318")
  expect(tui.captureCharFrame()).not.toContain("DESCRIÇÃO")
  await key("l")
  expect(tui.captureCharFrame()).toContain("DESCRIÇÃO")
  await key("v")
  expect(tui.captureCharFrame()).toContain("Vou preparar a correção")
  await key("h")
  expect(tui.captureCharFrame()).toContain("Cache expira")
})

test("mouse reaches Issue tabs, sections, rows, preview tabs and action menu", async () => {
  process.env.TUIMINAL_GIT_ISSUES_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 34 })
  await tui.renderOnce()
  await click("git-tab-issues")
  expect(tui.captureCharFrame()).toContain("ISSUES · DEMO")
  await click("git-issue-section-2")
  expect(tui.captureCharFrame()).toContain("is:open involves:@me")
  await click("git-issue-row-1")
  expect(tui.captureCharFrame()).toContain("equipe/web #204")
  await click("git-issue-preview-tab-activity")
  expect(tui.captureCharFrame()).toContain("Vou preparar a correção")
  await click("git-issue-open-actions")
  expect(tui.captureCharFrame()).toContain("AÇÕES DA ISSUE")
  expect(tui.captureCharFrame()).toContain("[Shift+C] Criar branch")
  await key("l", { shift: true })
  expect(tui.captureCharFrame()).toContain("EDITAR LABELS DA ISSUE")
})

test("Issue action input owns tab numbers and Escape unwinds one layer at a time", async () => {
  process.env.TUIMINAL_GIT_ISSUES_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 32 })
  await tui.renderOnce()
  await key("3")
  await key("c")
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()

  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-issue-action-input")
  await act(async () => tui?.mockInput.typeText("2 comentário seguro"))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("COMENTAR NA ISSUE")
  expect(tui.captureCharFrame()).toContain("2 comentário seguro")
  expect(tui.captureCharFrame()).not.toContain("PULL REQUESTS")

  await key("ESCAPE")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-issue-action-modal")
  await key("ESCAPE")
  expect(tui.captureCharFrame()).not.toContain("NADA SERÁ EXECUTADO")
  expect(tui.captureCharFrame()).toContain("ISSUES · DEMO")
})

test("Issue comments are keyboard-selectable, reactable and replyable", async () => {
  process.env.TUIMINAL_GIT_ISSUES_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<IssuesWorkspace active />, { width: 120, height: 30 })
  await tui.renderOnce()

  await key("l")
  await key("v")
  expect(tui.captureCharFrame()).toContain("[E] Nova reação")
  expect(tui.captureCharFrame()).toContain("[Enter] Responder")
  expect(tui.captureCharFrame()).toContain("↳ @bia")
  expect(tui.captureCharFrame()).toContain("A resposta agora aparece dentro da conversa.")

  await key("e")
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("REAGIR NO COMENTÁRIO")
  expect(tui.captureCharFrame()).toContain("👍")
  expect(tui.captureCharFrame()).toContain("👀")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-issue-action-modal")
  await key("ESCAPE")
  expect(tui.captureCharFrame()).not.toContain("REAGIR NO COMENTÁRIO")
  expect(tui.renderer.currentFocusedRenderable?.id).toBeUndefined()

  await key("j")
  expect(tui.captureCharFrame()).toContain("[E] Reagir")
  await key("RETURN")
  expect(tui.captureCharFrame()).toContain("RESPONDER COMENTÁRIO")
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-issue-action-input")
})

test("Issues dashboard survives supported sizes, languages, palettes and layouts", async () => {
  process.env.TUIMINAL_GIT_ISSUES_DEMO = "1"
  const languages: LanguageId[] = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"]
  const sizes = [
    [40, 12],
    [64, 18],
    [90, 28],
    [140, 36],
  ] as const
  const palettes = Object.keys(PALETTES) as PaletteId[]
  const layouts: LayoutMode[] = ["framed", "compact"]
  for (const [languageIndex, language] of languages.entries()) {
    for (const [sizeIndex, [width, height]] of sizes.entries()) {
      updateUiSettings({
        language,
        palette: palettes[(languageIndex + sizeIndex) % palettes.length] ?? "prime",
        layout: layouts[(languageIndex + sizeIndex) % layouts.length] ?? "compact",
      })
      const renderer = await testRender(<IssuesWorkspace active />, { width, height })
      await renderer.renderOnce()
      const frame = renderer.captureCharFrame()
      expect(frame).toContain("ISSUES")
      expect(frame).not.toContain("undefined")
      act(() => renderer.renderer.destroy())
    }
  }
})
