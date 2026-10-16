import "./setup"
import { Database } from "bun:sqlite"
import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { ownsKeyboardFocus } from "../../packages/core/src/keyboard/scope"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { DatabaseViewer } from "../../packages/feature-database/src/DatabaseWorkspace"
import { databaseKeyboardScope } from "../../packages/feature-database/src/keyboard"
import {
  addDatabaseConnection,
  getDefaultDatabaseConnectionId,
  removeDatabaseConnection,
  setDefaultDatabaseConnection,
} from "../../packages/feature-database/src/services/database"

let tui: TestRendererSetup | undefined
let fixtureRoot = ""
let connectionId = ""
let previousDefault: string | null = null
const initialSettings = getUiSettings()
const node = (id: string) => tui?.renderer.root.findDescendantById(id)
const selected = (id: string) => Boolean(node(`${id}-focus-selection-tint`))

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 150; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
    })
    await tui?.renderOnce()
    if (until()) return
  }
  throw new Error(`Workspace did not settle:\n${tui?.captureCharFrame()}`)
}
async function key(name: string, options: { ctrl?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, options)
    await Bun.sleep(10)
  })
  await tui?.renderOnce()
}
async function click(id: string) {
  await tui?.renderOnce()
  const target = node(id)
  if (!target) throw new Error(`Missing ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY + Math.floor(target.height / 2))
    await tui?.renderOnce()
  })
}
async function mount(layout: "compact" | "framed", width = 140) {
  previousDefault = getDefaultDatabaseConnectionId()
  fixtureRoot = mkdtempSync(join(tmpdir(), "tuiminal-box-selection-"))
  const filename = join(fixtureRoot, "fixture.sqlite")
  const database = new Database(filename, { create: true })
  database.exec(
    "CREATE TABLE demo (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO demo VALUES (1, 'box fixture'), (2, 'second row');",
  )
  database.close()
  const { profile } = await addDatabaseConnection(
    { name: "Box fixture", driver: "sqlite", filename, ssl: false, writeEnabled: true },
    "",
    false,
  )
  connectionId = profile.id
  setDefaultDatabaseConnection(connectionId)
  updateUiSettings({ layout, language: "pt-BR" })
  await act(async () => {
    tui = await testRender(<DatabaseViewer active />, { width, height: 36 })
  })
  await settle(() => tui?.captureCharFrame().includes("▦ demo") ?? false)
}
async function openTable() {
  await key("ARROW_DOWN")
  await key("RETURN")
  await settle(() => tui?.captureCharFrame().includes("box fixture") ?? false)
}

afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  if (connectionId) await removeDatabaseConnection(connectionId)
  connectionId = ""
  if (previousDefault) setDefaultDatabaseConnection(previousDefault)
  updateUiSettings(initialSettings)
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true })
  fixtureRoot = ""
})

test.each(["framed", "compact"] as const)(
  "Database M selects visible boxes and consumes cancel in %s",
  async (layout) => {
    await mount(layout)
    await openTable()
    await key("m")
    expect(
      ownsKeyboardFocus(databaseKeyboardScope, tui?.renderer.currentFocusedRenderable?.id),
    ).toBe(true)
    expect(selected("tutorial-db-table-grid")).toBe(true)
    await key("l")
    expect(selected("tutorial-db-inspector")).toBe(true)
    await key("RETURN")
    expect(Boolean(node("database-box-selection"))).toBe(false)
    await settle(() => tui?.captureCharFrame().includes("◆ REGISTRO 1 / 2") ?? false)
    await key("m")
    await key("h")
    await key("h")
    expect(selected("tutorial-db-catalog")).toBe(true)
    await key("ESCAPE")
    await settle(() => !node("database-box-selection"))
    await settle(() => tui?.captureCharFrame().includes("◆ REGISTRO 1 / 2") ?? false)
    await key("m")
    await click("tutorial-db-catalog-focus-selection")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "table-list")
    await key("m")
    await key("m")
    expect(tui?.renderer.currentFocusedRenderable?.id).toBe("table-list")
    await key("?")
    await key("m")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "database-box-selection")
    expect(selected("tutorial-db-catalog")).toBe(true)
  },
)

test("Database search and modals retain m and narrow layouts omit the hidden inspector", async () => {
  await mount("compact", 80)
  await key("/")
  await key("m")
  expect(Boolean(node("database-box-selection"))).toBe(false)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("table-search")
  await key("BACKSPACE")
  await key("ESCAPE")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "table-list")
  await openTable()
  await key("m")
  expect(Boolean(node("tutorial-db-inspector-focus-selection"))).toBe(false)
  await key("l")
  expect(selected("tutorial-db-table-grid")).toBe(true)
  await key("ESCAPE")
  await settle(() => !node("database-box-selection"))
  await key("c")
  await key("m")
  expect(Boolean(node("database-box-selection"))).toBe(false)
})

test("SQL chooses editor, results and inspector while preserving editor text", async () => {
  await mount("compact")
  await key("w")
  const editorId = "database-query-sql-1-editor"
  await settle(() => Boolean(node(editorId)))
  const editor = node(editorId) as TextareaRenderable
  await key("m")
  expect(editor.plainText).toBe("m")
  expect(Boolean(node("database-query-sql-1-box-selection"))).toBe(false)
  await act(async () => {
    editor.setText("SELECT id, name FROM demo")
  })
  await key("a", { ctrl: true })
  await settle(() => tui?.captureCharFrame().includes("box fixture") ?? false)
  await key("m")
  expect(selected("database-query-sql-1-result-box")).toBe(true)
  await key("l")
  expect(selected("database-query-sql-1-inspector")).toBe(true)
  await key("RETURN")
  await settle(() => tui?.captureCharFrame().includes("◆ REGISTRO 1 / 2") ?? false)
  await key("m")
  await click("database-query-sql-1-editor-box-focus-selection")
  await settle(() => editor.focused)
  expect(editor.plainText).toBe("SELECT id, name FROM demo")
  await click("database-query-sql-1-action-palette-open")
  await settle(() => Boolean(node("database-query-sql-1-action-palette")))
  await key("m")
  await settle(() => Boolean(node("database-query-sql-1-box-selection")))
  expect(selected("database-query-sql-1-editor-box")).toBe(true)
  await key("ESCAPE")
  await settle(() => !node("database-query-sql-1-box-selection"))
  await settle(() => editor.focused)
  expect(editor.plainText).toBe("SELECT id, name FROM demo")
  await click("database-query-sql-1-box-selection-open")
  await settle(() => Boolean(node("database-query-sql-1-box-selection")))
  await key("m")
  await settle(() => editor.focused)
  expect(editor.plainText).toBe("SELECT id, name FROM demo")
})
