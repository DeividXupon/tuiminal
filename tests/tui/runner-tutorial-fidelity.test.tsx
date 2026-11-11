import "./setup"
import { expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import * as service from "../../packages/feature-runner/src/services/runner"
import * as storage from "../../packages/feature-runner/src/storage/runner-config"
import {
  TUTORIAL_COMMANDS,
  TUTORIAL_ROOT,
} from "../../packages/feature-runner/src/tutorial/fixtures"
import { RunnerTutorialDemo } from "../../packages/feature-runner/src/tutorial/RunnerTutorialDemo"

// Compare independently mounted live and tutorial trees, including native cell colors.
// The live Runner gets synthetic discovery data; it still owns its real layout and focus.
test.each([
  [120, 36, "framed", "pt-BR"],
  [100, 30, "compact", "en"],
  [60, 24, "framed", "ja"],
  [60, 20, "compact", "ru"],
] as const)(
  "tutorial matches the live Runner at %ix%i (%s, %s)",
  async (width, height, layout, language) => {
    const settings = getUiSettings()
    const spies = [
      spyOn(service, "resolveRunnerSessionScope").mockReturnValue(TUTORIAL_ROOT),
      spyOn(service, "resolveRunnerProjectContext").mockResolvedValue({
        root: TUTORIAL_ROOT,
        commands: TUTORIAL_COMMANDS,
        flows: [],
        environmentProfiles: [{ id: "local", label: "local" }],
      }),
      spyOn(storage, "loadRunnerStartupState").mockReturnValue({
        session: {
          openedProjects: [],
          activeProject: null,
          viewMode: "single",
          environmentProfiles: {},
        },
        history: [],
      }),
      spyOn(storage, "saveRunnerSession").mockImplementation(() => {}),
    ]
    let live: TestRendererSetup | undefined
    let demo: TestRendererSetup | undefined
    try {
      updateUiSettings({ layout, language })
      live = await testRender(<Runner active />, { width, height })
      for (
        let i = 0;
        i < 100 && live.renderer.currentFocusedRenderable?.id !== "runner-command-list";
        i++
      ) {
        await act(async () => Bun.sleep(10))
        await live.renderOnce()
      }
      expect(live.renderer.currentFocusedRenderable?.id).toBe("runner-command-list")
      // The tour card owns native focus, so compare the same unfocused controls.
      act(() => live?.renderer.currentFocusedRenderable?.blur())
      await live.renderOnce()
      const expected = live.captureCharFrame()
      const expectedSpans = live.captureSpans()
      act(() => live?.renderer.destroy())
      live = undefined
      demo = await testRender(<RunnerTutorialDemo activeTargetId="tutorial-runner-workspace" />, {
        width,
        height,
      })
      for (let i = 0; i < 30 && demo.captureCharFrame() !== expected; i++) {
        await act(async () => Bun.sleep(10))
        await demo.renderOnce()
      }
      expect(demo.captureCharFrame()).toBe(expected)
      expect(demo.captureSpans()).toEqual(expectedSpans)
    } finally {
      act(() => {
        live?.renderer.destroy()
        demo?.renderer.destroy()
      })
      for (const spy of spies) spy.mockRestore()
      updateUiSettings(settings)
    }
  },
)

test("the Multi tutorial uses the live one-pane window and overflow rail on narrow terminals", async () => {
  const settings = getUiSettings()
  let demo: TestRendererSetup | undefined
  try {
    updateUiSettings({ layout: "compact", language: "pt-BR" })
    demo = await testRender(<RunnerTutorialDemo activeTargetId="tutorial-runner-multi" />, {
      width: 60,
      height: 20,
    })
    await demo.renderOnce()
    expect(demo.captureCharFrame()).toContain("1–1/2")
    expect(demo.captureCharFrame()).toContain("+1")
    expect(demo.renderer.root.findDescendantById("runner-multi-tutorial-dev:api")).toBeDefined()
    expect(demo.renderer.root.findDescendantById("runner-multi-tutorial-dev:web")).toBeUndefined()
    await act(async () => demo?.resize(120, 36))
    await demo.renderOnce()
    expect(demo.captureCharFrame()).toContain("1–2/2")
    expect(demo.renderer.root.findDescendantById("runner-multi-tutorial-dev:web")).toBeDefined()
  } finally {
    act(() => demo?.renderer.destroy())
    updateUiSettings(settings)
  }
})
