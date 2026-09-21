import {
  DATABASE_QUERY_RESULT_WINDOW_OVERLAP,
  DATABASE_QUERY_RESULT_WINDOW_SIZE,
  DATABASE_QUERY_RESULT_WINDOW_STEP,
} from "./query-window"
import type { TablePage } from "./types"

export const DATABASE_TABLE_WINDOW_SIZE = DATABASE_QUERY_RESULT_WINDOW_SIZE
export const DATABASE_TABLE_WINDOW_STEP = DATABASE_QUERY_RESULT_WINDOW_STEP

export function mergeDatabaseTableWindow(
  current: TablePage,
  fetched: TablePage,
  direction: -1 | 1,
): TablePage {
  const overlap = DATABASE_QUERY_RESULT_WINDOW_OVERLAP
  const rows =
    direction < 0
      ? [...fetched.rows, ...current.rows.slice(0, overlap)]
      : [...current.rows.slice(-overlap), ...fetched.rows]
  const rowKeys =
    direction < 0
      ? [...fetched.rowKeys, ...current.rowKeys.slice(0, overlap)]
      : [...current.rowKeys.slice(-overlap), ...fetched.rowKeys]
  return {
    columns: fetched.columns,
    rows,
    rowKeys,
    hasMore: direction > 0 ? fetched.hasMore : current.rows.length > overlap || current.hasMore,
  }
}
