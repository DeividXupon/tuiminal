import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { BoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { useKeyboard } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { COLORS } from "../../packages/core/src/settings/theme"
import { DatabaseLoadingOverlay } from "../../packages/feature-database/src/ui/DatabaseLoadingOverlay"
import { PlasmaLoadingOverlay } from "../../packages/core/src/ui/PlasmaLoadingOverlay"

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

function DatabaseLoadingSurfaceHarness() {
  return (
    <box style={{ position: "relative", width: 52, height: 14, border: true }}>
      <box id="database-static-controls" style={{ height: 3, flexShrink: 0 }}>
        <text content="ABAS E AÇÕES" />
      </box>
      <box id="database-dynamic-content" style={{ flexGrow: 1 }}>
        <text content="CORPO DINÂMICO" />
      </box>
      <box id="database-static-footer" style={{ height: 2, flexShrink: 0 }}>
        <text content="PAGINAÇÃO" />
      </box>
      <DatabaseLoadingOverlay
        id="database-content-loader"
        catalog={false}
        rows
        indexes={false}
        schema={false}
        background={COLORS.panel}
        top={3}
        bottom={2}
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

test("database loader covers only the dynamic data surface", async () => {
  tui = await testRender(<DatabaseLoadingSurfaceHarness />, { width: 52, height: 14 })
  await tui.renderOnce()

  const controls = tui.renderer.root.findDescendantById("database-static-controls") as BoxRenderable
  const surface = tui.renderer.root.findDescendantById("database-dynamic-content") as BoxRenderable
  const loader = tui.renderer.root.findDescendantById("database-content-loader") as BoxRenderable
  const footer = tui.renderer.root.findDescendantById("database-static-footer") as BoxRenderable

  expect(loader.screenY).toBe(surface.screenY)
  expect(loader.height).toBe(surface.height)
  expect(surface.screenY).toBe(controls.screenY + controls.height)
  expect(footer.screenY).toBe(surface.screenY + surface.height)
  expect(tui.captureCharFrame()).toContain("ABAS E AÇÕES")
  expect(tui.captureCharFrame()).toContain("PAGINAÇÃO")
})
