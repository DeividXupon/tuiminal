import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { TutorialOverlay } from "../../apps/cli/src/tutorial/TutorialOverlay"
import { translateUi } from "../../packages/core/src/i18n/index"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { GitViewer, GIT_TUTORIAL_STEPS } from "../../packages/feature-git/src"
import { GIT_REMOTE_TUTORIAL_STEPS } from "../../packages/feature-git/src/tutorial/remote-steps"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

function expectVisible(id: string, width: number, height: number) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}\n${tui?.captureCharFrame()}`)
  expect(target.visible).toBe(true)
  expect(target.width).toBeGreaterThan(0)
  expect(target.height).toBeGreaterThan(0)
  expect(target.screenX).toBeGreaterThanOrEqual(0)
  expect(target.screenY).toBeGreaterThanOrEqual(0)
  expect(target.screenX + target.width).toBeLessThanOrEqual(width)
  expect(target.screenY + target.height).toBeLessThanOrEqual(height)
}

test.each([
  [140, 40, "pt-BR", "framed"],
  [120, 30, "en", "compact"],
  [80, 24, "es", "framed"],
  [60, 24, "ja", "compact"],
  [80, 24, "zh-CN", "compact"],
  [60, 24, "ko", "framed"],
  [80, 24, "ru", "framed"],
] as const)(
  "remote tour targets remain visible at %ix%i in %s (%s)",
  async (width, height, language, layout) => {
    updateUiSettings({ language, layout })
    let show: (target: string | null) => void = () => {}
    function Demo() {
      const [target, setTarget] = useState<string | null>(null)
      show = setTarget
      return <GitViewer active tutorialMode tutorialTargetId={target} />
    }
    tui = await testRender(<Demo />, { width, height })
    for (const step of GIT_REMOTE_TUTORIAL_STEPS) {
      await act(async () => show(step.targetId))
      await tui.renderOnce()
      expectVisible(step.targetId, width, height)
      const frame = tui.captureCharFrame()
      expect(frame).toContain("@demo")
      expect(frame).not.toContain("undefined")
      if (step.view === "checks") expect(frame).toContain("GitHub Actions")
      if (step.view === "activity") expect(frame).toContain("@alex")
      if (step.view === "commits") expect(frame).toContain("ac0d327c51")
      if (step.view === "files") expect(frame).toContain("cache.delete(key)")
      if (step.view === "create") expect(frame).toContain("[Ctrl+S]")
      if (step.view === "save") expect(frame).toContain("★")
      if (step.tab === "inbox" && step.view === "list") expect(frame).toContain("▶ ○")
    }
    await act(async () => show(null))
    await tui.renderOnce()
    expectVisible("tutorial-git-files", width, height)
    expect(tui.renderer.root.findDescendantById("tutorial-git-inbox-unsubscribe")).toBeUndefined()
  },
  60_000,
)

async function waitForFrame(text: string) {
  for (let attempt = 0; attempt < 80; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (tui?.captureCharFrame().includes(text)) return
  }
  throw new Error(`Missing ${text}\n${tui?.captureCharFrame()}`)
}

test("the full tour discovers all steps, enters each remote scene and restores previous states", async () => {
  updateUiSettings({ language: "pt-BR", layout: "compact" })
  const steps = [...GIT_TUTORIAL_STEPS]
  let closed = false
  function Tour() {
    const [target, setTarget] = useState<string | null>(null)
    return (
      <box style={{ flexGrow: 1 }}>
        <GitViewer active tutorialMode tutorialTargetId={target} />
        <TutorialOverlay
          open
          steps={steps}
          onStepChange={setTarget}
          onClose={() => {
            closed = true
          }}
        />
      </box>
    )
  }
  tui = await testRender(<Tour />, { width: 140, height: 40 })
  await waitForFrame(`1/${steps.length}`)
  const advance = async (key: "right" | "left", index: number) => {
    await act(async () => tui?.mockInput.pressArrow(key))
    await waitForFrame(translateUi(steps[index]?.title ?? ""))
    // The overlay intentionally finishes its fade before accepting the next key.
    await act(async () => Bun.sleep(280))
    await tui?.renderOnce()
    expect(tui?.captureCharFrame()).toContain(`${index + 1}/${steps.length}`)
    expectVisible(steps[index]?.targetId ?? "", 140, 40)
  }
  for (let index = 1; index < steps.length; index++) {
    await advance("right", index)
    if ([28, 39, 46].includes(index)) {
      await advance("left", index - 1)
      await advance("right", index)
    }
  }
  await advance("left", steps.length - 2)
  expect(tui.renderer.root.findDescendantById("tutorial-git-inbox-unsubscribe")).toBeUndefined()
  await act(async () => tui?.mockInput.pressKey("s", { ctrl: true }))
  expect(closed).toBe(false)
  expectVisible("tutorial-git-inbox-done", 140, 40)
  await act(async () => tui?.mockInput.pressEscape())
  await act(async () => Bun.sleep(30))
  expect(closed).toBe(true)
}, 60_000)
