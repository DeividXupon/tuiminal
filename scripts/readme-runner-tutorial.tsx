import { act, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import type { TestRendererSetup } from "@opentui/core/testing"
import { TutorialOverlay } from "../apps/cli/src/tutorial/TutorialOverlay"
import { Runner } from "../packages/feature-runner/src"
import { RUNNER_TUTORIAL_STEPS } from "../packages/feature-runner/src/tutorial/steps"
import { COLORS } from "../packages/core/src/settings/theme"

/** Called only after the README generator has isolated project and settings paths. */
export async function runnerTutorialFrames<Frame>(
  snapshot: (tui: TestRendererSetup, caption: string, focus?: string, delay?: number) => Frame,
  width: number,
  height: number,
): Promise<Frame[]> {
  function Tour() {
    const [targetId, setTargetId] = useState<string | null>(null)
    return (
      <>
        <Runner active={false} tutorial={{ targetId }} />
        <TutorialOverlay
          open
          steps={RUNNER_TUTORIAL_STEPS.map((step) => ({ ...step, accent: COLORS.runner }))}
          onClose={() => {}}
          onStepChange={setTargetId}
        />
      </>
    )
  }
  const tui = await testRender(<Tour />, { width, height })
  try {
    await act(async () => Bun.sleep(350))
    await tui.renderOnce()
    // Target measurement follows the native layout pass; let its card settle.
    await act(async () => Bun.sleep(350))
    await tui.renderOnce()
    return [
      snapshot(
        tui,
        "Configurações → Tutorial: aprenda o Runner com dados simulados",
        "tutorial-runner-workspace",
        220,
      ),
    ]
  } finally {
    act(() => tui.renderer.destroy())
  }
}
