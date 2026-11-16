import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import {
  getDefaultShortcuts,
  setToolShortcuts,
  validateShortcuts,
} from "../../packages/core/src/keyboard/bindings"
import { RunnerSaveCommandModal } from "../../packages/feature-runner/src/ui/RunnerSaveCommandModal"
import { SectionEditorModal } from "../../packages/feature-git/src/ui/pr/SectionEditorModal"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const tool of ["runner", "git"] as const) setToolShortcuts(tool, getDefaultShortcuts(tool))
})

async function settle() {
  await act(async () => {
    await Bun.sleep(20)
  })
  await tui?.renderOnce()
}

test("Runner save dialog remaps PTY and save controls while its name input owns focus", async () => {
  setToolShortcuts(
    "runner",
    validateShortcuts("runner", {
      "save-command-modal": { "Ctrl+p": "F8", "Ctrl+s": "F9" },
    }),
  )
  const saved: Array<{ label: string; command: string; interactive: boolean }> = []
  tui = await testRender(
    <RunnerSaveCommandModal
      open
      command="echo fixture"
      availableWidth={120}
      onClose={() => {}}
      onSave={(value) => saved.push(value)}
    />,
    { width: 120, height: 32 },
  )
  await settle()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-save-command-name")
  expect(tui.captureCharFrame()).toContain("[F8]")
  await act(async () => {
    await tui?.mockInput.typeText("Custom command")
  })
  await act(async () => {
    await tui?.mockInput.pressKey("F8")
  })
  await settle()
  await act(async () => {
    await tui?.mockInput.pressKey("F9")
  })
  await settle()
  expect(saved).toEqual([{ label: "Custom command", command: "echo fixture", interactive: true }])
})

test.each([false, true])(
  "Git section editor honors configured save both standalone and embedded (%s)",
  async (embedded) => {
    setToolShortcuts(
      "git",
      validateShortcuts("git", {
        "configuration-section-editor": { "Ctrl+s": "F8" },
      }),
    )
    const saved: string[] = []
    tui = await testRender(
      <SectionEditorModal
        open
        embedded={embedded}
        mode="edit"
        initialTitle="Custom section"
        initialQuery="is:open"
        onClose={() => {}}
        onApply={() => {}}
        onSave={(value) => saved.push(value.title)}
      />,
      { width: 120, height: 32 },
    )
    await settle()
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-pr-section-editor-title")
    expect(tui.captureCharFrame()).toContain("[F8]")
    await act(async () => {
      await tui?.mockInput.pressKey("F8")
    })
    await settle()
    expect(saved).toEqual(["Custom section"])
  },
)
