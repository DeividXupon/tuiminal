import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { IssueSectionEditorModal } from "../../packages/feature-git/src/ui/issue/IssueSectionEditorModal"
import { SectionEditorModal } from "../../packages/feature-git/src/ui/pr/SectionEditorModal"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})

test.each(["pr", "issue"] as const)(
  "%s query keeps an unfinished quote editable in its modal",
  async (kind) => {
    updateUiSettings({ language: "pt-BR" })
    const applied: string[] = []
    const saved: string[] = []
    const props = {
      mode: "query" as const,
      initialTitle: "Fixture",
      initialQuery: '"unfinished',
      onClose: () => {},
      onApply: (query: string) => applied.push(query),
      onSave: (values: { query: string }) => saved.push(values.query),
    }
    tui = await testRender(
      kind === "pr" ? (
        <SectionEditorModal {...props} open />
      ) : (
        <IssueSectionEditorModal {...props} />
      ),
      { width: 100, height: 30 },
    )
    await act(async () => Bun.sleep(5))
    await tui.renderOnce()
    const input = tui.renderer.root.findDescendantById(
      `git-${kind}-section-editor-query`,
    ) as InputRenderable
    expect(tui.renderer.currentFocusedRenderable).toBe(input)
    await act(async () => tui?.mockInput.pressEnter())
    await tui.renderOnce()
    expect(applied).toEqual([])
    expect(tui.captureCharFrame()).toContain("Feche as aspas na query do GitHub.")
    expect(input.value).toBe('"unfinished')
    expect(tui.renderer.currentFocusedRenderable).toBe(input)
    await act(async () => tui?.mockInput.pressKey("s", { ctrl: true }))
    expect(saved).toEqual([])
    await act(async () => {
      await tui?.mockInput.pressKey("END")
      await tui?.mockInput.typeText('"')
      await tui?.mockInput.pressEnter()
    })
    expect(applied).toEqual(['"unfinished"'])
    await act(async () => tui?.mockInput.pressKey("s", { ctrl: true }))
    expect(saved).toEqual(['"unfinished"'])
  },
)

test.each(["pr", "issue"] as const)(
  "%s query editor closes on its backdrop but not on an input click",
  async (kind) => {
    let closes = 0
    const props = {
      mode: "query" as const,
      initialTitle: "Fixture",
      initialQuery: "is:open",
      onClose: () => {
        closes += 1
      },
      onApply: () => {},
      onSave: () => {},
    }
    tui = await testRender(
      kind === "pr" ? (
        <SectionEditorModal {...props} open />
      ) : (
        <IssueSectionEditorModal {...props} />
      ),
      { width: 100, height: 30 },
    )
    await act(async () => Bun.sleep(5))
    await tui.renderOnce()
    const input = tui.renderer.root.findDescendantById(`git-${kind}-section-editor-query`)
    if (!input) throw new Error("Query input did not mount")
    await act(async () => tui?.mockMouse.click(input.screenX + 2, input.screenY))
    expect(closes).toBe(0)
    await act(async () => tui?.mockMouse.click(99, 0))
    expect(closes).toBe(1)
  },
)

test.each(["pr", "issue"] as const)(
  "%s section creation shares field focus and saves tool-specific columns",
  async (kind) => {
    let closes = 0
    const saved: Array<{
      title: string
      query: string
      columns: readonly string[]
      sort: string
      limit: number
    }> = []
    const props = {
      mode: "create" as const,
      initialTitle: "My Team",
      initialQuery: "is:open",
      onClose: () => {
        closes += 1
      },
      onApply: () => {},
      onSave: (values: (typeof saved)[number]) => saved.push(values),
    }
    tui = await testRender(
      kind === "pr" ? (
        <SectionEditorModal {...props} open />
      ) : (
        <IssueSectionEditorModal {...props} />
      ),
      { width: 100, height: 30 },
    )
    await act(async () => Bun.sleep(5))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe(`git-${kind}-section-editor-title`)
    act(() => tui?.mockInput.pressTab())
    expect(tui.renderer.currentFocusedRenderable?.id).toBe(`git-${kind}-section-editor-query`)
    act(() => tui?.mockInput.pressEscape())
    await act(async () => Bun.sleep(60))
    await tui.renderOnce()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe(`git-${kind}-section-editor-modal`)
    expect(closes).toBe(0)
    await act(async () => tui?.mockInput.pressKey("s", { ctrl: true }))
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      title: "My Team",
      query: "is:open",
      sort: "updated-desc",
      limit: 20,
    })
    expect(saved[0]?.columns).toContain(kind === "pr" ? "ci" : "reactions")
    act(() => tui?.mockInput.pressEscape())
    await act(async () => Bun.sleep(60))
    expect(closes).toBe(1)
  },
)
