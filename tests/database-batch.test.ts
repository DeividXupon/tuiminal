import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type DatabaseBatchSelectedRow,
  databaseBatchDeleteMutations,
  databaseBatchRange,
  databaseBatchRangeDirection,
  databaseBatchRowIdentity,
  databaseBatchSweepShortcut,
  databaseBatchUpdateMutations,
  selectDatabaseBatchRow,
  serializeDatabaseBatchRows,
  toggleDatabaseBatchRow,
} from "../src/features/database/model/batch"
import { saveDatabaseBatchExport } from "../src/features/database/storage/batch-export"

const temporaryDirectory = mkdtempSync(join(tmpdir(), "tuiminal-batch-test-"))

const first: DatabaseBatchSelectedRow = {
  id: "key-1",
  rowKey: { id: 1 },
  data: { id: 1, name: "Ana", note: "um, dois" },
}
const second: DatabaseBatchSelectedRow = {
  id: "key-2",
  rowKey: { id: 2 },
  data: { id: 2, name: "Beto", note: "linha\nnova" },
}
const third: DatabaseBatchSelectedRow = {
  id: "key-3",
  rowKey: { id: 3 },
  data: { id: 3, name: "Caio", note: "fim" },
}

afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

describe("database batch selection and export", () => {
  test("recognizes sweep shortcuts without stealing Ctrl+Space", () => {
    expect(databaseBatchSweepShortcut({ name: "space", option: true })).toBe(true)
    expect(databaseBatchSweepShortcut({ name: "space", meta: true })).toBe(true)
    expect(databaseBatchSweepShortcut({ name: " " })).toBe(true)
    expect(databaseBatchSweepShortcut({ name: "space", sequence: "\u001b " })).toBe(true)
    expect(databaseBatchSweepShortcut({ name: "space", shift: true })).toBe(false)
    expect(databaseBatchSweepShortcut({ name: "space" })).toBe(false)
    expect(databaseBatchSweepShortcut({ name: "space", ctrl: true })).toBe(false)
  })

  test("creates stable identities from composite keys", () => {
    expect(databaseBatchRowIdentity({ tenant_id: 2, id: 8 }, "ignored")).toBe(
      databaseBatchRowIdentity({ id: 8, tenant_id: 2 }, "other"),
    )
    expect(databaseBatchRowIdentity(null, "page-3-row-2")).toBe("local:page-3-row-2")
  })

  test("toggles and adds individual rows idempotently", () => {
    expect(toggleDatabaseBatchRow([], first)).toEqual([first])
    expect(toggleDatabaseBatchRow([first], first)).toEqual([])
    expect(selectDatabaseBatchRow([first], second)).toEqual([first, second])
    expect(selectDatabaseBatchRow([first, second], second)).toEqual([first, second])
  })

  test("builds a contiguous anchored range in either direction", () => {
    const rows = [first, second, third]
    expect(databaseBatchRange(rows, 0, 2)).toEqual(rows)
    expect(databaseBatchRange(rows, 2, 1)).toEqual([second, third])
    expect(databaseBatchRange(rows, 1, 1)).toEqual([second])
  })

  test("maps arrows and Vim keys to range navigation", () => {
    expect(databaseBatchRangeDirection("up")).toBe(-1)
    expect(databaseBatchRangeDirection("k")).toBe(-1)
    expect(databaseBatchRangeDirection("down")).toBe(1)
    expect(databaseBatchRangeDirection("j")).toBe(1)
    expect(databaseBatchRangeDirection("pageup")).toBeNull()
  })

  test("builds safe per-primary-key mutations and skips unidentified rows", () => {
    const unidentified = { ...second, id: "local", rowKey: null }
    expect(databaseBatchUpdateMutations([first, unidentified], "name", "Novo")).toEqual([
      {
        row: first,
        mutation: { kind: "update", rowKey: { id: 1 }, values: { name: "Novo" } },
      },
    ])
    expect(databaseBatchDeleteMutations([first, unidentified])).toEqual([
      {
        row: first,
        mutation: { kind: "delete", rowKey: { id: 1 } },
      },
    ])
  })

  test("serializes selected rows as CSV, TSV, and JSON", () => {
    expect(serializeDatabaseBatchRows([first, second], ["id", "name", "note"], "csv")).toBe(
      'id,name,note\n1,Ana,"um, dois"\n2,Beto,"linha\nnova"\n',
    )
    expect(serializeDatabaseBatchRows([first], ["id", "name"], "tsv")).toBe("id\tname\n1\tAna\n")
    expect(JSON.parse(serializeDatabaseBatchRows([first], ["id", "name"], "json"))).toEqual([
      { id: 1, name: "Ana" },
    ])
  })

  test("saves exports in an isolated, protected output directory", () => {
    const path = saveDatabaseBatchExport({
      directory: temporaryDirectory,
      tableName: "public.usuários",
      format: "json",
      content: "[]\n",
      now: new Date("2026-09-02T12:34:56.000Z"),
    })
    expect(path).toBe(
      join(temporaryDirectory, "tuiminal-exports", "public.usuarios-2026-09-02T12-34-56-000Z.json"),
    )
    expect(readFileSync(path, "utf8")).toBe("[]\n")
    expect(statSync(join(temporaryDirectory, "tuiminal-exports")).mode & 0o777).toBe(0o700)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })
})
