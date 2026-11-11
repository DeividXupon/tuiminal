import type { ScrollBoxRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, databaseSelectionColors } from "@xupon/tuiminal-core/settings/theme"
import { useRef } from "react"
import type { DatabaseGridRow } from "../model/workspace"
import { BATCH_SELECTOR_WIDTH, CELL_WIDTH } from "../rendering/constants"
import { fitCell } from "../rendering/workspace-shared"
import { DatabaseGridRowView } from "../ui/DatabaseGridRowView"
import { RowInspector } from "../ui/RowInspector"
import { DEMO_COLUMNS, noop, tutorialRowTarget, type TutorialState } from "./fixtures"

export function DatabaseTutorialData({
  rows,
  state,
  width,
  inspectorWidth,
  detailOnly,
  active,
}: {
  rows: DatabaseGridRow[]
  state: TutorialState
  width: number
  inspectorWidth: number
  detailOnly: boolean
  active: boolean
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const colors = databaseSelectionColors()
  const gridWidth = width - (inspectorWidth && !detailOnly ? inspectorWidth + 1 : 0)
  const count = Math.max(1, Math.floor((gridWidth - BATCH_SELECTOR_WIDTH - 1) / (CELL_WIDTH + 1)))
  const columnIndex = state.columnIndex
  const offset = Math.max(0, columnIndex - count + 1)
  const columns = DEMO_COLUMNS.slice(offset, offset + count)
  const selectedRow = state.rowIndex
  const pending = rows.filter((row) => row.change).length
  const summary =
    gridWidth < 65
      ? `1–6 · cél ${selectedRow + 1},${columnIndex + 1}${width < 64 ? "" : ` · ${rows.length} itens`}${pending || width >= 64 ? ` · ${pending} pend.` : ""}`
      : `CÉLULA ${selectedRow + 1},${columnIndex + 1}  •  ${rows.length} REGISTROS  •  ${pending} ALTERAÇÕES PENDENTES  •  1–6`
  return (
    <box style={{ flexGrow: 1, minHeight: 1, flexDirection: "row" }}>
      {!detailOnly && (
        <box id="tutorial-db-table-grid" style={{ flexGrow: 1, minWidth: 1 }}>
          <text
            id="database-table-summary"
            content={translateUi(summary)}
            wrapMode="none"
            style={{ height: 1, flexShrink: 0, fg: state.masked ? COLORS.warning : COLORS.muted }}
          />
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <text
              content={state.selected ? "◆  " : "◇  "}
              style={{ width: BATCH_SELECTOR_WIDTH, fg: COLORS.muted, bg: COLORS.panelRaised }}
            />
            <text content="│" style={{ fg: COLORS.border, bg: COLORS.panelRaised }} />
            {columns.map((column, index) => (
              <box key={column.field} style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
                <text
                  content={fitCell(
                    `${column.key === "PRI" ? "◆ " : ""}${column.field}${state.sorted && index === 0 ? " ↑" : ""}`,
                  )}
                  style={{
                    fg:
                      active && offset + index === columnIndex
                        ? colors.foreground
                        : COLORS.database,
                    bg:
                      active && offset + index === columnIndex
                        ? colors.background
                        : COLORS.panelRaised,
                  }}
                />
                {index < columns.length - 1 && (
                  <text content="│" style={{ fg: COLORS.border, bg: COLORS.panelRaised }} />
                )}
              </box>
            ))}
          </box>
          <scrollbox
            id="database-table-rows"
            scrollY
            viewportCulling
            style={{ flexGrow: 1, backgroundColor: COLORS.panel }}
            verticalScrollbarOptions={{
              trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
            }}
          >
            {rows.map((row, index) => (
              <box
                key={row.id}
                {...tutorialRowTarget(state, index)}
                style={{ height: 1, flexShrink: 0 }}
              >
                <DatabaseGridRowView
                  gridRow={row}
                  rowIndex={index}
                  idPrefix="database"
                  rowIdSegment="row"
                  columns={columns.map((column) => column.field)}
                  columnOffset={offset}
                  cellWidth={CELL_WIDTH}
                  separateCells
                  selectedColumnIndex={active && index === selectedRow ? columnIndex : -1}
                  batchSelected={state.selected && index < 2}
                  selectionForeground={colors.foreground}
                  selectionBackground={colors.background}
                  onToggleBatch={noop}
                  onSelectCell={noop}
                />
              </box>
            ))}
          </scrollbox>
        </box>
      )}
      {(inspectorWidth > 0 || detailOnly) && (
        <RowInspector
          columns={DEMO_COLUMNS}
          row={rows[selectedRow]?.data ?? null}
          rowIndex={selectedRow}
          rowCount={rows.length}
          width={detailOnly ? "100%" : inspectorWidth}
          scrollRef={scrollRef}
          active={state.inspector}
          selectedColumnIndex={columnIndex}
          onActivate={noop}
          onSelectColumn={noop}
        />
      )}
    </box>
  )
}
