import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getLanguage, setLanguage } from "../../packages/core/src/i18n"
import type { DatabaseConnectionProfile } from "../../packages/feature-database/src/model/types"
import { DatabaseConnectionModal } from "../../packages/feature-database/src/ui/DatabaseConnectionModal"

let tui: TestRendererSetup | undefined
const originalLanguage = getLanguage()

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  setLanguage(originalLanguage)
})

async function mount(profile?: DatabaseConnectionProfile) {
  setLanguage("en")
  tui = await testRender(
    <DatabaseConnectionModal
      open
      connections={profile ? [profile] : []}
      selectedConnectionId={profile?.id ?? null}
      startInForm={!profile}
      onClose={() => undefined}
      onSelect={() => undefined}
      onCreated={() => undefined}
      onDeleted={() => undefined}
    />,
    { width: 110, height: 42 },
  )
  await waitFor(() =>
    Boolean(
      tui?.renderer.root.findDescendantById(
        profile ? "database-connection-list" : "db-connection-access",
      ),
    ),
  )
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (predicate()) return
  }
  expect(predicate()).toBe(true)
}

async function expectReadOnly(checked: boolean) {
  await waitFor(() =>
    Boolean(tui?.captureCharFrame().includes(`[Ctrl+W] ${checked ? "◆" : "◇"} READ-ONLY`)),
  )
  expect(tui?.captureCharFrame()).not.toContain("READ + WRITE")
}

async function toggleKey() {
  await act(async () => tui?.mockInput.pressKey("w", { ctrl: true }))
}

async function click(id: string) {
  const control = tui?.renderer.root.findDescendantById(id)
  if (!control) throw new Error(`Missing ${id}`)
  await act(async () => tui?.mockMouse.click(control.screenX + 2, control.screenY))
}

test.each(["mysql", "postgres", "sqlite"])(
  "%s starts read-only and keeps its label when toggled by keyboard and mouse",
  async (driver) => {
    await mount()
    await click(`db-connection-driver-${driver}`)
    await expectReadOnly(true)
    await toggleKey()
    await expectReadOnly(false)
    await toggleKey()
    await expectReadOnly(true)
    await click("db-connection-access")
    await expectReadOnly(false)
    await click("db-connection-access")
    await expectReadOnly(true)
  },
)

test("MCP stays checked and ignores keyboard and mouse toggles", async () => {
  await mount()
  await toggleKey()
  await expectReadOnly(false)
  await click("db-connection-driver-mcp-mysql")
  await expectReadOnly(true)
  await toggleKey()
  await click("db-connection-access")
  await expectReadOnly(true)
})

test.each([false, true])("editing preserves stored writeEnabled=%s", async (writeEnabled) => {
  await mount({
    id: "fixture-access",
    name: "Fixture access",
    driver: "sqlite",
    source: "saved",
    filename: "/unused-fixture.sqlite",
    ssl: false,
    writeEnabled,
  })
  await act(async () => tui?.mockInput.pressKey("e"))
  await expectReadOnly(!writeEnabled)
  await toggleKey()
  await expectReadOnly(writeEnabled)
})
