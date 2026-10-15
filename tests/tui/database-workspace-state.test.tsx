import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TextareaRenderable, TextRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { DatabaseViewer } from "../../packages/feature-database/src/DatabaseWorkspace"
import * as service from "../../packages/feature-database/src/services/database"
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

async function keys(name: string, count: number) {
  await act(async () => {
    for (let index = 0; index < count; index += 1) tui?.mockInput.pressKey(name)
    await Bun.sleep(10)
    await tui?.renderOnce()
  })
}

function editor(tab = 1) {
  const value = tui?.renderer.root.findDescendantById(`database-query-sql-${tab}-editor`)
  if (!(value instanceof TextareaRenderable)) throw new Error(`Missing editor ${tab}`)
  return value
}

function tableSummary() {
  const value = tui?.renderer.root.findDescendantById("database-table-summary")
  if (!(value instanceof TextRenderable)) return ""
  return value.content.chunks.map((chunk) => chunk.text).join("")
}

async function mount(
  layout: "compact" | "framed",
  rowCount = 1,
  openQuery = true,
  withRelationships = false,
  withNotifications = false,
) {
  previousDefault = getDefaultDatabaseConnectionId()
  fixtureRoot = mkdtempSync(join(tmpdir(), "tuiminal-workspace-state-"))
  const filename = join(fixtureRoot, "fixture.sqlite")
  const database = new Database(filename, { create: true })
  database.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, name TEXT);")
  if (withRelationships) {
    database.exec(
      "CREATE TABLE log_entry (id INTEGER PRIMARY KEY, demo_id INTEGER REFERENCES demo(id));",
    )
  }
  const insert = database.prepare("INSERT INTO demo VALUES (?, ?)")
  database.transaction(() => {
    for (let id = 1; id <= rowCount; id += 1) {
      insert.run(id, id === 1 ? "kept result" : `row ${id}`)
    }
  })()
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
    const viewer = <DatabaseViewer active />
    return withNotifications ? <NotificationProvider>{viewer}</NotificationProvider> : viewer
  }
  await act(async () => {
    tui = await testRender(<Harness />, { width: 140, height: 36 })
  })
  await settle(() => tui?.captureCharFrame().includes("▦ demo") ?? false)
  if (!openQuery) return
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

test("catalog search Enter focuses the filtered list without opening a table", async () => {
  await mount("compact", 1, false, true)
  await key("/")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("table-search")
  await act(async () => {
    tui?.mockInput.typeText("log_entry")
    await tui?.renderOnce()
  })
  await settle(() => tui?.captureCharFrame().includes("▦ log_entry") ?? false)

  await key("RETURN")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("table-list")
  expect(tui?.captureCharFrame()).not.toContain("─[A←]─ log_entry")
  expect(tui?.captureCharFrame()).not.toContain("◆ DDL")

  await key("RETURN")
  await settle(() => tui?.captureCharFrame().includes("─[A←]─ log_entry") ?? false)
})

test("schema toggles a relationship diagram without querying a different table", async () => {
  await mount("compact", 1, false, true)
  await key("ARROW_DOWN")
  await key("RETURN")
  await settle(() => tui?.captureCharFrame().includes("kept result") ?? false)
  await key("4")
  await settle(() => tui?.captureCharFrame().includes("fk_log_entry_0") ?? false)
  expect(tui?.captureCharFrame()).toContain("◆ DDL")
  await key("g")
  await settle(() => tui?.captureCharFrame().includes("main.log_entry") ?? false)
  const diagram = tui?.captureCharFrame() ?? ""
  expect(diagram).toContain("main.demo")
  expect(diagram).toContain("--->")
  expect(diagram).not.toContain("◆ DDL")
  await key("g")
  await settle(() => tui?.captureCharFrame().includes("◆ DDL") ?? false)
  expect(tui?.captureCharFrame()).toContain("◆ DDL")
  await key("h")
  await key("ARROW_DOWN")
  await key("RETURN")
  await settle(() => tui?.captureCharFrame().includes("log_entry ─") ?? false)
  await key("4")
  await settle(() => tui?.captureCharFrame().includes("fk_log_entry_0") ?? false)
  await key("g")
  await settle(() => tui?.captureCharFrame().includes("[G] Detalhes") ?? false)
  const outgoingDiagram = tui?.captureCharFrame() ?? ""
  expect(outgoingDiagram).toContain("main.log_entry")
  expect(outgoingDiagram).toContain("main.demo")
  expect(outgoingDiagram).toContain("--->")
  expect(outgoingDiagram).not.toContain("◆ DDL")
})

test("a delayed schema response cannot replace the diagram after a table switch", async () => {
  await mount("compact", 1, false, true)
  await key("ARROW_DOWN")
  await key("RETURN")
  await settle(() => tui?.captureCharFrame().includes("kept result") ?? false)
  const original = service.loadDatabaseTableStructure
  let release = () => {}
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls = spyOn(service, "loadDatabaseTableStructure").mockImplementation(async (...args) => {
    if (args[1].name === "demo") await waiting
    return original(...args)
  })
  try {
    await key("4")
    await settle(() => calls.mock.calls.length > 0)
    await key("g")
    await key("h")
    await key("ARROW_DOWN")
    await key("RETURN")
    await settle(() => tui?.captureCharFrame().includes("log_entry ─") ?? false)
    await key("4")
    await settle(() => tui?.captureCharFrame().includes("main.demo") ?? false)
    release()
    await act(async () => {
      await Bun.sleep(20)
      await tui?.renderOnce()
    })
    expect(tui?.captureCharFrame()).toContain("main.log_entry")
    expect(tui?.captureCharFrame()).toContain("--->")
    expect(tui?.captureCharFrame()).not.toContain("◆ DDL")
  } finally {
    release()
    calls.mockRestore()
  }
})

test("table grid shifts a 50-row window only after crossing an edge", async () => {
  await mount("compact", 160, false, false, true)
  await key("ARROW_DOWN")
  await key("RETURN")
  await settle(() => tableSummary().includes("1–50 ↓"))
  await settle(() => tui?.captureCharFrame().includes("LIMIT 51 OFFSET 0") ?? false)
  expect(tui?.captureCharFrame()).toContain('SELECT … FROM "demo"')
  expect(tui?.renderer.root.findDescendantById("database-row-49")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("database-row-50")).toBeUndefined()
  expect(tui?.captureCharFrame()).not.toContain("[P]")
  expect(tui?.captureCharFrame()).not.toContain("[N]")

  const original = service.loadTablePage
  let release = () => {}
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls = spyOn(service, "loadTablePage").mockImplementation(async (...args) => {
    if (args[2] === 50) await ready
    return original(...args)
  })
  try {
    await keys("ARROW_DOWN", 49)
    expect(calls).toHaveBeenCalledTimes(0)
    await key("ARROW_DOWN")
    await settle(() => tableSummary().includes("Carregando 40 linhas abaixo…"))
    expect(calls).toHaveBeenCalledTimes(1)
    await key("ARROW_DOWN")
    expect(calls).toHaveBeenCalledTimes(1)
    expect(calls.mock.calls[0]?.slice(2, 4)).toEqual([50, 40])
    expect(calls.mock.calls[0]?.[6]).toMatchObject({ recordHistory: false })
    release()
    await settle(() => tableSummary().includes("41–90 ↑↓"))
    await settle(() => tui?.captureCharFrame().includes("LIMIT 41 OFFSET 50") ?? false)
    expect(tui?.renderer.root.findDescendantById("database-row-49")).toBeDefined()
    expect(tui?.renderer.root.findDescendantById("database-row-50")).toBeUndefined()

    await keys("ARROW_UP", 10)
    await key("ARROW_UP")
    await settle(() => tableSummary().includes("1–50 ↓"))
    await settle(() => tui?.captureCharFrame().includes("LIMIT 41 OFFSET 0") ?? false)
    expect(calls).toHaveBeenCalledTimes(2)
    expect(calls.mock.calls[1]?.slice(2, 4)).toEqual([0, 40])

    await key("h")
    await key("RETURN")
    await settle(() => calls.mock.calls.length === 3)
    expect(calls.mock.calls[2]?.slice(2, 4)).toEqual([0, 50])
  } finally {
    release()
    await Promise.allSettled(calls.mock.results.map((call) => call.value))
    calls.mockRestore()
  }
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
