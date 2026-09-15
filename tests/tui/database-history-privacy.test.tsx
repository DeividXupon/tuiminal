import "./setup"
import { afterEach, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import type { DatabaseQueryHistoryEntry } from "../../packages/feature-database/src/model/types"
import {
  DATABASE_SETTINGS_PATH,
  listDatabaseQueryHistory,
  readSettings,
  writeSettings,
  type StoredDatabaseSettings,
} from "../../packages/feature-database/src/services/database"
import { DatabaseQueryHistoryModal } from "../../packages/feature-database/src/ui/DatabaseQueryHistoryModal"

let tui: TestRendererSetup | undefined
let original: StoredDatabaseSettings | undefined
let closed = 0
let reruns = 0
const initialSettings = getUiSettings()
const secret = "HISTORY_TUI_FAKE_PRIVATE_VALUE"
const legacy: DatabaseQueryHistoryEntry = {
  id: "history-ui-legacy",
  connectionId: "history-ui",
  connectionScope: "history-ui",
  connectionName: "Disposable fixture",
  driver: "sqlite",
  sql: `SELECT '${secret}'`,
  command: "SELECT",
  status: "success",
  executedAt: new Date().toISOString(),
  durationMs: 1,
  rowCount: 1,
  affectedRows: null,
  error: null,
  rerunnable: true,
  parameterPreview: [],
}

async function render() {
  await act(async () => {
    await Bun.sleep(15)
    await tui?.renderOnce()
  })
}

async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    await Bun.sleep(name === "ESCAPE" ? 60 : 10)
  })
  await render()
}

async function click(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing target ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY)
    await tui?.renderOnce()
  })
}

async function mount(width = 120, height = 32, layout: "framed" | "compact" = "framed") {
  updateUiSettings({ layout, language: "pt-BR" })
  original = readSettings()
  writeSettings({ ...original, queryHistory: [legacy] })
  closed = 0
  reruns = 0
  function Harness() {
    const [entries, setEntries] = useState(listDatabaseQueryHistory())
    return (
      <DatabaseQueryHistoryModal
        open
        entries={entries}
        canRerun={(entry) => entry.rerunnable}
        onClose={() => {
          closed += 1
        }}
        onRerun={() => {
          reruns += 1
        }}
        onEntriesChanged={setEntries}
      />
    )
  }
  await act(async () => {
    tui = await testRender(<Harness />, { width, height })
  })
  await render()
}

afterEach(async () => {
  const renderer = tui?.renderer
  await act(async () => renderer?.destroy())
  tui = undefined
  if (original) writeSettings(original)
  original = undefined
  updateUiSettings(initialSettings)
})

test.each(["framed", "compact"] as const)(
  "legacy history requires approval and consumes Escape in %s",
  async (layout) => {
    await mount(120, 32, layout)
    expect(tui?.captureCharFrame()).toContain("Limpar conteúdo antigo")
    await key("d")
    expect(tui?.captureCharFrame()).toContain("Confirmar limpeza")
    await key("RETURN")
    expect(reruns).toBe(0)
    expect(readFileSync(DATABASE_SETTINGS_PATH, "utf8")).toContain(secret)
    await key("ESCAPE")
    expect(closed).toBe(0)
    expect(tui?.captureCharFrame()).toContain("Limpar conteúdo antigo")
    await key("d")
    await key("d")
    expect(readFileSync(DATABASE_SETTINGS_PATH, "utf8")).toContain(secret)
    // Real Kitty repeat event for Y must not count as a separate approval.
    await key("\u001b[121;1:2u")
    expect(readFileSync(DATABASE_SETTINGS_PATH, "utf8")).toContain(secret)
    await key("y")
    expect(readFileSync(DATABASE_SETTINGS_PATH, "utf8")).not.toContain(secret)
    expect(listDatabaseQueryHistory()).toHaveLength(1)
    expect(tui?.captureCharFrame()).toContain("SQL disponível apenas na sessão original.")
    await key("RETURN")
    expect(reruns).toBe(0)
    await key("ESCAPE")
    expect(closed).toBe(1)
  },
)

test.each(["framed", "compact"] as const)(
  "mouse cleanup disclosures fit a narrow %s history",
  async (layout) => {
    await mount(72, 24, layout)
    await click("database-history-cleanup")
    const frame = tui?.captureCharFrame() ?? ""
    expect(frame).toContain("Confirmar limpeza")
    expect(frame).toContain("favoritos se")
    expect(frame).toContain("rão mantidos.")
    expect(frame).toContain("cópias de backup")
    await click("database-history-cleanup-cancel")
    expect(readFileSync(DATABASE_SETTINGS_PATH, "utf8")).toContain(secret)
    await click("database-history-cleanup")
    await click("database-history-cleanup")
    expect(readFileSync(DATABASE_SETTINGS_PATH, "utf8")).not.toContain(secret)
  },
)
