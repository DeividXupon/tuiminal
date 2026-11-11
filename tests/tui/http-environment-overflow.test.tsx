import "./setup"
import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import type { TestRendererSetup } from "@opentui/core/testing"
import { updateUiSettings } from "../../packages/core/src/settings/theme"
import { HttpEnvironmentManagerModal } from "../../packages/feature-http/src/ui/HttpEnvironmentManagerModal"

let tui: TestRendererSetup | undefined
const noop = () => {}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
function node(id: string) {
  const value = tui?.renderer.root.findDescendantById(id)
  if (!value) throw new Error(`Missing ${id}`)
  return value
}
async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    await Bun.sleep(name === "ESCAPE" ? 60 : 5)
  })
  await tui?.renderOnce()
}
for (const layout of ["framed", "compact"] as const) {
  test.each([
    [52, 12],
    [52, 16],
    [80, 24],
    [120, 30],
  ])(`environment rows stay above the footer in ${layout} at %sx%s`, async (width, height) => {
    updateUiSettings({ layout, language: "pt-BR" })
    const values = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`variable${i}`, `value${i}`]),
    )
    const environments = Array.from({ length: 30 }, (_, i) => ({
      name: `env-${i}`,
      values,
      privateNames: new Set<string>(),
      production: false,
      directory: "",
    }))
    tui = await testRender(
      <box style={{ flexGrow: 1 }}>
        <HttpEnvironmentManagerModal
          environments={environments}
          globals={undefined}
          activeName="env-29"
          terminalWidth={width}
          terminalHeight={height}
          onSelect={noop}
          onClose={noop}
          onCreate={async () => ({ environmentName: "unused" })}
          onReplace={async () => ({ environmentName: "unused" })}
          onDelete={async () => ({ environmentName: "unused" })}
          onSaveGlobals={async () => ({ environmentName: "Globals" })}
        />
      </box>,
      { width, height },
    )
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-choice-env-29",
    )
    const footer = node("http-environment-list-footer")
    expect(node("http-environment-choice-env-29").screenY).toBeLessThan(footer.screenY)
    expect(tui.captureCharFrame().split("\n")[footer.screenY]).not.toContain("env-29")
    await key("e")
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-create-name",
    )
    await key("TAB")
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-create-variable-0",
    )
    await key("ESCAPE")
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-manager-modal",
    )
    await act(async () => {
      for (let i = 0; i < 29; i++) tui?.mockInput.pressKey("ARROW_DOWN")
    })
    await key("RETURN")
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-create-variable-29",
    )
    const hints = node("http-environment-form-hints")
    const row = node("http-environment-row-29")
    expect(hints.height).toBeGreaterThanOrEqual(1)
    expect(row.screenY + row.height).toBeLessThanOrEqual(hints.screenY)
    expect(tui.captureCharFrame().split("\n")[hints.screenY]).not.toContain("variable29")
    expect(tui.captureCharFrame()).toContain("variable29")
    expect(tui.captureCharFrame().split("\n")[hints.screenY]).toContain(
      "[Tab] Próximo campo · [Shift+Tab] Anterior",
    )
    await key("ESCAPE")
    await key("ESCAPE")
    await key("/")
    await settle(() => tui?.captureCharFrame().includes("[Enter] Tabela") ?? false)
    expect(node("http-environment-form-hints").height).toBeGreaterThanOrEqual(1)
  })
}
