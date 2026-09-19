import "./setup"
import { afterEach, expect, test } from "bun:test"
import { RGBA, type BoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement, type ReactElement } from "react"
import { COLORS, getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { DatabaseTutorialDemo } from "../../packages/feature-database/src/tutorial/DatabaseTutorialDemo"
import { GitTutorialDemo } from "../../packages/feature-git/src/tutorial/GitTutorialDemo"
import { HttpTutorialDemo } from "../../packages/feature-http/src/tutorial/HttpTutorialDemo"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import { FreeTerminal } from "../../packages/feature-terminal/src/TerminalWorkspace"

const initialSettings = getUiSettings()
let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

async function expectSurface(element: ReactElement, id: string, expected: string) {
  tui = await testRender(element, { width: 140, height: 35 })
  await tui.renderOnce()
  const surface = tui.renderer.root.findDescendantById(id) as BoxRenderable | null
  expect(surface).not.toBeNull()
  expect(surface?.backgroundColor.equals(RGBA.fromHex(expected))).toBe(true)
  act(() => tui?.renderer.destroy())
  tui = undefined
}

for (const layout of ["framed", "compact"] as const) {
  test(`all feature workspaces share the ${layout} background`, async () => {
    updateUiSettings({ layout, language: "pt-BR" })
    const expected = layout === "framed" ? COLORS.panel : COLORS.canvas
    await expectSurface(createElement(DatabaseTutorialDemo), "database-workspace", expected)
    await expectSurface(createElement(GitTutorialDemo), "git-tutorial-workspace", expected)
    await expectSurface(createElement(Runner, { active: false }), "runner-workspace", expected)
    await expectSurface(createElement(HttpTutorialDemo), "http-workspace", expected)
    await expectSurface(
      createElement(FreeTerminal, { active: false }),
      "terminal-workspace",
      expected,
    )
  })
}
