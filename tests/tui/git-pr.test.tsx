import "./setup"
import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RGBA, type BoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../src/app/App"
import {
  COLORS,
  getUiSettings,
  PALETTES,
  type LayoutMode,
  type PaletteId,
  updateUiSettings,
} from "../../src/core/settings/theme"
import { GitViewer } from "../../src/features/git"
import { GitCompareWorkspace } from "../../src/features/git/GitCompareWorkspace"
import { GitBaseWorkspace } from "../../src/features/git/GitWorkspace"
import { PullRequestsWorkspace } from "../../src/features/git/PullRequestsWorkspace"
import { loadLocalGitTarget } from "../../src/features/git/services/local-target"
import { SectionEditorModal } from "../../src/features/git/ui/pr/SectionEditorModal"
import type { LanguageId } from "../../src/shared/i18n"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const initialDemoMode = process.env.TUIMINAL_GIT_PR_DEMO
const initialOnlyTab = process.env.TUIMINAL_ONLY_TAB

async function key(
  name: string,
  options: { shift?: boolean; ctrl?: boolean; option?: boolean } = {},
) {
  act(() => {
    if (name.toLowerCase() === "tab") tui?.mockInput.pressTab(options)
    else tui?.mockInput.pressKey(name, options)
  })
  if (name.toLowerCase() === "escape") {
    await act(async () => Bun.sleep(60))
  }
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

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (tui?.captureCharFrame().includes(text)) return
  }
  throw new Error(`TUI did not show: ${text}`)
}

function renderableBorderSides(panel: BoxRenderable) {
  return (
    panel as unknown as {
      borderSides: { top: boolean; right: boolean; bottom: boolean; left: boolean }
    }
  ).borderSides
}

function expectMiniGraphAnchored(layout: LayoutMode) {
  if (!tui) throw new Error("TUI Git não montada")
  const filesPanel = tui.renderer.root.findDescendantById("git-base-files-panel") as BoxRenderable
  const miniGraph = tui.renderer.root.findDescendantById("git-base-mini-graph") as BoxRenderable
  expect(miniGraph.screenX).toBeGreaterThanOrEqual(filesPanel.screenX)
  expect(miniGraph.screenX + miniGraph.width).toBeLessThanOrEqual(
    filesPanel.screenX + filesPanel.width,
  )
  expect(miniGraph.screenX - filesPanel.screenX).toBe(
    filesPanel.screenX + filesPanel.width - (miniGraph.screenX + miniGraph.width),
  )
  expect(miniGraph.screenY).toBeGreaterThan(filesPanel.screenY)
  expect(filesPanel.screenY + filesPanel.height - (miniGraph.screenY + miniGraph.height)).toBe(
    layout === "framed" ? 1 : 0,
  )
}

async function waitForMiniGraphAnchor(layout: LayoutMode) {
  const expectedInset = layout === "framed" ? 1 : 0
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    const filesPanel = tui?.renderer.root.findDescendantById("git-base-files-panel")
    const miniGraph = tui?.renderer.root.findDescendantById("git-base-mini-graph")
    if (
      filesPanel &&
      miniGraph &&
      miniGraph.screenX - filesPanel.screenX ===
        filesPanel.screenX + filesPanel.width - (miniGraph.screenX + miniGraph.width) &&
      filesPanel.screenY + filesPanel.height - (miniGraph.screenY + miniGraph.height) ===
        expectedInset
    ) {
      expectMiniGraphAnchored(layout)
      return
    }
  }
  const filesPanel = tui?.renderer.root.findDescendantById("git-base-files-panel") as BoxRenderable
  const miniGraph = tui?.renderer.root.findDescendantById("git-base-mini-graph") as BoxRenderable
  const geometry = {
    files: [filesPanel?.screenX, filesPanel?.screenY, filesPanel?.width, filesPanel?.height],
    graph: [miniGraph?.screenX, miniGraph?.screenY, miniGraph?.width, miniGraph?.height],
    borders: filesPanel ? renderableBorderSides(filesPanel) : undefined,
  }
  throw new Error(
    `Mini grafo não ancorado no layout ${layout}: ${JSON.stringify(geometry)}\n${tui?.captureCharFrame()}`,
  )
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
  if (initialDemoMode === undefined) delete process.env.TUIMINAL_GIT_PR_DEMO
  else process.env.TUIMINAL_GIT_PR_DEMO = initialDemoMode
  if (initialOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = initialOnlyTab
})

test("isolated Git starts on offline Diffs outside a repository and can enter PR", async () => {
  process.env.TUIMINAL_ONLY_TAB = "git"
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<App />, { width: 120, height: 28 })
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (tui.captureCharFrame().includes("Nenhum repositório Git encontrado")) break
  }
  expect(tui.captureCharFrame()).toContain("GIT · MODO ISOLADO")
  expect(tui.captureCharFrame()).toContain("Nenhum repositório Git encontrado")
  expect(tui.captureCharFrame()).not.toContain("◆ Runner [$]")
  await key("2")
  expect(tui.captureCharFrame()).toContain("PULL REQUESTS · DEMO")
  await key("1")
  expect(tui.captureCharFrame()).toContain("Nenhum repositório Git encontrado")
})

test("Git opens on Diffs, lazy mounts PR and preserves both tab states", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 32 })
  await tui.renderOnce()

  expect(tui.captureCharFrame()).toContain("[C] GIT · DIFFS")
  expect(tui.captureCharFrame()).not.toContain("PULL REQUESTS · DEMO")

  await key("2")
  expect(tui.captureCharFrame()).toContain("PULL REQUESTS · DEMO")
  expect(tui.captureCharFrame()).toContain("integração GitHub")
  expect(tui.captureCharFrame()).toContain("equipe/api #142")
  expect(tui.captureCharFrame()).toContain("ABERTO · main")

  await key("p")
  expect(tui.captureCharFrame()).not.toContain("ABERTO · main")
  await key("p")
  expect(tui.captureCharFrame()).toContain("ABERTO · main")

  await key("g", { shift: true })
  expect(tui.captureCharFrame()).toContain("▶ ● equipe/cli #55")
  await key("g")
  expect(tui.captureCharFrame()).toContain("▶ ◆ equipe/api #142")

  await key("j")
  expect(tui.captureCharFrame()).toContain("equipe/cli #55")
  await key(">")
  expect(tui.captureCharFrame()).toContain("review-requested:@me")

  await key("1")
  expect(tui.captureCharFrame()).not.toContain("PULL REQUESTS · DEMO")
  await key("2")
  expect(tui.captureCharFrame()).toContain("review-requested:@me")
})

test("Diffs opens its local project and branch settings directly", async () => {
  let opened = 0
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active onOpenLocalConfiguration={() => (opened += 1)} />, {
    width: 140,
    height: 32,
  })
  await waitForText("[Ctrl+P] Alterar projeto/branch")

  expect(tui.captureCharFrame()).toContain("[Ctrl+P] Alterar projeto/branch")
  await key("p", { ctrl: true })
  expect(opened).toBe(1)
  await click("git-open-local-configuration")
  expect(opened).toBe(2)
})

test("Diffs keeps shortcuts visible and moves between its file tree and diff", async () => {
  const repository = mkdtempSync(join(tmpdir(), "tuiminal-diffs-tui-"))
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", repository])
  writeFileSync(join(repository, "README.md"), "base\n")
  execFileSync("git", ["-C", repository, "add", "README.md"])
  execFileSync("git", [
    "-C",
    repository,
    "-c",
    "user.name=Tuiminal Test",
    "-c",
    "user.email=tuiminal@example.test",
    "commit",
    "--quiet",
    "-m",
    "base",
  ])
  writeFileSync(join(repository, "HISTORY.md"), "second commit\n")
  execFileSync("git", ["-C", repository, "add", "HISTORY.md"])
  execFileSync("git", [
    "-C",
    repository,
    "-c",
    "user.name=Tuiminal Test",
    "-c",
    "user.email=tuiminal@example.test",
    "commit",
    "--quiet",
    "-m",
    "second",
  ])
  writeFileSync(join(repository, "README.md"), "base\nchanged\n")
  writeFileSync(join(repository, "notes.txt"), "untracked\n")

  try {
    updateUiSettings({ layout: "framed", language: "pt-BR" })
    tui = await testRender(<GitBaseWorkspace active targetDirectory={repository} />, {
      width: 120,
      height: 30,
    })
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await act(async () => Bun.sleep(10))
      await tui.renderOnce()
      if (tui.captureCharFrame().includes("README.md")) break
    }
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()

    const frame = tui.captureCharFrame()
    const fileRow = frame.split("\n").find((line) => line.slice(0, 40).includes("M README.md"))
    expect(fileRow).toBeDefined()
    expect(fileRow?.slice(0, 40)).not.toMatch(/[●○◐]/)
    expect(frame).toContain("[V] Unificado")
    expect(frame).toContain("[O] Log")
    expect(frame).toContain("[Tab/H/L/←/→] Árvore/diff")
    await waitForMiniGraphAnchor("framed")
    expect(tui.renderer.root.findDescendantById("git-base-shortcut-footer")?.zIndex).toBe(30)
    expect(tui.renderer.currentFocusedRenderable?.id).toStartWith("git-file-list-row-")
    expect(
      (
        tui.renderer.root.findDescendantById("git-base-files-panel") as BoxRenderable
      ).borderColor.toInts(),
    ).toEqual(RGBA.fromHex(COLORS.git).toInts())

    await key("l")
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-base-diff")
    expect(
      (
        tui.renderer.root.findDescendantById("git-base-preview-panel") as BoxRenderable
      ).borderColor.toInts(),
    ).toEqual(RGBA.fromHex(COLORS.git).toInts())
    expect(
      (
        tui.renderer.root.findDescendantById("git-base-files-panel") as BoxRenderable
      ).borderColor.toInts(),
    ).toEqual(RGBA.fromHex(COLORS.border).toInts())
    await key("h")
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toStartWith("git-file-list-row-")
    act(() => tui?.mockInput.pressArrow("right"))
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-base-diff")
    await key("tab")
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toStartWith("git-file-list-row-")

    const stableDiff = tui.renderer.root.findDescendantById("git-base-diff")
    act(() => tui?.mockInput.pressArrow("down"))
    await tui.renderOnce()
    expect(tui.renderer.root.findDescendantById("git-base-diff")).toBe(stableDiff)

    await key("o")
    expect(tui.captureCharFrame()).toContain("HISTÓRICO DO BRANCH")
    expect(tui.renderer.root.findDescendantById("git-base-shortcut-footer")?.zIndex).toBe(30)
    expect(tui.captureCharFrame()).toContain("[J/K/↑/↓] Navegar")
    await key("l")
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-base-history")
    await key("j")
    expect(tui.captureCharFrame()).toContain("2/2  [J/K/↑/↓]")
    act(() => tui?.mockInput.pressArrow("up"))
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain("1/2  [J/K/↑/↓]")
    await key("n")
    expect(tui.captureCharFrame()).toContain("1/2  [J/K/↑/↓]")
    await key("g")
    expect(tui.captureCharFrame()).toContain("ÁRVORE DE COMMITS")
    await key("j")
    expect(tui.captureCharFrame()).toContain("2/2  [J/K/↑/↓]")

    act(() => tui?.renderer.destroy())
    tui = undefined
    updateUiSettings({ layout: "compact", language: "pt-BR" })
    tui = await testRender(<GitBaseWorkspace active targetDirectory={repository} />, {
      width: 120,
      height: 30,
    })
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await act(async () => Bun.sleep(10))
      await tui.renderOnce()
      if (tui.captureCharFrame().includes("README.md")) break
    }
    await waitForMiniGraphAnchor("compact")
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    rmSync(repository, { recursive: true, force: true })
  }
})

test("Diffs toggles into the local branch comparison selector", async () => {
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 32 })
  await tui.renderOnce()

  expect(tui.captureCharFrame()).toContain("[1]  [C] GIT · DIFFS")
  await key("c")
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (tui.captureCharFrame().includes("BRANCH COMPARADA")) break
  }
  const compareFrame = tui.captureCharFrame()
  expect(compareFrame).toContain("[C] GIT · COMPARAR")
  expect(compareFrame).toContain("PROJETO")
  expect(compareFrame).toContain("BRANCH BASE")
  expect(compareFrame).toContain("BRANCH COMPARADA")
  expect(compareFrame).toContain("Nenhum checkout será realizado")

  act(() => tui?.mockInput.pressEscape())
  await act(async () => Bun.sleep(60))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("[C] GIT · DIFFS")

  await click("git-mode-compare")
  expect(tui.captureCharFrame()).toContain("[C] GIT · COMPARAR")
  await click("git-compare-base")
  expect(tui.captureCharFrame()).toContain("ESCOLHER BRANCH BASE")
  await act(async () => {
    tui?.mockInput.pressEscape()
    await Bun.sleep(60)
  })
  await tui.renderOnce()
  expect(tui.captureCharFrame()).not.toContain("ESCOLHER BRANCH BASE")
  expect(tui.captureCharFrame()).toContain("[C] GIT · COMPARAR")
})

test("branch comparison selects two refs and renders their diff without checkout", async () => {
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  const repository = mkdtempSync(join(tmpdir(), "tuiminal-compare-tui-"))
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", repository])
  writeFileSync(join(repository, "README.md"), "base\n")
  execFileSync("git", ["-C", repository, "add", "README.md"])
  execFileSync("git", [
    "-C",
    repository,
    "-c",
    "user.name=Tuiminal Test",
    "-c",
    "user.email=tuiminal@example.test",
    "commit",
    "--quiet",
    "-m",
    "base",
  ])
  execFileSync("git", ["-C", repository, "switch", "--quiet", "-c", "feature"])
  writeFileSync(join(repository, "feature.ts"), "export const ready = true\n")
  execFileSync("git", ["-C", repository, "add", "feature.ts"])
  execFileSync("git", [
    "-C",
    repository,
    "-c",
    "user.name=Tuiminal Test",
    "-c",
    "user.email=tuiminal@example.test",
    "commit",
    "--quiet",
    "-m",
    "feature",
  ])

  try {
    tui = await testRender(
      <GitCompareWorkspace active targetDirectory={repository} onExit={() => {}} />,
      { width: 120, height: 32 },
    )
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await act(async () => Bun.sleep(10))
      await tui.renderOnce()
      if (tui.captureCharFrame().includes("feature")) break
    }

    await click("git-compare-base")
    await act(async () => Bun.sleep(10))
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-compare-branch-list")
    act(() => tui?.mockInput.pressArrow("down"))
    await tui.renderOnce()
    act(() => tui?.mockInput.pressEnter())
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain("main")

    await click("git-compare-compared")
    await act(async () => Bun.sleep(10))
    act(() => tui?.mockInput.pressEnter())
    await tui.renderOnce()
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await act(async () => Bun.sleep(10))
      await tui.renderOnce()
      const currentFrame = tui.captureCharFrame()
      if (currentFrame.includes("ARQUIVOS 1") && currentFrame.includes("feature.ts")) break
    }
    const frame = tui.captureCharFrame()
    expect(frame).toContain("main → feature")
    expect(frame).toContain("1 ARQUIVOS")
    expect(frame).toContain("ARQUIVOS 1")
    expect(frame).toContain("feature.ts")
    expect(frame).toContain("[Tab/H/L/←/→] Árvore/diff")
    expect(tui.renderer.root.findDescendantById("git-compare-file-list")).not.toBeNull()
    expect(tui.renderer.root.findDescendantById("git-compare-shortcut-footer")?.zIndex).toBe(30)

    await act(async () => Bun.sleep(20))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-compare-file-list")
    const filesPanel = tui.renderer.root.findDescendantById(
      "git-compare-files-panel",
    ) as BoxRenderable
    const diffPanel = tui.renderer.root.findDescendantById("git-compare-diff") as BoxRenderable
    expect(renderableBorderSides(filesPanel).left).toBe(true)
    expect(renderableBorderSides(diffPanel).left).toBe(false)
    expect(filesPanel.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.git).toInts())
    await key("l")
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-compare-diff")
    expect(renderableBorderSides(filesPanel).left).toBe(false)
    expect(renderableBorderSides(diffPanel).left).toBe(true)
    expect(diffPanel.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.git).toInts())
    await key("h")
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-compare-file-list")
    act(() => tui?.mockInput.pressArrow("right"))
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-compare-diff")
    await key("tab")
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-compare-file-list")

    const wideLines = frame.split("\n")
    const wideProjectRow = wideLines.findIndex((line) => line.includes("PROJETO"))
    expect(wideLines.findIndex((line) => line.includes("BRANCH BASE"))).toBe(wideProjectRow)
    expect(wideLines.findIndex((line) => line.includes("BRANCH COMPARADA"))).toBe(wideProjectRow)

    await key("v")
    await key("v")
    const inlineFrame = tui.captureCharFrame()
    expect(inlineFrame).toContain("[V] Intralinha")
    expect(inlineFrame).toContain("ARQUIVOS 1")
    expect(inlineFrame).toContain("feature.ts")
    expect(inlineFrame).toContain("export const ready = true")

    act(() => tui?.resize(90, 36))
    await tui.renderOnce()
    const narrowFrame = tui.captureCharFrame()
    const narrowLines = narrowFrame.split("\n")
    const projectRow = narrowLines.findIndex((line) => line.includes("PROJETO"))
    const baseRow = narrowLines.findIndex((line) => line.includes("BRANCH BASE"))
    const comparedRow = narrowLines.findIndex((line) => line.includes("BRANCH COMPARADA"))
    expect(projectRow).toBeLessThan(baseRow)
    expect(baseRow).toBeLessThan(comparedRow)
    expect(narrowFrame).toContain("[Tab/H/L] Painel")
    expect(narrowFrame).toContain("[C/Esc] Diffs")
    expect((await loadLocalGitTarget(repository)).branch).toBe("feature")
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    rmSync(repository, { recursive: true, force: true })
  }
})

test("narrow PR view moves between list and preview with Vim keys", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 64, height: 18 })
  await tui.renderOnce()
  await key("2")

  expect(tui.captureCharFrame()).toContain("equipe/api #142")
  expect(tui.captureCharFrame()).not.toContain("ABERTO · main")
  await key("l")
  expect(tui.captureCharFrame()).toContain("equipe/api #142")
  expect(tui.captureCharFrame()).toContain("ABERTO · main")
  await key("]")
  expect(tui.captureCharFrame()).toContain("GitHub Actions")
  await key("]")
  expect(tui.captureCharFrame()).toContain("Comentário fictício")
  await key("]")
  expect(tui.captureCharFrame()).toContain("9ab13cd90e")
  await key("]")
  expect(tui.captureCharFrame()).toContain("PullRequestsWorkspace.tsx")
  await key("h")
  expect(tui.captureCharFrame()).toContain("equipe/api #142")
})

test("medium PR view stacks the list and preview without hiding either", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 90, height: 36 })
  await tui.renderOnce()
  await key("2")
  const frame = tui.captureCharFrame()
  expect(frame).toContain("equipe/api #142")
  expect(frame).toContain("ABERTO · main")
  expect(frame).toContain("Corrigir invalidação")
  const listPanel = tui.renderer.root.findDescendantById("git-pr-list-panel") as BoxRenderable
  const previewPanel = tui.renderer.root.findDescendantById("git-pr-preview-panel") as BoxRenderable
  expect(renderableBorderSides(listPanel)).toEqual({
    top: false,
    right: false,
    bottom: false,
    left: true,
  })
  expect(renderableBorderSides(previewPanel).left).toBe(false)
  expect(listPanel.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.git).toInts())

  await key("l")
  await tui.renderOnce()
  expect(renderableBorderSides(listPanel).left).toBe(false)
  expect(renderableBorderSides(previewPanel)).toEqual({
    top: false,
    right: false,
    bottom: false,
    left: true,
  })
  expect(previewPanel.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.git).toInts())
})

test("mouse reaches Git tabs, sections, rows, preview tabs and actions", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 32 })
  await tui.renderOnce()
  await click("git-tab-pr")
  expect(tui.captureCharFrame()).toContain("PULL REQUESTS · DEMO")
  await click("git-pr-section-1")
  expect(tui.captureCharFrame()).toContain("review-requested:@me")
  await click("git-pr-section-0")
  await click("git-pr-row-1")
  expect(tui.captureCharFrame()).toContain("▶ ● equipe/cli #55")
  await click("git-pr-preview-tab-checks")
  expect(tui.captureCharFrame()).toContain("GitHub Actions")
  await click("git-pr-open-actions")
  expect(tui.captureCharFrame()).toContain("AÇÕES DO PULL REQUEST")
})

test("PR dashboard survives the documented size, language, palette and layout matrix", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  const languages: LanguageId[] = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"]
  const sizes = [
    [40, 12],
    [60, 18],
    [80, 24],
    [120, 30],
    [160, 45],
    [220, 60],
  ] as const
  const palettes = Object.keys(PALETTES) as PaletteId[]
  const layouts: LayoutMode[] = ["framed", "compact"]
  const variants = [
    ...languages.flatMap((language, index) =>
      sizes.map(([width, height], sizeIndex) => ({
        language,
        width,
        height,
        palette: palettes[(index + sizeIndex) % palettes.length] ?? "prime",
        layout: layouts[(index + sizeIndex) % layouts.length] ?? "compact",
      })),
    ),
    ...palettes.flatMap((palette) =>
      layouts.map((layout) => ({
        language: "pt-BR" as const,
        width: 120,
        height: 30,
        palette,
        layout,
      })),
    ),
  ]
  for (const variant of variants) {
    updateUiSettings({
      language: variant.language,
      palette: variant.palette,
      layout: variant.layout,
    })
    const renderer = await testRender(<PullRequestsWorkspace active />, {
      width: variant.width,
      height: variant.height,
    })
    await renderer.renderOnce()
    const frame = renderer.captureCharFrame()
    expect(frame).toContain("PR")
    expect(frame).not.toContain("undefined")
    act(() => renderer.renderer.destroy())
  }
})

test("query editor applies explicitly and Escape follows the input focus stack", async () => {
  let applied = ""
  let closes = 0
  tui = await testRender(
    <SectionEditorModal
      open
      mode="query"
      initialTitle="Meus PRs"
      initialQuery=""
      onClose={() => {
        closes += 1
      }}
      onApply={(query) => {
        applied = query
      }}
      onSave={() => undefined}
    />,
    { width: 100, height: 28 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-pr-section-editor-query")
  await act(async () => tui?.mockInput.typeText("is:open   label:bug"))
  act(() => tui?.mockInput.pressEnter())
  await tui.renderOnce()
  expect(applied).toBe("is:open label:bug")
  await key("ESCAPE")
  expect(closes).toBe(0)
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-pr-section-editor-modal")
  await key("ESCAPE")
  expect(closes).toBe(1)
})

test("action input owns number keys and Escape unwinds one focus layer at a time", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 32 })
  await tui.renderOnce()
  await key("2")
  await key("c")
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()

  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-pr-action-input")
  await act(async () => tui?.mockInput.typeText("2 comentário"))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("COMENTAR")
  expect(tui.captureCharFrame()).toContain("2 comentário")
  expect(tui.captureCharFrame()).not.toContain("GIT · DIFFS\n")

  await key("ESCAPE")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-pr-action-modal")
  expect(tui.captureCharFrame()).toContain("COMENTAR")
  await key("ESCAPE")
  expect(tui.captureCharFrame()).not.toContain("NADA SERÁ EXECUTADO")
  expect(tui.captureCharFrame()).toContain("PULL REQUESTS · DEMO")
})

test("action menu and remote diff are navigable without leaving PR", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 32 })
  await tui.renderOnce()
  await key("2")
  await key("?")
  expect(tui.captureCharFrame()).toContain("AÇÕES DO PULL REQUEST")
  expect(tui.captureCharFrame()).toContain("[C] Comentar")
  await key("ESCAPE")

  await key("d")
  expect(tui.captureCharFrame()).toContain("DIFF · equipe/api #142")
  await waitForText("src/cache.ts")
  expect(tui.captureCharFrame()).toContain("src/cache.ts")
  await key("v")
  expect(tui.captureCharFrame()).toContain("SPLIT")
  await key("ESCAPE")
  expect(tui.captureCharFrame()).toContain("PULL REQUESTS · DEMO")
})
