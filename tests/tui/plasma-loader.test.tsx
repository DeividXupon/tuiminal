import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { useKeyboard } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { COLORS } from "../../src/core/settings/theme"
import { PlasmaLoadingOverlay } from "../../src/shared/ui/PlasmaLoadingOverlay"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

function LoadingHarness() {
  const [loading, setLoading] = useState(true)
  useKeyboard((key) => {
    if (key.name === "x") setLoading(false)
  })
  return (
    <box
      style={{
        position: "relative",
        width: 48,
        height: 10,
        backgroundColor: COLORS.panel,
      }}
    >
      <text content="CONTEÚDO PRONTO" style={{ fg: COLORS.text }} />
      <PlasmaLoadingOverlay
        id="test-plasma-loader"
        animate
        active={loading}
        label="CARREGANDO GITHUB…"
        detail="Buscando suas notificações"
        accent={COLORS.git}
      />
    </box>
  )
}

test("plasma loader keeps status copy above the animated surface and fades away", async () => {
  tui = await testRender(<LoadingHarness />, { width: 48, height: 10 })
  await tui.renderOnce()

  const loadingFrame = tui.captureCharFrame()
  expect(loadingFrame).toContain("CARREGANDO GITHUB…")
  expect(loadingFrame).toContain("Buscando suas notificações")
  expect(tui.renderer.root.findDescendantById("test-plasma-loader-pattern")).toBeDefined()

  act(() => tui?.mockInput.pressKey("x"))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("CARREGANDO GITHUB…")

  await act(async () => Bun.sleep(280))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).not.toContain("CARREGANDO GITHUB…")
  expect(tui.captureCharFrame()).toContain("CONTEÚDO PRONTO")
})
