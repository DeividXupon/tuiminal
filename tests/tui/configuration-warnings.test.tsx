import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { useKeyboard } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { useConfigurationWarnings } from "../../apps/cli/src/hooks/use-configuration-warnings"
import { ConfigurationWarningsModal } from "../../apps/cli/src/ui/ConfigurationWarningsModal"
import type { ConfigurationWarning } from "../../packages/core/src/config/index"
import { NotificationProvider } from "../../packages/core/src/notifications/index"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

function WarningHarness({
  warnings,
  onGlobal,
}: {
  warnings: ConfigurationWarning[]
  onGlobal: () => void
}) {
  const state = useConfigurationWarnings(warnings)
  useKeyboard((key) => {
    if (!state.open && !key.defaultPrevented && key.name === "q") onGlobal()
  })
  return (
    <>
      <text content="Ready workspace" />
      {state.open && <ConfigurationWarningsModal warnings={state.warnings} onClose={state.close} />}
    </>
  )
}

test("startup warnings show every file and diagnostic through native scrolling, then safely dismiss and reopen", async () => {
  const warnings = Array.from({ length: 6 }, (_, index) => ({
    file: `/temporary/custom/configuration/${["config", "http", "git", "database", "runner", "terminal"][index]}.yml`,
    message: `Diagnostic ${index + 1}: conflicting shortcuts in the active workspace. ${"Additional diagnostic details. ".repeat(5)}`,
  }))
  let globalActions = 0
  tui = await testRender(
    <NotificationProvider>
      <WarningHarness warnings={warnings} onGlobal={() => globalActions++} />
    </NotificationProvider>,
    { width: 84, height: 24 },
  )
  await act(async () => {
    await Bun.sleep(10)
  })
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("configuration/config.yml")
  expect(tui.captureCharFrame()).toContain("Diagnostic 1")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("configuration-warnings")
  const details = tui.renderer.root.findDescendantById(
    "configuration-warnings-details",
  ) as ScrollBoxRenderable
  expect(details.scrollHeight).toBeGreaterThan(details.height)

  await act(async () => {
    await tui?.mockInput.pressKey("q")
  })
  expect(globalActions).toBe(0)
  await act(async () => {
    await tui?.mockInput.pressKey("END")
  })
  await tui.renderOnce()
  expect(details.scrollTop).toBeGreaterThan(0)
  expect(tui.captureCharFrame()).toContain("configuration/terminal.yml")
  expect(tui.captureCharFrame()).toContain("Diagnostic 6")

  await act(async () => {
    await tui?.mockInput.pressKey("HOME")
  })
  await tui.renderOnce()
  expect(details.scrollTop).toBe(0)
  await act(async () => {
    await tui?.mockInput.pressKey("ESCAPE")
    await Bun.sleep(30)
  })
  await tui.renderOnce()
  expect(Boolean(tui.renderer.root.findDescendantById("configuration-warnings"))).toBe(false)
  expect(globalActions).toBe(0)
  await act(async () => {
    await tui?.mockInput.pressKey("q")
  })
  expect(globalActions).toBe(1)

  await act(async () => {
    await Bun.sleep(220)
  })
  await tui.renderOnce()
  const notification = tui.renderer.root.findDescendantById("app-notification-0")
  if (!notification) throw new Error("Missing configuration notification")
  await act(async () => {
    await tui?.mockMouse.click(notification.screenX + 3, notification.screenY + 1)
  })
  await tui.renderOnce()
  expect(Boolean(tui.renderer.root.findDescendantById("configuration-warnings"))).toBe(true)
})
