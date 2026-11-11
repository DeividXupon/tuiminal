import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { outputScreen } from "./output-screen"

const settings = getUiSettings()
const keys = [
  "TUIMINAL_ONLY_TAB",
  "TUIMINAL_INITIAL_TAB",
  "TUIMINAL_GIT_PR_DEMO",
  "TUIMINAL_GIT_ISSUES_DEMO",
  "TUIMINAL_GIT_INBOX_DEMO",
]
const environment = keys.map((key) => process.env[key])
let tui: TestRendererSetup | undefined
let screen: ReturnType<typeof outputScreen> | undefined

afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  screen?.destroy()
  screen = undefined
  updateUiSettings(settings)
  keys.forEach((key, index) => {
    const value = environment[index]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
})

for (const layout of ["compact", "framed"] as const) {
  test(`${layout} internal Git transitions keep real output intact and recover injected stale cells`, async () => {
    delete process.env.TUIMINAL_ONLY_TAB
    process.env.TUIMINAL_INITIAL_TAB = "git"
    for (const key of keys.slice(2)) process.env[key] = "1"
    updateUiSettings({ language: "en", layout })
    screen = outputScreen(120, 30)
    tui = await testRender(<App />, {
      width: 120,
      height: 30,
      stdout: screen.stdout,
      bufferedOutput: "stdout",
      useThread: false,
    })
    await act(async () => tui?.waitForVisualIdle())
    expect(screen.read()).toBe(tui.captureCharFrame())
    const header = tui.renderer.root.findDescendantById("tutorial-app-header")
    expect(header).toBeDefined()
    for (const injectFault of [false, true]) {
      for (const [key, marker] of [
        ["2", "PULL REQUESTS · DEMO"],
        ["3", "ISSUES · DEMO"],
        ["4", "INBOX · DEMO"],
        ["1", "No Git repository found"],
        ["c", "[C] COMPARE"],
        ["c", "No Git repository found"],
      ]) {
        // Fault injection is separate from the natural sequence. A one-off
        // repaint before this output frame cannot recover this damage.
        if (injectFault) tui.renderer.once("frame", () => screen?.leaveStaleCells())
        await act(async () => tui?.mockInput.pressKey(key!))
        await act(async () => tui?.waitForVisualIdle())
        expect(tui.captureCharFrame()).toContain(marker!)
        expect(tui.renderer.root.findDescendantById("tutorial-app-header")).toBe(header)
        expect(tui.captureCharFrame().split("\n")[0]).toContain("TUIMINAL")
        expect(screen.read()).toBe(tui.captureCharFrame())
      }
    }
    for (const [id, marker] of [
      ["git-tab-pr", "PULL REQUESTS · DEMO"],
      ["git-tab-issues", "ISSUES · DEMO"],
      ["git-tab-inbox", "INBOX · DEMO"],
    ]) {
      const target = tui.renderer.root.findDescendantById(id!)
      expect(target).toBeDefined()
      await act(async () => tui?.mockMouse.click(target!.screenX, target!.screenY))
      await act(async () => tui?.waitForVisualIdle())
      expect(screen.read()).toContain(marker!)
      expect(screen.read()).toBe(tui.captureCharFrame())
    }
  }, 15_000)
}
