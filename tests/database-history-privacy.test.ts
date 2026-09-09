import { afterEach, expect, test } from "bun:test"
import {
  historyEntryIsRead,
  metadataOnlyHistoryEntry,
} from "../src/features/database/model/history-privacy"
import type { DatabaseQueryHistoryEntry } from "../src/features/database/model/types"
import {
  clearHistoryContent,
  HISTORY_SESSION_ENTRY_LIMIT,
  rememberHistoryContent,
  restoreHistoryContent,
  retainHistoryContent,
} from "../src/features/database/services/history-content"

const entry = (id: string, sql = "SELECT 'FAKE_SECRET'"): DatabaseQueryHistoryEntry => ({
  id,
  connectionId: "fixture",
  connectionScope: "sqlite::fixture",
  connectionName: "fixture",
  driver: "sqlite",
  sql,
  command: "SELECT",
  executedAt: new Date().toISOString(),
  status: "error",
  durationMs: 1,
  rowCount: null,
  affectedRows: null,
  error: "FAKE_ERROR_SECRET",
  rerunnable: true,
  parameterPreview: [
    { name: "arbitrary", value: "FAKE_PARAMETER_SECRET", position: 1, masked: false },
  ],
})

afterEach(clearHistoryContent)

test("disk snapshots contain only metadata, even with unrecognized SQL and parameter names", () => {
  for (const sql of [
    "SELECT 'FAKE_SECRET'",
    "SET arbitrary = FAKE_SECRET",
    "-- FAKE_SECRET",
    "CALL FAKE_SECRET()",
    "SELECT $$FAKE_SECRET$$",
  ]) {
    const persisted = metadataOnlyHistoryEntry(entry("fixture", sql))
    expect(JSON.stringify(persisted)).not.toContain("FAKE_")
    expect(persisted.sql).toBe("")
    expect(persisted.rerunnable).toBe(false)
    expect(persisted.parameterPreview).toEqual([])
  }
  expect(
    metadataOnlyHistoryEntry({ ...entry("unknown"), command: "FAKE_COMMAND_SECRET" }).command,
  ).toBe("SQL")
})

test("retention classification survives metadata-only persistence without executable placeholders", () => {
  const read = metadataOnlyHistoryEntry(entry("read"))
  const write = metadataOnlyHistoryEntry(entry("write", "PRAGMA user_version = 7"))
  expect(historyEntryIsRead(read)).toBe(true)
  expect(historyEntryIsRead(write)).toBe(false)
  expect(historyEntryIsRead({ sql: "", storage: "metadata-only" })).toBe(false)
})

test("raw content and sensitive parameter values disappear when the session ends", () => {
  const source = entry("session")
  source.parameterPreview[0] = { name: "password", value: "<mascarado>", position: 1, masked: true }
  const stored = metadataOnlyHistoryEntry(source)
  rememberHistoryContent(source, [{ position: 1, value: "FAKE_REVEALED_SECRET" }])
  expect(restoreHistoryContent(stored).sql).toBe(source.sql)
  expect(restoreHistoryContent(stored).parameterPreview[0]?.revealedValue).toBe(
    "FAKE_REVEALED_SECRET",
  )
  expect(JSON.stringify(stored)).not.toContain("FAKE_")
  clearHistoryContent()
  expect(restoreHistoryContent(stored)).toBe(stored)
})

test("session SQL is bounded by count and evicted content cannot become rerunnable", () => {
  const oldest = metadataOnlyHistoryEntry(entry("0"))
  for (let index = 0; index <= HISTORY_SESSION_ENTRY_LIMIT; index += 1)
    rememberHistoryContent(entry(String(index)))
  expect(restoreHistoryContent(oldest)).toBe(oldest)
  expect(restoreHistoryContent(oldest).rerunnable).toBe(false)
  const newest = metadataOnlyHistoryEntry(entry(String(HISTORY_SESSION_ENTRY_LIMIT)))
  expect(restoreHistoryContent(newest).sql).toContain("FAKE_SECRET")
  retainHistoryContent([])
  expect(restoreHistoryContent(newest)).toBe(newest)
})

test("session byte budget counts UTF-8, not JavaScript characters", () => {
  const sql = `SELECT '${"漢".repeat(80_000)}'`
  for (let index = 0; index < 9; index += 1) rememberHistoryContent(entry(String(index), sql))
  const oldest = metadataOnlyHistoryEntry(entry("0"))
  expect(restoreHistoryContent(oldest)).toBe(oldest)
  expect(restoreHistoryContent(metadataOnlyHistoryEntry(entry("8"))).sql).toBe(sql)
})
