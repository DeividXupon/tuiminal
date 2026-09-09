import "./setup"
import { afterEach, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getUiSettings, updateUiSettings } from "../../src/core/settings/theme"
import type { DatabaseConnectionProfile } from "../../src/features/database/model/types"
import type { StagedDatabaseChange } from "../../src/features/database/model/workspace"
import { DatabaseQueryWorkspace } from "../../src/features/database/query/DatabaseQueryWorkspace"
import {
  addDatabaseConnection,
  applyTableMutations,
  getDefaultDatabaseConnectionId,
  removeDatabaseConnection,
  setDefaultDatabaseConnection,
} from "../../src/features/database/services/database"

let tui: TestRendererSetup | undefined
let fixtureRoot = ""
let fixtureProfile: DatabaseConnectionProfile | null = null
let staged: StagedDatabaseChange[] = []
let reviewCount = 0
const initialSettings = getUiSettings()
let previousDefault: string | null = null
const table = { schema: "main", name: "users", type: "table" as const }
const noop = () => undefined

async function settle(until: () => boolean) {
  if (!tui) throw new Error("TUI not mounted")
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (until()) return
  }
  throw new Error(`Query UI did not settle:\n${tui.captureCharFrame()}`)
}

async function key(name: string, options: { ctrl?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, options)
    await Bun.sleep(name === "ESCAPE" ? 60 : 10)
    await tui?.renderOnce()
  })
}

async function click(id: string) {
  if (!tui) throw new Error("TUI not mounted")
  const target = tui.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing mouse target: ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY)
    await tui?.renderOnce()
  })
}

async function mountQuery(sql: string, layout: "compact" | "framed" = "compact") {
  previousDefault = getDefaultDatabaseConnectionId()
  fixtureRoot = mkdtempSync(join(tmpdir(), "tuiminal-query-safety-"))
  const filename = join(fixtureRoot, "fixture.sqlite")
  const database = new Database(filename, { create: true })
  database.exec(
    "CREATE TABLE users (tenant_id INTEGER, id INTEGER, name TEXT, PRIMARY KEY (tenant_id, id)); INSERT INTO users VALUES (1, 1, 'Original'), (1, 2, 'Unrelated');",
  )
  database.close()
  const { profile } = await addDatabaseConnection(
    {
      name: "Query safety fixture",
      driver: "sqlite",
      filename,
      ssl: false,
      writeEnabled: true,
    },
    "",
    false,
  )
  fixtureProfile = profile
  staged = []
  reviewCount = 0
  function Harness() {
    const [changes, setChanges] = useState<StagedDatabaseChange[]>([])
    const [request, setRequest] = useState<{
      id: string
      connectionId: string
      sql: string
    } | null>({ id: "test-query", connectionId: profile.id, sql })
    staged = changes
    return (
      <DatabaseQueryWorkspace
        active
        tabId="safety"
        tabs={[{ id: "safety", title: "SQL" }]}
        activeTabId="safety"
        connection={profile}
        connectionId={profile.id}
        tables={[table]}
        selectedTable={null}
        selectedTableColumns={null}
        availableWidth={120}
        rerunRequest={request}
        onRerunRequestHandled={() => setRequest(null)}
        onClose={noop}
        onReturnToCatalog={noop}
        onDatabaseChanged={noop}
        stagedChanges={changes}
        setStagedChanges={setChanges}
        changesModalOpen={false}
        onOpenChangesReview={() => {
          reviewCount += 1
        }}
        writeBusy={false}
        dataRevision={0}
        maskingTermsSignature=""
        onSelectTab={noop}
        onNewTab={noop}
        onCloseTab={noop}
        onSwitchTab={noop}
      />
    )
  }
  updateUiSettings({ layout, language: "pt-BR" })
  await act(async () => {
    tui = await testRender(<Harness />, { width: 120, height: 35 })
  })
  await settle(() =>
    Boolean(tui?.renderer.root.findDescendantById("database-query-safety-cell-0-2")),
  )
  await click("database-query-safety-cell-0-2")
  return filename
}

afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  if (fixtureProfile) await removeDatabaseConnection(fixtureProfile.id)
  fixtureProfile = null
  if (previousDefault) setDefaultDatabaseConnection(previousDefault)
  updateUiSettings(initialSettings)
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true })
  fixtureRoot = ""
})

test.each(["compact", "framed"] as const)(
  "derived PK cannot stage single or batch changes in %s",
  async (layout) => {
    const filename = await mountQuery(
      "SELECT tenant_id, id + 1 AS id, name FROM users WHERE id = 1",
      layout,
    )
    await key("e")
    expect(tui?.renderer.root.findDescendantById("database-cell-editor-value")).toBeUndefined()
    await key("d")
    await key("d")
    await key("SPACE")
    await key("e")
    await key("d")
    await key("d")
    await key("a", { ctrl: true })
    await key("s", { ctrl: true })
    expect(staged).toEqual([])
    expect(reviewCount).toBe(0)
    const database = new Database(filename, { readonly: true })
    expect(database.query("SELECT * FROM users ORDER BY id").all()).toEqual([
      { tenant_id: 1, id: 1, name: "Original" },
      { tenant_id: 1, id: 2, name: "Unrelated" },
    ])
    database.close()
  },
)

test("direct query preserves the composite key from result through staging, review and execution", async () => {
  const filename = await mountQuery("SELECT tenant_id, id, name FROM users WHERE id = 1")
  await key("e")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("database-cell-editor-value")))
  await key("ESCAPE")
  await click("database-query-safety-cell-0-2")
  await key("d")
  await key("d")
  await settle(() => staged.length === 1)
  expect(staged[0]).toMatchObject({
    table,
    mutation: { kind: "delete", rowKey: { tenant_id: 1, id: 1 } },
    originalRow: { tenant_id: 1, id: 1, name: "Original" },
    approved: false,
  })
  await key("s", { ctrl: true })
  expect(reviewCount).toBe(1)
  const change = staged[0]
  if (!change) throw new Error("Missing staged change")
  await applyTableMutations(change.connectionId, [
    { table: change.table, columns: change.columns, mutation: change.mutation },
  ])
  const database = new Database(filename, { readonly: true })
  expect(database.query("SELECT * FROM users").all()).toEqual([
    { tenant_id: 1, id: 2, name: "Unrelated" },
  ])
  database.close()
})
