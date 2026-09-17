import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { IssuesWorkspace } from "../../packages/feature-git/src/IssuesWorkspace"
import { PullRequestsWorkspace } from "../../packages/feature-git/src/PullRequestsWorkspace"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const originalPrDemo = process.env.TUIMINAL_GIT_PR_DEMO
const originalIssueDemo = process.env.TUIMINAL_GIT_ISSUES_DEMO

async function render() {
  await tui?.renderOnce()
}

function titleValue() {
  return (tui?.renderer.root.findDescendantById("git-create-field-title") as InputRenderable)?.value
}

function baseValue() {
  const field = tui?.renderer.root.findDescendantById("git-create-field-base")
  return field ? tui?.captureCharFrame().split("\n")[field.screenY] : undefined
}

async function key(name: string, options: { ctrl?: boolean; shift?: boolean } = {}) {
  act(() => {
    if (name === "escape") tui?.mockInput.pressEscape(options)
    else tui?.mockInput.pressKey(name, options)
  })
  if (name === "escape") await act(async () => Bun.sleep(60))
  await render()
}

async function click(id: string) {
  if (!tui) throw new Error("TUI not mounted")
  const target = tui.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + Math.floor(target.width / 2), target.screenY)
  })
  await render()
}

async function chooseRepository(repository: string) {
  if (!tui) throw new Error("TUI not mounted")
  await click("git-create-field-repository")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-repository-picker"))).toBe(true)
  await act(async () => Bun.sleep(10))
  await render()
  await click("git-create-repository-search")
  await act(async () => tui?.mockInput.typeText(repository))
  await render()
  const list = tui.renderer.root.findDescendantById("git-create-repository-list")
  if (!list) throw new Error("Repository list did not mount")
  await act(async () => {
    await tui?.mockMouse.click(list.screenX + 4, list.screenY)
  })
  await render()
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-repository-picker"))).toBe(false)
}

async function waitForModalClosed() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await render()
    if (!tui?.renderer.root.findDescendantById("git-create-modal")) return
  }
  throw new Error("Creation modal stayed open")
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
  if (originalPrDemo === undefined) delete process.env.TUIMINAL_GIT_PR_DEMO
  else process.env.TUIMINAL_GIT_PR_DEMO = originalPrDemo
  if (originalIssueDemo === undefined) delete process.env.TUIMINAL_GIT_ISSUES_DEMO
  else process.env.TUIMINAL_GIT_ISSUES_DEMO = originalIssueDemo
})

test("PR creation opens by mouse and Ctrl+N, preserving the modal Escape focus stack", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ language: "pt-BR", layout: "compact" })
  tui = await testRender(<PullRequestsWorkspace active />, { width: 140, height: 34 })
  await render()
  await click("git-pr-create")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-modal"))).toBe(true)
  await act(async () => Bun.sleep(10))
  await render()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-create-field-repository")
  await key("escape")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-modal"))).toBe(true)
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-create-modal")
  await key("escape")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-modal"))).toBe(false)
  await key("n", { ctrl: true })
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-modal"))).toBe(true)
  await act(async () => Bun.sleep(10))
  await render()
  await key("RETURN")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-repository-picker"))).toBe(true)
  await key("escape")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-repository-picker"))).toBe(false)
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-modal"))).toBe(true)
})

test("Issue creation is available without selecting an item and has a mouse control", async () => {
  process.env.TUIMINAL_GIT_ISSUES_DEMO = "1"
  updateUiSettings({ language: "pt-BR", layout: "compact" })
  tui = await testRender(<IssuesWorkspace active />, { width: 120, height: 30 })
  await render()
  await key("n", { ctrl: true })
  expect(tui.captureCharFrame()).toContain("CRIAR ISSUE")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-field-title"))).toBe(true)
  await key("escape")
  await key("escape")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-modal"))).toBe(false)
  await click("git-issue-create")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-modal"))).toBe(true)
  await act(async () => Bun.sleep(10))
  await render()
  await chooseRepository("equipe/web")
  expect(tui.captureCharFrame()).toContain("equipe/web")
  await act(async () => Bun.sleep(10))
  await render()
  await click("git-create-field-title")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-create-field-title")
  await act(async () => tui?.mockInput.typeText("Issue de teste"))
  await render()
  await key("s", { ctrl: true })
  await waitForModalClosed()
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-modal"))).toBe(false)
  expect(tui.captureCharFrame()).toContain("DEMO · criação simulada")
})

test("PR creation selects base and compare branches from the remote-branch picker", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ language: "pt-BR", layout: "compact" })
  tui = await testRender(<PullRequestsWorkspace active />, { width: 140, height: 34 })
  await render()
  await click("git-pr-create")
  await act(async () => Bun.sleep(10))
  await render()
  expect(baseValue()).toContain("main")
  await click("git-create-field-base")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-branch-picker"))).toBe(true)
  expect(tui.captureCharFrame()).toContain("ESCOLHER BRANCH BASE")
  await act(async () => Bun.sleep(10))
  await render()
  await key("RETURN")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-branch-picker"))).toBe(false)
  await act(async () => Bun.sleep(10))
  await render()
  await click("git-create-field-head")
  expect(tui.captureCharFrame()).toContain("ESCOLHER BRANCH COMPARADA")
  await act(async () => Bun.sleep(10))
  await render()
  await key("j")
  await key("RETURN")
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-branch-picker"))).toBe(false)
  expect(tui.captureCharFrame()).toContain("fix/cache")
  await act(async () => Bun.sleep(10))
  await render()
  expect(titleValue()).toBe("Corrigir invalidação do cache")
  await chooseRepository("equipe/web")
  expect(tui.captureCharFrame()).toContain("equipe/web")
  expect(tui.captureCharFrame()).not.toContain("fix/cache")
  expect(titleValue()).toBe("")
  expect(baseValue()).toContain("main")
  await click("git-create-field-head")
  await act(async () => Bun.sleep(10))
  await render()
  expect(tui.captureCharFrame()).toContain("feature/navigation")
  const list = tui.renderer.root.findDescendantById("git-create-branch-list")
  if (!list) throw new Error("Branch list did not mount")
  await act(async () => {
    await tui?.mockMouse.click(list.screenX + 4, list.screenY + 2)
  })
  await render()
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-branch-picker"))).toBe(false)
  expect(tui.captureCharFrame()).toContain("feature/navigation")
  await act(async () => Bun.sleep(10))
  await render()
  expect(titleValue()).toBe("Ajustar navegação por teclado")
  await click("git-create-field-title")
  await act(async () => {
    tui?.mockInput.pressKey("END")
    tui?.mockInput.typeText(" ajustado")
  })
  await render()
  const manualTitle = titleValue()
  expect(manualTitle).toBe("Ajustar navegação por teclado ajustado")
  await click("git-create-field-head")
  await act(async () => Bun.sleep(10))
  await render()
  await key("RETURN")
  expect(titleValue()).toBe(manualTitle)
  expect(Boolean(tui.renderer.root.findDescendantById("git-create-modal"))).toBe(true)
})
