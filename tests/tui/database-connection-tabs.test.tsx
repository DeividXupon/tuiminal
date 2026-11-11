import "./setup"
import { afterEach, expect, test } from "bun:test"
import { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { DatabaseConnectionModal } from "../../packages/feature-database/src/ui/DatabaseConnectionModal"

let tui: TestRendererSetup | undefined
let closes = 0

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  closes = 0
})

async function mount() {
  tui = await testRender(
    <DatabaseConnectionModal
      open
      connections={[]}
      selectedConnectionId={null}
      startInForm
      onClose={() => {
        closes += 1
      }}
      onSelect={() => undefined}
      onCreated={() => undefined}
      onDeleted={() => undefined}
    />,
    { width: 100, height: 30 },
  )
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (tui.renderer.currentFocusedRenderable?.id === "db-connection-name") return tui
  }
  throw new Error("Connection name input did not receive focus")
}

async function key(name: string, modifiers: { ctrl?: boolean; shift?: boolean } = {}) {
  await act(async () => tui?.mockInput.pressKey(name, modifiers))
  await tui?.renderOnce()
}

async function escapeUntil(predicate: () => boolean) {
  await key("ESCAPE")
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (predicate()) return
  }
  expect(predicate()).toBe(true)
}

test("A/F cycles connection tabs in both directions after leaving an input", async () => {
  const current = await mount()
  const input = current.renderer.currentFocusedRenderable
  if (!(input instanceof InputRenderable)) throw new Error("Missing input")
  const originalName = input.value
  await act(async () => current.mockInput.typeText("af"))
  expect(input.value).toContain("af")
  expect(current.captureCharFrame()).toContain("◆ MySQL")
  await escapeUntil(() => !input.focused)
  expect(closes).toBe(0)
  expect(input.focused).toBe(false)
  expect(current.captureCharFrame()).toContain("[A←]/[F→]")
  expect(current.captureCharFrame()).not.toContain("[Ctrl+D]")

  for (const [shortcut, driver, label] of [
    ["f", "postgres", "Postgres"],
    ["f", "sqlite", "SQLite"],
    ["f", "mcp-mysql", "MCP"],
    ["f", "mysql", "MySQL"],
    ["a", "mcp-mysql", "MCP"],
    ["a", "sqlite", "SQLite"],
    ["a", "postgres", "Postgres"],
    ["a", "mysql", "MySQL"],
  ] as const) {
    await key(shortcut)
    expect(current.captureCharFrame()).toContain(`◆ ${label}`)
    expect(current.renderer.currentFocusedRenderable?.id).toBe(`db-connection-driver-${driver}`)
    expect(input.value).toContain(originalName)
    expect(input.value).toContain("af")
  }

  await key("f")
  await key("RETURN")
  expect(current.captureCharFrame()).toContain("◆ Postgres")
  await escapeUntil(() => closes === 1)
  expect(closes).toBe(1)
})

test("modified shortcuts leave the selected driver unchanged", async () => {
  const current = await mount()
  await escapeUntil(() => current.renderer.currentFocusedRenderable?.id !== "db-connection-name")
  for (const shortcut of ["a", "f", "d"]) {
    await key(shortcut, { ctrl: true })
    expect(current.captureCharFrame()).toContain("◆ MySQL")
  }
  await key("f", { shift: true })
  expect(current.captureCharFrame()).toContain("◆ MySQL")
})

test("mouse selection and input focus retain their tab navigation behavior", async () => {
  const current = await mount()
  const postgres = current.renderer.root.findDescendantById("db-connection-driver-postgres")
  if (!postgres) throw new Error("Missing PostgreSQL tab")
  await act(async () => current.mockMouse.click(postgres.screenX + 2, postgres.screenY))
  await current.renderOnce()
  expect(current.captureCharFrame()).toContain("◆ Postgres")
  await key("f")
  expect(current.captureCharFrame()).toContain("◆ SQLite")

  const filename = current.renderer.root.findDescendantById("db-connection-filename")
  if (!(filename instanceof InputRenderable)) throw new Error("Missing SQLite filename input")
  await act(async () => current.mockMouse.click(filename.screenX + 2, filename.screenY))
  await key("a")
  await key("f")
  expect(filename.value).toContain("af")
  expect(filename.focused).toBe(true)
  expect(current.captureCharFrame()).toContain("◆ SQLite")
})
