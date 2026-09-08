import { ShortcutText } from "../../../shared/ui/ShortcutText"
import type { ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import type { DatabaseColumn } from "../model/types"
import { translateUi } from "../../../shared/i18n/index"
import {
  COLORS,
  databaseSelectionColors,
  focusedPanelBorder,
  LAYOUT,
} from "../../../core/settings/theme"
import { shorten, detailValue } from "../rendering/workspace-shared"

export function RowInspector({
  columns,
  row,
  rowIndex,
  rowCount,
  width,
  scrollRef,
  active,
  selectedColumnIndex,
  onActivate,
  onSelectColumn,
  idPrefix,
}: {
  columns: DatabaseColumn[]
  row: Record<string, unknown> | null
  rowIndex: number
  rowCount: number
  width: number | `${number}%`
  scrollRef: React.RefObject<ScrollBoxRenderable | null>
  active: boolean
  selectedColumnIndex: number
  onActivate: () => void
  onSelectColumn: (index: number) => void
  idPrefix?: string
}) {
  const selectionColors = databaseSelectionColors()
  return (
    <box
      id={idPrefix ?? "tutorial-db-inspector"}
      style={{
        width,
        height: "100%",
        flexShrink: 0,
        ...(typeof width === "number"
          ? LAYOUT.compact
            ? focusedPanelBorder(active, COLORS.database)
            : {
                border: ["left"] as const,
                borderColor: active ? COLORS.database : COLORS.border,
              }
          : {}),
        backgroundColor: active ? COLORS.panelAlt : COLORS.panel,
        paddingLeft: 1,
        flexDirection: "column",
      }}
    >
      <box
        style={{
          height: active ? 3 : 2,
          flexShrink: 0,
          flexDirection: "column",
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <text
          content={
            row
              ? `${active ? "◆" : "◇"} ${translateUi("REGISTRO")} ${rowIndex + 1} / ${rowCount}`
              : `◇ ${translateUi("SEM REGISTRO")}`
          }
          style={{
            height: 1,
            flexShrink: 0,
            fg: active ? COLORS.database : COLORS.muted,
          }}
        />
        {active ? (
          <ShortcutText
            content={translateUi(
              typeof width === "number" && width < 40
                ? "[↑↓] campo · [E/Enter] editar"
                : "[↑↓/J/K] campo · [E/Enter] editar",
            )}
            style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
          />
        ) : null}
      </box>
      {row ? (
        <scrollbox
          ref={scrollRef}
          id={idPrefix ? `${idPrefix}-fields` : "tutorial-db-inspector-fields"}
          scrollY
          viewportCulling
          style={{ flexGrow: 1, width: "100%" }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: COLORS.panel,
              foregroundColor: COLORS.border,
            },
          }}
        >
          {columns.map((column, index) => {
            const value = detailValue(row[column.field])
            const availableWidth = typeof width === "number" ? width - 3 : 40
            const selected = index === selectedColumnIndex
            return (
              <Button
                key={column.field}
                id={idPrefix ? `${idPrefix}-field-${index}` : `database-inspector-field-${index}`}
                onPress={() => {
                  onActivate()
                  onSelectColumn(index)
                }}
                height={2}
                width="100%"
                flexShrink={0}
              >
                {(state) => (
                  <box
                    style={{
                      height: 2,
                      flexShrink: 0,
                      flexDirection: "column",
                      paddingLeft: 1,
                      backgroundColor:
                        active && selected
                          ? selectionColors.background
                          : state.focused || selected
                            ? COLORS.panelRaised
                            : index % 2 === 0
                              ? COLORS.panel
                              : COLORS.panelAlt,
                    }}
                  >
                    <text
                      content={`${selected ? "› " : "  "}${column.field}`}
                      style={{
                        fg: active && selected ? selectionColors.foreground : COLORS.muted,
                      }}
                    />
                    <text
                      content={shorten(value, Math.max(8, availableWidth))}
                      style={{
                        fg:
                          active && selected
                            ? selectionColors.foreground
                            : value === "NULL"
                              ? COLORS.warning
                              : COLORS.text,
                      }}
                    />
                  </box>
                )}
              </Button>
            )
          })}
        </scrollbox>
      ) : (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <text
            content={translateUi("Nenhum registro nesta página.")}
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
    </box>
  )
}
