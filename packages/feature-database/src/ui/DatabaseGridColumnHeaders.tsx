import { COLORS, databaseSelectionColors } from "@xupon/tuiminal-core/settings/theme"
import type { DatabaseTableQuery, TablePage } from "../model/types"
import { fitCell } from "../rendering/workspace-shared"

export function DatabaseGridColumnHeaders({
  columns,
  columnOffset,
  selectedColumnIndex,
  active,
  sort,
}: {
  columns: TablePage["columns"]
  columnOffset: number
  selectedColumnIndex: number
  active: boolean
  sort: DatabaseTableQuery["sort"]
}) {
  const selection = databaseSelectionColors()
  return columns.map((column, visibleIndex) => {
    const selected = active && columnOffset + visibleIndex === selectedColumnIndex
    const sortMarker = sort?.column === column.field ? (sort.direction === "asc" ? " ↑" : " ↓") : ""
    return (
      <box key={column.field} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text
          content={fitCell(`${column.key === "PRI" ? "◆ " : ""}${column.field}${sortMarker}`)}
          style={{
            fg: selected ? selection.foreground : COLORS.database,
            bg: selected ? selection.background : COLORS.panelRaised,
          }}
        />
        {visibleIndex < columns.length - 1 ? (
          <text content="│" style={{ fg: COLORS.border, bg: COLORS.panelRaised }} />
        ) : null}
      </box>
    )
  })
}
