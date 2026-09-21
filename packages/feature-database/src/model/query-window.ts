import type { DatabaseQueryResult } from "./types"

export const DATABASE_QUERY_RESULT_WINDOW_SIZE = 50
export const DATABASE_QUERY_RESULT_WINDOW_STEP = 40
export const DATABASE_QUERY_RESULT_WINDOW_OVERLAP =
  DATABASE_QUERY_RESULT_WINDOW_SIZE - DATABASE_QUERY_RESULT_WINDOW_STEP

export type DatabaseQueryWindowDirection = -1 | 1

export function databaseQueryWindowTarget({
  direction,
  windowOffset,
  rowCount,
  hasRowsBefore,
  hasRowsAfter,
}: {
  direction: DatabaseQueryWindowDirection
  windowOffset: number
  rowCount: number
  hasRowsBefore: boolean
  hasRowsAfter: boolean
}) {
  const offset = Math.max(0, Math.floor(windowOffset))
  const count = Math.max(0, Math.floor(rowCount))
  if (direction < 0) {
    if (!hasRowsBefore || offset === 0) return null
    const nextOffset = Math.max(0, offset - DATABASE_QUERY_RESULT_WINDOW_STEP)
    return {
      offset: nextOffset,
      fetchOffset: nextOffset,
      selectedIndex: Math.max(0, offset - 1 - nextOffset),
    }
  }
  if (!hasRowsAfter || count === 0) return null
  const nextOffset = offset + DATABASE_QUERY_RESULT_WINDOW_STEP
  return {
    offset: nextOffset,
    fetchOffset: offset + count,
    selectedIndex: Math.max(0, offset + count - nextOffset),
  }
}

export function mergeDatabaseQueryWindow({
  current,
  fetched,
  direction,
  windowOffset,
}: {
  current: DatabaseQueryResult
  fetched: DatabaseQueryResult
  direction: DatabaseQueryWindowDirection
  windowOffset: number
}) {
  const rows =
    direction < 0
      ? [...fetched.rows, ...current.rows.slice(0, DATABASE_QUERY_RESULT_WINDOW_OVERLAP)]
      : [...current.rows.slice(-DATABASE_QUERY_RESULT_WINDOW_OVERLAP), ...fetched.rows]
  const hasRowsBefore = windowOffset > 0
  const hasRowsAfter =
    direction > 0
      ? fetched.hasRowsAfter
      : current.rows.length > DATABASE_QUERY_RESULT_WINDOW_OVERLAP || current.hasRowsAfter
  return {
    ...fetched,
    rows,
    rowCount: rows.length,
    windowOffset,
    hasRowsBefore,
    hasRowsAfter,
    truncated: hasRowsBefore || hasRowsAfter,
  }
}
