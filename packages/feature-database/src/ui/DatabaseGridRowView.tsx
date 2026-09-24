import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { memo } from "react"
import type { DatabaseGridRow } from "../model/workspace"
import { BATCH_SELECTOR_WIDTH } from "../rendering/constants"
import { queryCellForeground, queryRowColors } from "../rendering/query-presentation"
import { fitCell } from "../rendering/workspace-shared"

export const DatabaseGridRowView = memo(function DatabaseGridRowView({
  gridRow,
  rowIndex,
  idPrefix,
  rowIdSegment,
  columns,
  columnOffset,
  cellWidth,
  separateCells,
  selectedColumnIndex,
  batchSelected,
  selectionForeground,
  selectionBackground,
  onToggleBatch,
  onSelectCell,
}: {
  gridRow: DatabaseGridRow
  rowIndex: number
  idPrefix: string
  rowIdSegment: "row" | "result-row"
  columns: readonly string[]
  columnOffset: number
  cellWidth: number
  separateCells: boolean
  selectedColumnIndex: number
  batchSelected: boolean
  selectionForeground: string
  selectionBackground: string
  onToggleBatch: (rowIndex: number, gridRow: DatabaseGridRow) => void
  onSelectCell: (rowIndex: number, columnIndex: number) => void
}) {
  const mutationKind = gridRow.change?.mutation.kind
  const { background: rowBackground, accent: rowAccent } = queryRowColors(mutationKind, rowIndex)
  return (
    <box
      id={`${idPrefix}-${rowIdSegment}-${rowIndex}`}
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: rowBackground,
      }}
    >
      <Button
        id={`${idPrefix}-select-row-${rowIndex}`}
        onPress={() => onToggleBatch(rowIndex, gridRow)}
        height={1}
        width={BATCH_SELECTOR_WIDTH}
        flexShrink={0}
      >
        <text
          content={batchSelected ? "● " : "○ "}
          style={{
            fg: batchSelected ? COLORS.database : COLORS.muted,
            bg: rowBackground,
          }}
        />
      </Button>
      <text content="│" style={{ fg: COLORS.border, bg: rowBackground }} />
      {columns.map((column, visibleIndex) => {
        const absoluteIndex = columnOffset + visibleIndex
        const selectedCell = absoluteIndex === selectedColumnIndex
        const changedCell =
          gridRow.change?.mutation.kind === "update" &&
          Object.hasOwn(gridRow.change.mutation.values, column)
        const cell = (
          <Button
            key={column}
            id={`${idPrefix}-cell-${rowIndex}-${absoluteIndex}`}
            onPress={() => onSelectCell(rowIndex, absoluteIndex)}
            height={1}
            width={cellWidth}
            flexShrink={0}
          >
            {(state) => (
              <text
                content={fitCell(gridRow.data[column], cellWidth)}
                style={{
                  fg: queryCellForeground(
                    selectedCell,
                    Boolean(changedCell || mutationKind),
                    state.focused,
                    rowAccent,
                    selectionForeground,
                  ),
                  bg: selectedCell ? selectionBackground : rowBackground,
                }}
              />
            )}
          </Button>
        )
        if (!separateCells) return cell
        return (
          <box key={column} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            {cell}
            {visibleIndex < columns.length - 1 ? (
              <text content="│" style={{ fg: COLORS.border, bg: rowBackground }} />
            ) : null}
          </box>
        )
      })}
    </box>
  )
})
