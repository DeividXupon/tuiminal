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

export function databaseLoadingInsets({
  hasTableHistory,
  hasSelectedTable,
  actionRowCount,
  compactActions,
}: {
  hasTableHistory: boolean
  hasSelectedTable: boolean
  actionRowCount: number
  compactActions: boolean
}) {
  return {
    top: (hasTableHistory ? 2 : 0) + (hasSelectedTable ? actionRowCount : 0),
    bottom: compactActions ? 3 : 2,
  }
}

export type DatabaseHorizontalPane = "catalog" | "grid" | "inspector"
export type DatabaseHorizontalNavigationAction =
  | "previous-column"
  | "next-column"
  | "previous-pane"
  | "next-pane"
export type DatabaseResultHorizontalNavigationAction =
  | DatabaseHorizontalNavigationAction
  | "previous-workspace-pane"

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
}): DatabaseResultHorizontalNavigationAction | null {
  if (pane === "inspector") return direction === -1 ? "previous-pane" : null

  const lastColumnIndex = Math.max(0, columnCount - 1)
  if (direction === -1 && selectedColumnIndex > 0) return "previous-column"
  if (direction === -1) return "previous-workspace-pane"
  if (direction === 1 && selectedColumnIndex < lastColumnIndex) return "next-column"
  if (direction === 1 && inspectorVisible) return "next-pane"
  return null
}

export function databaseResultScrollTop({
  selectedRowIndex,
  currentScrollTop,
  viewportHeight,
  rowCount,
}: {
  selectedRowIndex: number
  currentScrollTop: number
  viewportHeight: number
  rowCount: number
}) {
  const visibleRows = Math.max(1, Math.floor(viewportHeight))
  const lastRowIndex = Math.max(0, Math.floor(rowCount) - 1)
  const selected = Math.max(0, Math.min(lastRowIndex, Math.floor(selectedRowIndex)))
  const maximumScrollTop = Math.max(0, lastRowIndex - visibleRows + 1)
  const current = Math.max(0, Math.min(maximumScrollTop, Math.floor(currentScrollTop)))
  if (selected < current) return selected
  if (selected >= current + visibleRows) {
    return Math.min(maximumScrollTop, selected - visibleRows + 1)
  }
  return current
}
