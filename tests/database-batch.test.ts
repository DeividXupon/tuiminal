import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  databaseBatchDeleteMutations,
  databaseBatchRowIdentity,
  databaseBatchUpdateMutations,
  serializeDatabaseBatchRows,
  toggleDatabaseBatchPage,
  toggleDatabaseBatchRow,
  type DatabaseBatchSelectedRow,
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

afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

describe("database batch selection and export", () => {
  test("creates stable identities from composite keys", () => {
    expect(databaseBatchRowIdentity({ tenant_id: 2, id: 8 }, "ignored")).toBe(
      databaseBatchRowIdentity({ id: 8, tenant_id: 2 }, "other"),
    )
    expect(databaseBatchRowIdentity(null, "page-3-row-2")).toBe("local:page-3-row-2")
  })

  test("toggles individual rows and the complete visible page", () => {
    expect(toggleDatabaseBatchRow([], first)).toEqual([first])
    expect(toggleDatabaseBatchRow([first], first)).toEqual([])
    expect(toggleDatabaseBatchPage([first], [first, second])).toEqual([first, second])
    expect(toggleDatabaseBatchPage([first, second], [first, second])).toEqual([])
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
