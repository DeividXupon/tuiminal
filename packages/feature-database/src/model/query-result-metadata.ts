/** Normalize result metadata shared by the main database service and SQLite query child. */
export function queryResultColumns(result: unknown, rows: Array<Record<string, unknown>>) {
  if (rows[0]) return Object.keys(rows[0])
  if (!result || typeof result !== "object") return []
  const columns = (result as { columns?: unknown }).columns
  if (!Array.isArray(columns)) return []
  return columns.flatMap((column) => {
    if (typeof column === "string") return [column]
    if (
      column &&
      typeof column === "object" &&
      typeof (column as { name?: unknown }).name === "string"
    ) {
      return [(column as { name: string }).name]
    }
    return []
  })
}

export function affectedRowCount(result: unknown) {
  if (!result || typeof result !== "object") return null
  const metadata = result as {
    affectedRows?: unknown
    changes?: unknown
    count?: unknown
    rowCount?: unknown
  }
  for (const value of [
    metadata.affectedRows,
    metadata.changes,
    metadata.count,
    metadata.rowCount,
  ]) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "bigint") return Number(value)
  }
  return null
}
