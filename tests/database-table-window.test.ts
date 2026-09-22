import { describe, expect, test } from "bun:test"
import { databaseQueryWindowTarget } from "../packages/feature-database/src/model/query-window"
import {
  DATABASE_TABLE_WINDOW_SIZE,
  DATABASE_TABLE_WINDOW_STEP,
  mergeDatabaseTableWindow,
} from "../packages/feature-database/src/model/table-window"
import type { TablePage } from "../packages/feature-database/src/model/types"

function page(offset: number, count: number, hasMore: boolean): TablePage {
  return {
    columns: [{ field: "id", type: "INTEGER", nullable: false, key: "PRI", defaultValue: null }],
    rows: Array.from({ length: count }, (_, index) => ({ id: offset + index + 1 })),
    rowKeys: Array.from({ length: count }, (_, index) => ({ id: offset + index + 1 })),
    hasMore,
  }
}

describe("main table sliding window", () => {
  test("loads 40 past either edge of a 50-row window", () => {
    expect(DATABASE_TABLE_WINDOW_SIZE).toBe(50)
    expect(DATABASE_TABLE_WINDOW_STEP).toBe(40)
    expect(
      databaseQueryWindowTarget({
        direction: 1,
        windowOffset: 0,
        rowCount: 50,
        hasRowsBefore: false,
        hasRowsAfter: true,
      }),
    ).toEqual({ offset: 40, fetchOffset: 50, selectedIndex: 10 })
    expect(
      databaseQueryWindowTarget({
        direction: -1,
        windowOffset: 40,
        rowCount: 50,
        hasRowsBefore: true,
        hasRowsAfter: true,
      }),
    ).toEqual({ offset: 0, fetchOffset: 0, selectedIndex: 39 })
  })

  test("discards 40 opposite rows while retaining rows and keys for the 10-row overlap", () => {
    const first = page(0, 50, true)
    const second = mergeDatabaseTableWindow(first, page(50, 40, true), 1)
    expect(second.rows).toHaveLength(50)
    expect(second.rows[0]).toEqual({ id: 41 })
    expect(second.rows.at(-1)).toEqual({ id: 90 })
    expect(second.rows[0]).toBe(first.rows[40])
    expect(second.rowKeys[0]).toBe(first.rowKeys[40])

    const restored = mergeDatabaseTableWindow(second, page(0, 40, true), -1)
    expect(restored.rows).toHaveLength(50)
    expect(restored.rows.at(-1)).toEqual({ id: 50 })
    expect(restored.rows[40]).toBe(second.rows[0])
    expect(restored.rowKeys[40]).toBe(second.rowKeys[0])
    expect(restored.hasMore).toBe(true)
  })

  test("keeps a short final window and stops loading after the last row", () => {
    const last = mergeDatabaseTableWindow(page(40, 50, true), page(90, 12, false), 1)
    expect(last.rows).toHaveLength(22)
    expect(last.rows[0]).toEqual({ id: 81 })
    expect(last.rows.at(-1)).toEqual({ id: 102 })
    expect(last.hasMore).toBe(false)
    expect(
      databaseQueryWindowTarget({
        direction: 1,
        windowOffset: 80,
        rowCount: last.rows.length,
        hasRowsBefore: true,
        hasRowsAfter: last.hasMore,
      }),
    ).toBeNull()
  })
})
