import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { GitViewer } from "../../packages/feature-git/src"

const DEMO_KEYS = [
  "TUIMINAL_GIT_PR_DEMO",
  "TUIMINAL_GIT_ISSUES_DEMO",
  "TUIMINAL_GIT_INBOX_DEMO",
] as const
const initialDemo = Object.fromEntries(DEMO_KEYS.map((name) => [name, process.env[name]]))
const initialSettings = getUiSettings()
let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
  for (const name of DEMO_KEYS) {
    const value = initialDemo[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

async function key(name: string, options: { shift?: boolean } = {}) {
  act(() => {
    if (name === "escape") tui?.mockInput.pressEscape()
    else if (name === "enter") tui?.mockInput.pressEnter()
    else tui?.mockInput.pressKey(name, options)
  })
  await act(async () => Bun.sleep(name === "escape" ? 60 : 10))
  await tui?.renderOnce()
}

async function type(text: string) {
  await act(async () => tui?.mockInput.typeText(text))
  await tui?.renderOnce()
}

async function waitFor(check: () => boolean, label: string) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(`TUI did not reach: ${label}\n${tui?.captureCharFrame()}`)
}

const frame = () => tui?.captureCharFrame() ?? ""
const row = (id: string) => tui?.renderer.root.findDescendantById(`git-action-palette-row-${id}`)

async function mount() {
  for (const name of DEMO_KEYS) process.env[name] = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 34 })
  await tui.renderOnce()
}

test("[?] in Pull Requests lists tagged actions, explains pane rules and switches tabs", async () => {
  await mount()
  await key("2")
  await waitFor(() => frame().includes("PULL REQUESTS · DEMO"), "PR dashboard")
  await key("?")
  await waitFor(() => frame().includes("AÇÕES DO GIT · PULL REQUESTS"), "PR palette")
  expect(frame()).toContain("LISTA")
  expect(row("mutation:comment")).toBeTruthy()
  expect(row("tab-pr")).toBeFalsy()

  // A preview-only row explains which pane must be focused.
  await key("/")
  await type("voltar à lista")
  await waitFor(() => frame().includes("⊘ Foque a prévia"), "pane reason")

  // Escape leaves the search, then the palette; workspace keys stay inside meanwhile.
  await key("escape")
  await key("3")
  expect(frame()).toContain("AÇÕES DO GIT · PULL REQUESTS")
  await key("escape")
  await waitFor(() => !frame().includes("AÇÕES DO GIT"), "palette closed")

  await key("?")
  await key("/")
  await type("issues")
  await waitFor(() => Boolean(row("tab-issues")), "tab row")
  await key("enter")
  await waitFor(() => frame().includes("ISSUES · DEMO"), "Issues tab")
  expect(frame()).not.toContain("AÇÕES DO GIT")
})

test("[?] in Pull Requests runs write shortcuts directly", async () => {
  await mount()
  await key("2")
  await waitFor(() => frame().includes("PULL REQUESTS · DEMO"), "PR dashboard")
  await key("?")
  await waitFor(() => Boolean(row("mutation:comment")), "PR palette")
  await key("c")
  await waitFor(() => frame().includes("COMENTAR"), "comment form")
  expect(frame()).not.toContain("AÇÕES DO GIT")
})

test("[?] in Inbox lists notification actions and opens from the list", async () => {
  await mount()
  await key("4")
  await waitFor(() => frame().includes("INBOX · DEMO"), "Inbox dashboard")
  await key("?")
  await waitFor(() => frame().includes("AÇÕES DO GIT · INBOX"), "Inbox palette")
  expect(row("read")).toBeTruthy()
  expect(row("tab-base")).toBeTruthy()
  await key("/")
  await type("concluir")
  await waitFor(() => Boolean(row("done")) && !row("read"), "filtered")
  await key("enter")
  await waitFor(() => !frame().includes("AÇÕES DO GIT"), "palette closed")
  expect(tui?.renderer.root.findDescendantById("git-inbox-action-modal")).toBeTruthy()
})

test("[M] chooses the list or preview box in Pull Requests", async () => {
  await mount()
  await key("2")
  await waitFor(() => frame().includes("PULL REQUESTS · DEMO"), "PR dashboard")
  await key("m")
  const box = (id: string) => tui?.renderer.root.findDescendantById(id)
  await waitFor(() => Boolean(box("git-box-list-focus-selection-tint")), "list selected")
  expect(box("git-box-preview-focus-selection-dim")).toBeTruthy()
  // Workspace keys stay inside the selection: [L] moves the selection, not the PR focus.
  await key("l")
  expect(box("git-box-preview-focus-selection-tint")).toBeTruthy()
  await key("enter")
  await waitFor(() => !box("git-box-list-focus-selection"), "selection closed")
  expect(tui?.renderer.root.findDescendantById("git-pr-preview-panel")).toBeTruthy()
  // Back in the list, [Shift+M] still prepares a merge instead of choosing a box.
  await key("h")
  await key("m", { shift: true })
  expect(box("git-box-list-focus-selection")).toBeFalsy()
})

test("[M] chooses a box in Inbox and [Shift+M] does not", async () => {
  await mount()
  await key("4")
  await waitFor(() => frame().includes("INBOX · DEMO"), "Inbox dashboard")
  await key("m")
  const box = (id: string) => tui?.renderer.root.findDescendantById(id)
  await waitFor(() => Boolean(box("git-box-list-focus-selection-tint")), "list selected")
  await key("escape")
  await waitFor(() => !box("git-box-list-focus-selection"), "selection cancelled")
  // [Shift+M] keeps marking read (demo data stays unchanged) and never chooses a box.
  await key("m", { shift: true })
  expect(box("git-box-list-focus-selection")).toBeFalsy()
})
