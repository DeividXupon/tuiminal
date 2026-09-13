import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../src/core/settings/theme"
import { IssueSectionEditorModal } from "../../src/features/git/ui/issue/IssueSectionEditorModal"
import { SectionEditorModal } from "../../src/features/git/ui/pr/SectionEditorModal"

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
