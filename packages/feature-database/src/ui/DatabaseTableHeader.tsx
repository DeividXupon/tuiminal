import { Button } from "@tuiparts/react/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { DatabaseTable } from "../model/types"
import { type DatabaseView, tableKey } from "../model/workspace"
import { tableHistoryPresentation } from "../rendering/workspace-shared"

const VIEW_LABELS = ["[1] Dados", "[2] Colunas", "[3] Índices", "[4] Schema"] as const

export function DatabaseTableHeader({
  width,
  view,
  history,
  selectedTable,
  onView,
  onTable,
  onNavigate,
}: {
  width: number
  view: DatabaseView
  history: DatabaseTable[]
  selectedTable: DatabaseTable
  onView: (view: DatabaseView) => void
  onTable: (table: DatabaseTable) => void
  onNavigate: (direction: -1 | 1) => void
}) {
  const fullViewWidth = VIEW_LABELS.reduce(
    (total, label) => total + displayWidth(translateUi(label)) + 2,
    0,
  )
  // Keep one readable table beside the view controls before expanding their labels.
  const compact = width < fullViewWidth + 30
  const viewWidth = compact ? 20 : fullViewWidth
  const historyWidth = Math.max(1, width - viewWidth - 3)
  const showArrows = historyWidth >= 18
  const navigationWidth = showArrows ? 12 : 0
  const { visible, currentIndex, visibleStart, itemWidth } = tableHistoryPresentation(
    history,
    selectedTable,
    historyWidth,
    navigationWidth,
  )
  return (
    <box
      id="database-table-header"
      style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: COLORS.panel }}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="tutorial-db-view-data"
          label={compact ? "[1]" : VIEW_LABELS[0]}
          accent={COLORS.database}
          active={view === "data"}
          onPress={() => onView("data")}
        />
        <InlineButton
          id="tutorial-db-view-columns"
          label={compact ? "[2]" : VIEW_LABELS[1]}
          accent={COLORS.database}
          active={view === "columns"}
          onPress={() => onView("columns")}
        />
        <InlineButton
          id="tutorial-db-view-indexes"
          label={compact ? "[3]" : VIEW_LABELS[2]}
          accent={COLORS.database}
          active={view === "indexes"}
          onPress={() => onView("indexes")}
        />
        <InlineButton
          id="tutorial-db-view-schema"
          label={compact ? "[4]" : VIEW_LABELS[3]}
          accent={COLORS.database}
          active={view === "schema"}
          onPress={() => onView("schema")}
        />
      </box>
      <text
        content={"─".repeat(Math.max(1, width))}
        wrapMode="none"
        style={{
          height: 1,
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 1,
          overflow: "hidden",
          fg: COLORS.border,
        }}
      />
      <box
        id="tutorial-db-table-history"
        style={{ height: 1, flexShrink: 0, flexDirection: "row" }}
      >
        {showArrows ? (
          <DirectionalButton
            id="database-table-history-previous"
            direction={-1}
            accent={COLORS.database}
            disabled={currentIndex <= 0}
            onPress={() => onNavigate(-1)}
          />
        ) : null}
        {visible.map((table, index) => {
          const current = visibleStart + index === currentIndex
          return (
            <Button
              key={tableKey(table)}
              id={`database-table-history-${visibleStart + index}`}
              height={1}
              flexShrink={0}
              onPress={() => onTable(table)}
            >
              {(state) => {
                const highlighted = current || state.focused
                const activeBackground = LAYOUT.compact ? COLORS.diffModifiedBg : COLORS.panelRaised
                return (
                  <text
                    content={` ${truncateDisplay(table.name, Math.max(1, itemWidth - 2))} `}
                    wrapMode="none"
                    style={{
                      fg: state.pressed
                        ? COLORS.canvas
                        : highlighted
                          ? COLORS.database
                          : COLORS.muted,
                      bg: state.pressed
                        ? COLORS.database
                        : highlighted
                          ? activeBackground
                          : COLORS.panel,
                    }}
                  />
                )
              }}
            </Button>
          )
        })}
        {showArrows ? (
          <DirectionalButton
            id="database-table-history-next"
            direction={1}
            accent={COLORS.database}
            disabled={currentIndex < 0 || currentIndex >= history.length - 1}
            onPress={() => onNavigate(1)}
          />
        ) : null}
      </box>
    </box>
  )
}
