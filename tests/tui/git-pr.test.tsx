import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../src/app/App"
import {
  getUiSettings,
  type LayoutMode,
  type PaletteId,
  updateUiSettings,
} from "../../src/core/settings/theme"
import { GitViewer } from "../../src/features/git"
import { PullRequestsWorkspace } from "../../src/features/git/PullRequestsWorkspace"
import { RepositorySetupModal } from "../../src/features/git/ui/pr/RepositorySetupModal"
import { SectionEditorModal } from "../../src/features/git/ui/pr/SectionEditorModal"
import { SectionManagerModal } from "../../src/features/git/ui/pr/SectionManagerModal"
import type { LanguageId } from "../../src/shared/i18n"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const initialDemoMode = process.env.TUIMINAL_GIT_PR_DEMO
const initialOnlyTab = process.env.TUIMINAL_ONLY_TAB

async function key(
  name: string,
  options: { shift?: boolean; ctrl?: boolean; option?: boolean } = {},
) {
  act(() => tui?.mockInput.pressKey(name, options))
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

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
  if (initialDemoMode === undefined) delete process.env.TUIMINAL_GIT_PR_DEMO
  else process.env.TUIMINAL_GIT_PR_DEMO = initialDemoMode
  if (initialOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = initialOnlyTab
})

test("isolated Git starts on offline Base outside a repository and can enter PR", async () => {
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

test("Git opens on Base, lazy mounts PR and preserves both tab states", async () => {
  process.env.TUIMINAL_GIT_PR_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 32 })
  await tui.renderOnce()

  expect(tui.captureCharFrame()).toContain("[1] GIT · BASE LOCAL")
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
  const palettes: PaletteId[] = ["prime", "midnight", "nord", "gruvbox"]
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

test("repository modal unfocuses its input before Escape closes it", async () => {
  let closes = 0
  tui = await testRender(
    <RepositorySetupModal
      open
      root={process.cwd()}
      host="github.com"
      onClose={() => {
        closes += 1
      }}
      onSaved={() => undefined}
    />,
    { width: 100, height: 28 },
  )
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => Bun.sleep(5))
    await tui.renderOnce()
    if (tui.renderer.currentFocusedRenderable?.id === "git-pr-repository-input") break
  }
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-pr-repository-input")
  await key("ESCAPE")
  expect(closes).toBe(0)
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-pr-repository-modal")
  await key("ESCAPE")
  expect(closes).toBe(1)
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

test("section manager exposes section and repository actions by keyboard", async () => {
  let created = 0
  let addedRepository = 0
  let removedRepository = ""
  tui = await testRender(
    <SectionManagerModal
      open
      sections={[{ id: "mine", title: "Meus PRs", query: "is:open author:@me" }]}
      repositories={["team/api"]}
      onClose={() => undefined}
      onCreate={() => {
        created += 1
      }}
      onEdit={() => undefined}
      onDuplicate={() => undefined}
      onMove={() => undefined}
      onDelete={() => undefined}
      onAddRepository={() => {
        addedRepository += 1
      }}
      onRemoveRepository={(repository) => {
        removedRepository = repository
      }}
    />,
    { width: 110, height: 30 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  await key("n")
  expect(created).toBe(1)
  await key("2")
  await key("+")
  expect(addedRepository).toBe(1)
  await key("x")
  expect(removedRepository).toBe("")
  expect(tui.captureCharFrame()).toContain("novamente")
  await key("x")
  expect(removedRepository).toBe("team/api")
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
  expect(tui.captureCharFrame()).not.toContain("GIT · BASE LOCAL\n")

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
  expect(tui.captureCharFrame()).toContain("src/cache.ts")
  await key("v")
  expect(tui.captureCharFrame()).toContain("SPLIT")
  await key("ESCAPE")
  expect(tui.captureCharFrame()).toContain("PULL REQUESTS · DEMO")
})
