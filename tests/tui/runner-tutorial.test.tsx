import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import {
  estimateTutorialTextHeight,
  getTutorialSteps,
  TutorialOverlay,
} from "../../apps/cli/src/tutorial/TutorialOverlay"
import { translateUi } from "../../packages/core/src/i18n/index"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import * as service from "../../packages/feature-runner/src/services/runner"
import * as storage from "../../packages/feature-runner/src/storage/runner-config"
import { RunnerTutorialDemo } from "../../packages/feature-runner/src/tutorial/RunnerTutorialDemo"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})

function element(id: string) {
  const value = tui?.renderer.root.findDescendantById(id)
  if (!value) throw new Error(`Missing ${id}\n${tui?.captureCharFrame()}`)
  return value
}

test.each([
  [160, 40, "framed", "pt-BR"],
  [100, 30, "compact", "en"],
  [80, 24, "framed", "ja"],
  [60, 20, "compact", "ru"],
] as const)(
  "all Runner targets are visible at %ix%i (%s, %s)",
  async (width, height, layout, language) => {
    updateUiSettings({ layout, language })
    let show = (_id: string) => {}
    function Host() {
      const [target, setTarget] = useState<string | null>(null)
      show = setTarget
      return <RunnerTutorialDemo activeTargetId={target} />
    }
    tui = await testRender(<Host />, { width, height })
    for (const step of getTutorialSteps("runner")) {
      await act(async () => show(step.targetId))
      await tui.renderOnce()
      const target = element(step.targetId)
      expect(target.visible, step.targetId).toBe(true)
      expect(target.width, step.targetId).toBeGreaterThan(0)
      expect(target.height, step.targetId).toBeGreaterThan(0)
      expect(target.screenX, step.targetId).toBeGreaterThanOrEqual(0)
      expect(target.screenY, step.targetId).toBeGreaterThanOrEqual(0)
      expect(target.screenX + target.width, step.targetId).toBeLessThanOrEqual(width)
      expect(target.screenY + target.height, step.targetId).toBeLessThanOrEqual(height)
    }
  },
  30_000,
)

test("Runner scenes show results and reset when going back", async () => {
  updateUiSettings({ language: "pt-BR", layout: "framed" })
  let show = (_id: string) => {}
  function Host() {
    const [target, setTarget] = useState<string | null>(null)
    show = setTarget
    return <RunnerTutorialDemo activeTargetId={target} />
  }
  tui = await testRender(<Host />, { width: 120, height: 32 })
  async function scene(name: string) {
    await act(async () => show(`tutorial-runner-${name}`))
    // Native scrollboxes settle their viewport after the scene layout changes.
    await act(async () => Bun.sleep(30))
    await tui?.renderOnce()
    return tui?.captureCharFrame() ?? ""
  }
  expect(await scene("running")).toContain("RODANDO")
  expect(await scene("stopped")).toContain("INTERROMPIDO")
  expect(await scene("filter")).toContain("GET /health")
  expect(tui.captureCharFrame()).not.toContain("cache warm")
  expect(await scene("logs")).toContain("cache warm")
  expect(await scene("history")).toContain("42 tests passed")
  expect(await scene("multi")).toContain("dev:web ready")
  expect(await scene("validation")).toContain("missing")
  expect(await scene("yaml")).not.toContain("missing")
  expect(await scene("flow-running")).toContain("bloqueado")
  expect(await scene("trust")).toContain("NODE_ENV")
  await scene("workspace")
  expect(tui.renderer.root.findDescendantById("tutorial-runner-trust")).toBeUndefined()
  expect(tui.renderer.root.findDescendantById("tutorial-runner-filter")).toBeUndefined()
})

test("the full tour advances, goes back, exits and reopens without live I/O", async () => {
  const spies = [
    spyOn(service, "resolveRunnerProjectContext"),
    spyOn(service, "discoverRunnerProjects"),
    spyOn(service, "startRunnerProcess"),
    spyOn(service, "discoverRunnerListeningPorts"),
    spyOn(service, "openRunnerUrl"),
    spyOn(storage, "loadRunnerStartupState"),
    spyOn(storage, "saveRunnerCommand"),
    spyOn(storage, "saveRunnerSession"),
    spyOn(storage, "exportRunnerLog"),
  ]
  const steps = getTutorialSteps("runner")
  const seen: string[] = []
  let reopen = () => {}
  function Host() {
    const [open, setOpen] = useState(true)
    const [target, setTarget] = useState<string | null>(null)
    reopen = () => {
      setTarget(null)
      setOpen(true)
    }
    return open ? (
      <>
        <Runner active={false} tutorial={{ targetId: target }} />
        <TutorialOverlay
          open
          steps={steps}
          onClose={() => setOpen(false)}
          onStepChange={(id) => {
            setTarget(id)
            if (id) seen.push(id)
          }}
        />
      </>
    ) : (
      <text content="closed" />
    )
  }
  try {
    tui = await testRender(<Host />, { width: 140, height: 36 })
    async function key(name: string) {
      await act(async () => {
        if (name === "enter") tui?.mockInput.pressEnter()
        else if (name === "left") tui?.mockInput.pressArrow("left")
        else tui?.mockInput.pressEscape()
      })
      await act(async () => Bun.sleep(320))
      await tui?.renderOnce()
    }
    await act(async () => Bun.sleep(200))
    await tui.renderOnce()
    for (let index = 1; index < steps.length; index++) {
      await key("enter")
      expect(seen.at(-1)).toBe(steps[index]?.targetId)
      expect(element(steps[index]?.targetId ?? "").width).toBeGreaterThan(0)
    }
    await key("left")
    expect(seen.at(-1)).toBe(steps.at(-2)?.targetId)
    await key("enter")
    await key("enter")
    expect(tui.captureCharFrame()).toContain("closed")
    await act(async () => reopen())
    await act(async () => Bun.sleep(200))
    await tui.renderOnce()
    expect(seen.at(-1)).toBe(steps[0]?.targetId)
    const target = element("tutorial-runner-workspace")
    await act(async () => tui?.mockMouse.click(target.screenX + 2, target.screenY))
    await act(async () => Bun.sleep(320))
    await tui.renderOnce()
    expect(seen.at(-1)).toBe(steps[1]?.targetId)
    await key("escape")
    expect(tui.captureCharFrame()).toContain("closed")
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
}, 60_000)

test("long translated explanations fit the card after resizing", async () => {
  updateUiSettings({ language: "ru" })
  const step = getTutorialSteps("runner").find(
    (entry) => entry.targetId === "tutorial-runner-trust",
  )
  if (!step) throw new Error("Missing trust step")
  tui = await testRender(
    <>
      <RunnerTutorialDemo activeTargetId={step.targetId} />
      <TutorialOverlay open steps={[step]} onClose={() => {}} />
    </>,
    { width: 100, height: 30 },
  )
  await act(async () => Bun.sleep(350))
  await tui.renderOnce()
  await act(async () => tui?.resize(60, 20))
  await act(async () => Bun.sleep(350))
  await tui.renderOnce()
  const description = element("tutorial-description")
  const needed = estimateTutorialTextHeight(
    translateUi(step.description),
    description.width,
    1,
    100,
  )
  expect(description.height).toBeGreaterThanOrEqual(needed)
  expect(description.screenY + description.height).toBeLessThan(20)
  expect(tui.captureCharFrame()).toContain("приостанавливает")
  expect(tui.captureCharFrame()).toContain("автозапуск.")
})
