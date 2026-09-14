import { expect, test } from "bun:test"
import {
  stageBatchUpdates,
  stageBatchDeletes,
  rowKeyFingerprint,
  type StagedDatabaseChange,
} from "../packages/feature-database/src/model/workspace"
import type { DatabaseColumn } from "../packages/feature-database/src/model/types"

const table = { schema: "main", name: "items", type: "table" as const }
const field: DatabaseColumn = {
  field: "name",
  type: "text",
  nullable: false,
  key: "",
  defaultValue: null,
}
const columns = [{ ...field, field: "id", type: "integer", key: "PRI" }, field]
const options = { connectionId: "db", connectionName: "Fixture", table, columns }
const row = (id: number | bigint, name = "original") => ({
  id: String(id),
  rowKey: { id },
  data: { id, name },
})
function change(id: number): StagedDatabaseChange {
  return {
    ...options,
    id: `change-${id}`,
    mutation: { kind: "update", rowKey: { id }, values: { name: "old edit" } },
    originalRow: row(id).data,
    approved: true,
  }
}

test("row fingerprints preserve exact bigint keys and distinguish strings", () => {
  expect(rowKeyFingerprint({ id: 9007199254740993n })).toBe(
    rowKeyFingerprint({ id: 9007199254740993n }),
  )
  expect(rowKeyFingerprint({ id: 9007199254740993n })).not.toBe(
    rowKeyFingerprint({ id: "9007199254740993" }),
  )
  expect(rowKeyFingerprint({ a: 1, b: 2 })).toBe(rowKeyFingerprint({ b: 2, a: 1 }))
})

test.each(["update", "delete"] as const)(
  "batch %s indexes existing changes once, not once per selected row",
  (action) => {
    let keyReads = 0
    const key = (id: number) => ({
      get id() {
        keyReads += 1
        return id
      },
    })
    const current = Array.from({ length: 800 }, (_, id) => ({
      ...change(id),
      mutation: { kind: "update" as const, rowKey: key(id), values: { name: "old edit" } },
    }))
    const input = {
      ...options,
      current,
      rows: Array.from({ length: 800 }, (_, id) => ({ ...row(id), rowKey: key(id) })),
      column: field,
      value: "new edit",
      nextId: () => {
        throw new Error("should reuse IDs")
      },
    }
    const result = action === "update" ? stageBatchUpdates(input) : stageBatchDeletes(input)
    expect(result.changes).toHaveLength(800)
    expect(result.stagedCount).toBe(800)
    expect(result.changes.every((entry) => !entry.approved)).toBe(true)
    expect(keyReads).toBeLessThan(800 * 4)
    expect(current[0]?.mutation).toMatchObject({ values: { name: "old edit" } })
  },
)

test("batch edits keep unrelated changes and merge columns without changing original snapshots", () => {
  const existing = change(1)
  existing.mutation = {
    kind: "update",
    rowKey: { id: 1 },
    values: { name: "old edit", extra: "keep" },
  }
  const foreign = { ...change(2), connectionId: "another" }
  const insert: StagedDatabaseChange = {
    ...change(3),
    mutation: { kind: "insert", values: { id: 3 } },
  }
  const result = stageBatchUpdates({
    ...options,
    current: [foreign, existing, insert],
    rows: [row(1), row(4)],
    column: field,
    value: "new",
    nextId: () => "new-4",
  })
  expect(result.changes.map((entry) => entry.id)).toEqual([
    foreign.id,
    existing.id,
    insert.id,
    "new-4",
  ])
  expect(result.changes[1]?.mutation).toMatchObject({ values: { name: "new", extra: "keep" } })
  expect(result.changes[1]?.originalRow).toBe(existing.originalRow)
  expect(result.changes[0]).toBe(foreign)
  expect(result.changes[2]).toBe(insert)
})

test("reverting batches removes no-op entries without moving or losing other changes", () => {
  const current = [change(1), change(2), change(3)]
  const result = stageBatchUpdates({
    ...options,
    current,
    rows: [row(1), row(3)],
    column: field,
    value: "original",
    nextId: () => "unused",
  })
  expect(result.changes).toEqual(current.slice(1, 2))
  expect(result.stagedCount).toBe(0)
  expect(current).toHaveLength(3)
})

test("deletes reuse IDs and snapshots, and later updates cannot resurrect them", () => {
  const current = [change(1)]
  const result = stageBatchDeletes({
    ...options,
    current,
    rows: [row(1), row(2)],
    nextId: () => "deleted-2",
  })
  expect(result.stagedCount).toBe(2)
  expect(result.changes.map((entry) => entry.id)).toEqual(["change-1", "deleted-2"])
  expect(result.changes[0]?.originalRow).toBe(current[0]?.originalRow)
  expect(result.changes.every((entry) => entry.mutation.kind === "delete" && !entry.approved)).toBe(
    true,
  )
  expect(
    stageBatchUpdates({
      ...options,
      current: result.changes,
      rows: [row(1), row(2)],
      column: field,
      value: "new",
      nextId: () => "unused",
    }).changes,
  ).toEqual(result.changes)
})

test("duplicate existing targets retain the original first-match behavior", () => {
  const first = change(1)
  const second = { ...change(1), id: "second" }
  const result = stageBatchUpdates({
    ...options,
    current: [first, second],
    rows: [row(1), row(1)],
    column: field,
    value: "original",
    nextId: () => "unused",
  })
  expect(result.changes).toEqual([])
  expect(result.stagedCount).toBe(0)
})
