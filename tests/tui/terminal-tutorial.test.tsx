import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { EmbeddedTerminalRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getTutorialSteps, TutorialOverlay } from "../../apps/cli/src/tutorial/TutorialOverlay"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import * as processes from "../../packages/feature-terminal/src/services/terminal"
import { TermAgents } from "../../packages/feature-terminal/src/TerminalWorkspace"
import { TerminalTutorialDemo } from "../../packages/feature-terminal/src/tutorial/TerminalTutorialDemo"

let tui: TestRendererSetup | undefined
const originalSettings = getUiSettings()

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(originalSettings)
})

function expectVisible(id: string, width: number, height: number) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}\n${tui?.captureCharFrame()}`)
  expect(target.visible).toBe(true)
  expect(target.width).toBeGreaterThan(0)
  expect(target.height).toBeGreaterThan(0)
  expect(target.screenX).toBeGreaterThanOrEqual(0)
  expect(target.screenY).toBeGreaterThanOrEqual(0)
  expect(target.screenX).toBeLessThan(width)
  expect(target.screenY).toBeLessThan(height)
}

async function waitForTerminalContextLayout(terminal: EmbeddedTerminalRenderable) {
  const sessionId = terminal.id.replace("term-agents-", "")
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    const frame = tui?.renderer.root.findDescendantById(`terminal-pane-frame-${sessionId}`)
    const context = tui?.renderer.root.findDescendantById(`terminal-context-${sessionId}`)
    if (frame && context && context.height > 0 && terminal.height === frame.height - context.height)
      return
  }
  throw new Error("Terminal context layout did not settle")
}

test.each([
  [160, 45, "pt-BR"],
  [100, 30, "en"],
  [80, 24, "ja"],
] as const)(
  "every Terminal tour step paints its target at %ix%i (%s)",
  async (width, height, language) => {
    updateUiSettings({ language, terminalMasterKey: "Ctrl+B" })
    let show: (id: string | null) => void = () => undefined
    function Demo() {
      const [target, setTarget] = useState<string | null>(null)
      show = setTarget
      return <TerminalTutorialDemo activeTargetId={target} />
    }
    tui = await testRender(<Demo />, { width, height })
    await tui.renderOnce()
    const steps = getTutorialSteps("terminal")
    for (const step of steps.filter((entry) => !entry.stateful))
      expectVisible(step.targetId, width, height)
    for (const step of steps) {
      await act(async () => show(step.targetId))
      await tui.renderOnce()
      expectVisible(step.targetId, width, height)
    }
    expect(tui.captureCharFrame()).not.toContain("undefined")
  },
  30_000,
)

test("the tour locks every Terminal step and walks from the basics to the advanced view", async () => {
  updateUiSettings({ language: "pt-BR", terminalMasterKey: "Ctrl+B" })
  const steps = getTutorialSteps("terminal")
  const seen: string[] = []
  function Tour() {
    const [target, setTarget] = useState<string | null>(null)
    return (
      <>
        <box style={{ flexGrow: 1 }}>
          <TerminalTutorialDemo activeTargetId={target} />
        </box>
        <TutorialOverlay
          open
          steps={steps}
          onClose={() => undefined}
          onStepChange={(id) => {
            setTarget(id)
            if (id) seen.push(id)
          }}
        />
      </>
    )
  }
  tui = await testRender(<Tour />, { width: 140, height: 40 })
  await act(async () => Bun.sleep(200))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain(`1/${steps.length}`)
  for (let index = 1; index < steps.length; index++) {
    await act(async () => {
      tui?.mockInput.pressEnter()
      await Bun.sleep(320)
    })
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain(`${index + 1}/${steps.length}`)
  }
  // Before the first layout pass only stateful steps are measurable, so ignore that probe.
  const walked = seen.slice(seen.indexOf(steps[0]?.targetId ?? ""))
  expect(walked.filter((id, index) => walked[index - 1] !== id)).toEqual(
    steps.map((step) => step.targetId),
  )
}, 90_000)

test("the tour paints over live terminals without input, relaunch or resize", async () => {
  updateUiSettings({ language: "pt-BR", terminalMasterKey: "Ctrl+B", layout: "framed" })
  const writes: string[] = []
  const resizes: Array<[number, number]> = []
  let starts = 0
  let stops = 0
  const spawn = spyOn(processes, "startTermAgentsProcess").mockImplementation(() => {
    starts += 1
    return {
      pid: 900,
      write: (data) =>
        writes.push(typeof data === "string" ? data : new TextDecoder().decode(data)),
      resize: (columns, rows) => resizes.push([columns, rows]),
      stop: async () => {
        stops += 1
      },
    }
  })
  let setTutorial: (open: boolean) => void = () => undefined
  function Host() {
    const [tutorial, setOpen] = useState(false)
    setTutorial = setOpen
    return (
      <>
        <TermAgents
          active={!tutorial}
          tutorial={tutorial ? { targetId: "tutorial-terminal-live-diff" } : null}
        />
        {tutorial && (
          <TutorialOverlay
            open
            steps={getTutorialSteps("terminal")}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    )
  }
  try {
    tui = await testRender(<Host />, { width: 120, height: 30 })
    await tui.renderOnce()
    await act(async () => {
      tui?.mockInput.pressKey("b", { ctrl: true })
    })
    await tui.renderOnce()
    await act(async () => tui?.mockInput.pressKey("n"))
    await tui.renderOnce()
    const terminal = tui.renderer.currentFocusedRenderable as EmbeddedTerminalRenderable
    await waitForTerminalContextLayout(terminal)
    const size = { width: terminal.width, height: terminal.height }
    expect(starts).toBe(1)
    const resizeCount = resizes.length

    await act(async () => setTutorial(true))
    await tui.renderOnce()
    expect(tui.renderer.root.findDescendantById("tutorial-terminal-live-diff")).toBeDefined()
    expect(tui.captureCharFrame()).toContain("lojinha")
    await act(async () => tui?.mockInput.typeText("ls"))
    await tui.renderOnce()

    await act(async () => setTutorial(false))
    await tui.renderOnce()
    expect(tui.renderer.root.findDescendantById("tutorial-terminal-workspace")).toBeUndefined()
    expect(tui.renderer.root.findDescendantById(terminal.id)).toBe(terminal)
    expect({ width: terminal.width, height: terminal.height }).toEqual(size)
    expect(resizes.length).toBe(resizeCount)
    expect(writes).toEqual([])
    expect(starts).toBe(1)
    expect(stops).toBe(0)
  } finally {
    spawn.mockRestore()
  }
})
