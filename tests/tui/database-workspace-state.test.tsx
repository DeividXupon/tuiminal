import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getUiSettings, updateUiSettings } from "../../src/core/settings/theme"
import { DatabaseViewer } from "../../src/features/database/DatabaseWorkspace"
import * as service from "../../src/features/database/services/database"
import {
  addDatabaseConnection,
  getDefaultDatabaseConnectionId,
  removeDatabaseConnection,
  setDefaultDatabaseConnection,
} from "../../src/features/database/services/database"

let tui: TestRendererSetup | undefined
let fixtureRoot = ""
let connectionId = ""
let previousDefault: string | null = null
const initialSettings = getUiSettings()
let repaint = () => {}

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (until()) return
  }
  throw new Error(`Workspace did not settle:\n${tui?.captureCharFrame()}`)
}

async function key(name: string, options: { ctrl?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, options)
    await Bun.sleep(10)
    await tui?.renderOnce()
  })
}

function editor(tab = 1) {
  const value = tui?.renderer.root.findDescendantById(`database-query-sql-${tab}-editor`)
  if (!(value instanceof TextareaRenderable)) throw new Error(`Missing editor ${tab}`)
  return value
}

async function mount(layout: "compact" | "framed") {
  previousDefault = getDefaultDatabaseConnectionId()
  fixtureRoot = mkdtempSync(join(tmpdir(), "tuiminal-workspace-state-"))
  const filename = join(fixtureRoot, "fixture.sqlite")
  const database = new Database(filename, { create: true })
  database.exec(
    "CREATE TABLE demo (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO demo VALUES (1, 'kept result');",
  )
  database.close()
  const { profile } = await addDatabaseConnection(
    { name: "Workspace fixture", driver: "sqlite", filename, ssl: false, writeEnabled: true },
    "",
    false,
  )
  connectionId = profile.id
  setDefaultDatabaseConnection(connectionId)
  updateUiSettings({ layout, language: "pt-BR" })
  function Harness() {
    const [, setRevision] = useState(0)
    repaint = () => setRevision((current) => current + 1)
    return <DatabaseViewer active />
  }
  await act(async () => {
    tui = await testRender(<Harness />, { width: 140, height: 36 })
  })
  await settle(() => tui?.captureCharFrame().includes("▦ demo") ?? false)
  await key("w")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("database-query-sql-1-editor")))
  await act(async () => tui?.mockInput.typeText("SELECT id, name FROM demo"))
  await key("ARROW_LEFT")
  await key("a", { ctrl: true })
  await settle(() => tui?.captureCharFrame().includes("kept result") ?? false)
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
  "layout changes preserve mounted SQL tabs, drafts, focus and results from %s",
  async (layout) => {
    await mount(layout)
    const first = editor()
    await key("a")
    expect(first.focused).toBe(true)
    await act(async () => tui?.mockInput.typeText(" -- first draft"))
    const firstDraft = first.plainText
    await key("n", { ctrl: true })
    await settle(() =>
      Boolean(tui?.renderer.root.findDescendantById("database-query-sql-2-editor")),
    )
    const second = editor(2)
    await act(async () => tui?.mockInput.typeText("SELECT 'second draft'"))
    const secondDraft = second.plainText
    const cursor = second.cursorOffset
    await act(async () => {
      updateUiSettings({ layout: layout === "compact" ? "framed" : "compact" })
      repaint()
    })
    await tui?.renderOnce()
    expect(editor() === first).toBe(true)
    expect(editor(2) === second).toBe(true)
    expect(first.plainText).toBe(firstDraft)
    expect(second.plainText).toBe(secondDraft)
    expect(second.cursorOffset).toBe(cursor)
    expect(second.focused).toBe(true)
    await key("w", { ctrl: true })
    await settle(() => tui?.captureCharFrame().includes("kept result") ?? false)
    expect(editor().plainText).toBe(firstDraft)
  },
)

test.each(["framed", "compact"] as const)(
  "maximizing SQL results preserves the editor and restores its draft in %s",
  async (layout) => {
    await mount(layout)
    const original = editor()
    const sql = original.plainText
    const cursor = original.cursorOffset
    expect(original.focused).toBe(false)
    await key("F10")
    expect(tui?.captureCharFrame()).toContain("kept result")
    expect(editor() === original).toBe(true)
    await key("F10")
    expect(editor() === original).toBe(true)
    expect(original.plainText).toBe(sql)
    expect(original.cursorOffset).toBe(cursor)
    await key("F10")
    await key("a")
    expect(original.focused).toBe(true)
    await settle(() => tui?.captureCharFrame().includes(sql) ?? false)
  },
)

test("rapid confirmation submits a SQL write only once while it is running", async () => {
  await mount("compact")
  await key("a")
  await act(async () => {
    editor().selectAll()
    await tui?.mockInput.typeText("INSERT INTO demo(name) VALUES ('confirmed once')")
  })
  await key("ARROW_LEFT")
  await key("a", { ctrl: true })
  await settle(() => tui?.captureCharFrame().includes("CONFIRMAR INSERT") ?? false)
  const execute = service.executeDatabaseQuery
  let release = () => {}
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls = spyOn(service, "executeDatabaseQuery").mockImplementation(async (...args) => {
    await ready
    return execute(...args)
  })
  try {
    await act(async () => {
      tui?.mockInput.pressKey("a", { ctrl: true })
      tui?.mockInput.pressKey("a", { ctrl: true })
      tui?.mockInput.pressKey("a", { ctrl: true })
    })
    expect(calls).toHaveBeenCalledTimes(1)
  } finally {
    try {
      await act(async () => {
        release()
        await Promise.allSettled(calls.mock.results.map((result) => result.value))
      })
      await settle(
        () => tui?.captureCharFrame().includes("Comando executado com sucesso.") ?? false,
      )
    } finally {
      calls.mockRestore()
    }
  }
  const database = new Database(join(fixtureRoot, "fixture.sqlite"), { readonly: true })
  try {
    expect(
      database.query("SELECT COUNT(*) AS count FROM demo WHERE name = 'confirmed once'").get(),
    ).toEqual({ count: 1 })
  } finally {
    database.close()
  }
})

test("rapid review confirmation applies one transaction and locks its approved snapshot", async () => {
  await mount("compact")
  await key("d")
  await settle(() => tui?.captureCharFrame().includes("pressione [d]") ?? false)
  await key("d")
  await settle(() => tui?.captureCharFrame().includes("[Ctrl+S]1") ?? false)
  await key("s", { ctrl: true })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("database-changes-item-0")))
  await key("RETURN")
  await settle(() => tui?.captureCharFrame().includes("APROVADO PARA EXECUÇÃO") ?? false)
  const execute = service.applyTableMutations
  let release = () => {}
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls = spyOn(service, "applyTableMutations").mockImplementation(async (...args) => {
    await ready
    return execute(...args)
  })
  try {
    await act(async () => {
      tui?.mockInput.pressKey("s", { ctrl: true })
      tui?.mockInput.pressKey("s", { ctrl: true })
      tui?.mockInput.pressKey("s", { ctrl: true })
    })
    expect(calls).toHaveBeenCalledTimes(1)
    const item = tui?.renderer.root.findDescendantById("database-changes-item-0")
    if (!item) throw new Error("Missing approved item")
    await act(async () => {
      await tui?.mockMouse.click(item.screenX + 1, item.screenY + 1)
    })
    await tui?.renderOnce()
    expect(tui?.captureCharFrame()).toContain("APROVADO PARA EXECUÇÃO")
  } finally {
    try {
      await act(async () => {
        release()
        await Promise.allSettled(calls.mock.results.map((result) => result.value))
      })
      await settle(() => !tui?.renderer.root.findDescendantById("database-changes-item-0"))
    } finally {
      calls.mockRestore()
    }
  }
  const database = new Database(join(fixtureRoot, "fixture.sqlite"), { readonly: true })
  try {
    expect(database.query("SELECT COUNT(*) AS count FROM demo").get()).toEqual({ count: 0 })
  } finally {
    database.close()
  }
})
