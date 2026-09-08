import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../src/app/App"
import { STARTUP_ANIMATION_TIMING, STARTUP_WORDMARK } from "../../src/app/model/startup-animation"
import { StartupAnimationFrame } from "../../src/app/ui/StartupAnimation"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  process.env.TUIMINAL_TEST_SKIP_STARTUP = "1"
})

test("renders the assembled logo and wordmark from the reference proportions", async () => {
  tui = await testRender(
    <StartupAnimationFrame
      elapsedMs={STARTUP_ANIMATION_TIMING.wordStart + STARTUP_ANIMATION_TIMING.wordDuration}
      width={100}
      height={30}
    />,
    { width: 100, height: 30 },
  )
  await tui.renderOnce()

  for (const id of ["top", "left", "rightTop", "rightBottom"]) {
    expect(tui.renderer.root.findDescendantById(`startup-logo-block-${id}`)).toBeDefined()
  }
  const wordmark = tui.renderer.root.findDescendantById("startup-wordmark") as
    | { text?: string }
    | undefined
  expect(wordmark?.text).toBe(STARTUP_WORDMARK)
  expect(tui.captureCharFrame()).toContain("▀█▀")
})

test("App shows the intro before mounting the selected tool and Enter skips it", async () => {
  delete process.env.TUIMINAL_TEST_SKIP_STARTUP
  tui = await testRender(<App />, { width: 100, height: 30 })
  await tui.renderOnce()

  expect(tui.renderer.root.findDescendantById("startup-animation")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("runner-command-panel")).toBeUndefined()

  act(() => tui?.mockInput.pressEnter())
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  expect(tui.renderer.root.findDescendantById("startup-animation")).toBeUndefined()
})
