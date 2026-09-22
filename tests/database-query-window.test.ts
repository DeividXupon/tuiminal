import { describe, expect, test } from "bun:test"
import {
  DATABASE_QUERY_RESULT_WINDOW_SIZE,
  DATABASE_QUERY_RESULT_WINDOW_STEP,
  databaseQueryWindowTarget,
  mergeDatabaseQueryWindow,
} from "../packages/feature-database/src/model/query-window"

describe("SQL result window", () => {
  test("moves down by 40 rows while selecting the next absolute row", () => {
    expect(DATABASE_QUERY_RESULT_WINDOW_SIZE).toBe(50)
    expect(DATABASE_QUERY_RESULT_WINDOW_STEP).toBe(40)
    expect(
      databaseQueryWindowTarget({
        direction: 1,
        windowOffset: 0,
        rowCount: 50,
        hasRowsBefore: false,
        hasRowsAfter: true,
      }),
    ).toEqual({ offset: 40, fetchOffset: 50, selectedIndex: 10 })
  })

  test("moves up by 40 rows while selecting the previous absolute row", () => {
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

  test("does not request a window past a known result boundary", () => {
    expect(
      databaseQueryWindowTarget({
        direction: -1,
        windowOffset: 0,
        rowCount: 50,
        hasRowsBefore: false,
        hasRowsAfter: true,
      }),
    ).toBeNull()
    expect(
      databaseQueryWindowTarget({
        direction: 1,
        windowOffset: 500,
        rowCount: 120,
        hasRowsBefore: true,
        hasRowsAfter: false,
      }),
    ).toBeNull()
  })

  test("keeps the 10-row overlap and appends only the 40 newly fetched rows", () => {
    const queryResult = (offset: number, count: number, hasRowsAfter: boolean) => ({
      command: "SELECT",
      mutating: false,
      columns: ["id"],
      rows: Array.from({ length: count }, (_, index) => ({ id: offset + index + 1 })),
      rowCount: count,
      windowOffset: offset,
      hasRowsBefore: offset > 0,
      hasRowsAfter,
      affectedRows: null,
      durationMs: 1,
      truncated: offset > 0 || hasRowsAfter,
    })
    const current = queryResult(0, 50, true)
    const merged = mergeDatabaseQueryWindow({
      current,
      fetched: queryResult(50, 40, true),
      direction: 1,
      windowOffset: 40,
    })
    expect(merged.rows).toHaveLength(50)
    expect(merged.rows[0]?.id).toBe(41)
    expect(merged.rows.at(-1)?.id).toBe(90)
    expect(merged.rows[0]).toBe(current.rows[40])

    const restored = mergeDatabaseQueryWindow({
      current: merged,
      fetched: queryResult(0, 40, true),
      direction: -1,
      windowOffset: 0,
    })
    expect(restored.rows).toHaveLength(50)
    expect(restored.rows[0]?.id).toBe(1)
    expect(restored.rows.at(-1)?.id).toBe(50)
    expect(restored.rows[40]).toBe(merged.rows[0])
  })
})
