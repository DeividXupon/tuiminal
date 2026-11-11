import "./setup"
import { expect, spyOn, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { App } from "../../apps/cli/src/App"
import { getTutorialSteps, TutorialOverlay } from "../../apps/cli/src/tutorial/TutorialOverlay"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import { activeProcesses } from "../../packages/feature-runner/src/services/process-registry"
import * as service from "../../packages/feature-runner/src/services/runner"

async function settle(tui: TestRendererSetup, until: () => boolean) {
  for (let attempt = 0; attempt < 150; attempt++) {
    await act(async () => Bun.sleep(20))
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(`Runner did not settle:\n${tui.captureCharFrame()}`)
}

test("the tour preserves an owned running process, command selection and live renderables", async () => {
  const root = mkdtempSync(join(tmpdir(), "runner-tour-"))
  const before = new Set(activeProcesses)
  const owned = () => [...activeProcesses].filter((handle) => !before.has(handle))
  writeFileSync(join(root, "untouched.txt"), "project sentinel")
  const discovery = spyOn(service, "resolveRunnerProjectContext").mockResolvedValue({
    root,
    flows: [],
    environmentProfiles: [],
    commands: [
      {
        ...service.createShellRunnerCommand("tutorial fixture", { id: "tutorial-fixture" }),
        program: process.execPath,
        args: ["-e", 'console.log("tour-process-ready"); setInterval(() => {}, 1000)'],
        workingDirectory: root,
      },
    ],
  })
  let tui: TestRendererSetup | undefined
  let open = () => {}
  function Host() {
    const [tour, setTour] = useState(false)
    const [target, setTarget] = useState<string | null>(null)
    open = () => setTour(true)
    return (
      <>
        <Runner active={!tour} tutorial={tour ? { targetId: target } : null} />
        {tour && (
          <TutorialOverlay
            open
            steps={getTutorialSteps("runner")}
            onClose={() => setTour(false)}
            onStepChange={setTarget}
          />
        )}
      </>
    )
  }
  try {
    tui = await testRender(<Host />, { width: 120, height: 32 })
    const view = tui
    await settle(view, () => view.renderer.currentFocusedRenderable?.id === "runner-command-list")
    const list = view.renderer.root.findDescendantById("runner-command-list")
    await act(async () => view.mockInput.pressEnter())
    await settle(
      view,
      () => owned().length === 1 && view.captureCharFrame().includes("tour-process-ready"),
    )
    const processHandle = owned()[0]
    if (!processHandle) throw new Error("Missing owned process")
    const log = view.renderer.root.findDescendantById("runner-log-scroll")
    const discoveryCount = discovery.mock.calls.length
    await act(async () => view.mockInput.pressKey("/"))
    await settle(view, () => view.renderer.currentFocusedRenderable?.id === "runner-command-input")
    await act(async () => view.mockInput.typeText("echo keep-draft"))
    const draft = view.renderer.root.findDescendantById("runner-command-input")
    if (!(draft instanceof InputRenderable)) throw new Error("Missing manual command input")
    const draftValue = draft.value
    await act(async () => open())
    await settle(view, () => view.captureCharFrame().includes("Bem-vindo ao Runner"))
    for (const key of [" ", "p", "m", "n", "d"]) {
      await act(async () => view.mockInput.pressKey(key))
      await view.renderOnce()
    }
    await act(async () => view.mockInput.pressKey("s", { ctrl: true }))
    await act(async () => view.mockInput.pressKey("y", { ctrl: true }))
    expect(owned()).toEqual([processHandle])
    expect(discovery.mock.calls.length).toBe(discoveryCount)
    expect(view.renderer.root.findDescendantById("runner-config-editor")).toBeUndefined()
    expect(view.renderer.root.findDescendantById("runner-save-command-modal")).toBeUndefined()
    await act(async () => view.mockInput.pressEscape())
    await settle(view, () => !view.renderer.root.findDescendantById("tutorial-runner-workspace"))
    expect(view.renderer.root.findDescendantById("runner-command-list")).toBe(list)
    expect(view.renderer.root.findDescendantById("runner-log-scroll")).toBe(log)
    expect(view.renderer.root.findDescendantById("runner-command-input")).toBe(draft)
    expect(draft.value).toBe(draftValue)
    expect(owned()).toEqual([processHandle])
    expect(view.captureCharFrame()).toContain("tour-process-ready")
    expect(readFileSync(join(root, "untouched.txt"), "utf8")).toBe("project sentinel")
    expect(readdirSync(root)).toEqual(["untouched.txt"])
    await settle(view, () => view.renderer.currentFocusedRenderable?.id === "runner-command-list")
  } finally {
    await act(async () => {
      tui?.renderer.destroy()
      await Promise.all(owned().map((handle) => handle.stop()))
    })
    discovery.mockRestore()
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000)

test.each([false, true])(
  "Runner settings opens and closes its own tutorial (isolated: %s)",
  async (isolated) => {
    const previous = {
      only: process.env.TUIMINAL_ONLY_TAB,
      initial: process.env.TUIMINAL_INITIAL_TAB,
    }
    if (isolated) process.env.TUIMINAL_ONLY_TAB = "runner"
    else delete process.env.TUIMINAL_ONLY_TAB
    process.env.TUIMINAL_INITIAL_TAB = "runner"
    let tui: TestRendererSetup | undefined
    try {
      tui = await testRender(<App />, { width: 120, height: 34 })
      const view = tui
      async function click(id: string) {
        const target = view.renderer.root.findDescendantById(id)
        if (!target) throw new Error(`Missing ${id}\n${view.captureCharFrame()}`)
        await act(async () => view.mockMouse.click(target.screenX + 1, target.screenY))
        await view.renderOnce()
      }
      await settle(view, () =>
        Boolean(view.renderer.root.findDescendantById("runner-command-list")),
      )
      const list = view.renderer.root.findDescendantById("runner-command-list")
      await click("tutorial-settings-button")
      await click("configuration-section-tutorial")
      await click("configuration-start-tutorial")
      await settle(view, () =>
        Boolean(view.renderer.root.findDescendantById("tutorial-runner-workspace")),
      )
      expect(view.captureCharFrame()).toContain("Bem-vindo ao Runner")
      expect(view.renderer.root.findDescendantById("tutorial-db-catalog")).toBeUndefined()
      expect(view.renderer.root.findDescendantById("tutorial-terminal-workspace")).toBeUndefined()
      await act(async () => view.mockInput.pressEscape())
      await settle(view, () => !view.renderer.root.findDescendantById("tutorial-runner-workspace"))
      expect(view.renderer.root.findDescendantById("runner-command-list")).toBe(list)
    } finally {
      act(() => tui?.renderer.destroy())
      if (previous.only === undefined) delete process.env.TUIMINAL_ONLY_TAB
      else process.env.TUIMINAL_ONLY_TAB = previous.only
      if (previous.initial === undefined) delete process.env.TUIMINAL_INITIAL_TAB
      else process.env.TUIMINAL_INITIAL_TAB = previous.initial
    }
  },
  30_000,
)
