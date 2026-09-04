export function databaseSidebarWidth(terminalWidth: number) {
  if (terminalWidth < 72) return 20
  if (terminalWidth < 100) return 24
  return 32
}

export function databaseActionRowCount(tableAreaWidth: number, dataView: boolean) {
  if (!dataView) return 1
  return tableAreaWidth < 64 ? 3 : 2
}

export function nextDatabaseTableSort(
  current: { column: string; direction: "asc" | "desc" } | null,
  column: string,
) {
  if (current?.column !== column) return { column, direction: "asc" as const }
  if (current.direction === "asc") return { column, direction: "desc" as const }
  return null
}

export function databasePageChromeRows({
  hasTableHistory,
  actionRowCount,
  compactActions,
}: {
  hasTableHistory: boolean
  actionRowCount: number
  compactActions: boolean
}) {
  // History has one row for table tabs and another for its full-width divider.
  const historyRows = hasTableHistory ? 2 : 0
  return 12 + historyRows + Math.max(0, actionRowCount - 1) + (compactActions ? 1 : 0)
}

export type DatabaseHorizontalPane = "catalog" | "grid" | "inspector"
export type DatabaseHorizontalNavigationAction =
  | "previous-column"
  | "next-column"
  | "previous-pane"
  | "next-pane"

export function databaseHorizontalKeyDirection(keyName: string): -1 | 1 | null {
  if (keyName === "h" || keyName === "left") return -1
  if (keyName === "l" || keyName === "right") return 1
  return null
}

export function databaseHorizontalNavigationAction({
  pane,
  direction,
  hasSelectedTable,
  dataView,
  selectedColumnIndex,
  columnCount,
}: {
  pane: DatabaseHorizontalPane
  direction: -1 | 1
  hasSelectedTable: boolean
  dataView: boolean
  selectedColumnIndex: number
  columnCount: number
}): DatabaseHorizontalNavigationAction | null {
  if (pane === "catalog") {
    return direction === 1 && hasSelectedTable ? "next-pane" : null
  }
  if (pane === "inspector") {
    return direction === -1 ? "previous-pane" : null
  }

  const lastColumnIndex = Math.max(0, columnCount - 1)
  if (dataView && columnCount > 0) {
    if (direction === -1 && selectedColumnIndex > 0) return "previous-column"
    if (direction === 1 && selectedColumnIndex < lastColumnIndex) return "next-column"
  }

  if (direction === -1) return "previous-pane"
  if (direction === 1 && dataView && hasSelectedTable) return "next-pane"
  return null
}

export function databaseResultHorizontalNavigationAction({
  pane,
  direction,
  selectedColumnIndex,
  columnCount,
  inspectorVisible,
}: {
  pane: "grid" | "inspector"
  direction: -1 | 1
  selectedColumnIndex: number
  columnCount: number
  inspectorVisible: boolean
}): DatabaseHorizontalNavigationAction | null {
  if (pane === "inspector") return direction === -1 ? "previous-pane" : null

  const lastColumnIndex = Math.max(0, columnCount - 1)
  if (direction === -1 && selectedColumnIndex > 0) return "previous-column"
  if (direction === 1 && selectedColumnIndex < lastColumnIndex) return "next-column"
  if (direction === 1 && inspectorVisible) return "next-pane"
  return null
}

export function preserveDatabasePageSelection({
  pageIndex,
  rowIndex,
  previousPageSize,
  nextPageSize,
}: {
  pageIndex: number
  rowIndex: number
  previousPageSize: number
  nextPageSize: number
}) {
  const safePreviousSize = Math.max(1, Math.floor(previousPageSize))
  const safeNextSize = Math.max(1, Math.floor(nextPageSize))
  const absoluteRowIndex =
    Math.max(0, Math.floor(pageIndex)) * safePreviousSize + Math.max(0, Math.floor(rowIndex))
  return {
    pageIndex: Math.floor(absoluteRowIndex / safeNextSize),
    rowIndex: absoluteRowIndex % safeNextSize,
  }
}
