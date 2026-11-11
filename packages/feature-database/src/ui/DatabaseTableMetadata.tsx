import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { DatabaseColumn, DatabaseIndex } from "../model/types"
import { fitCell } from "../rendering/workspace-shared"

export function DatabaseTableMetadata({
  width,
  columns,
  indexes,
  view,
}: {
  width: number
  columns: DatabaseColumn[]
  indexes: DatabaseIndex[] | null
  view: "columns" | "indexes"
}) {
  const nameWidth = Math.max(
    10,
    Math.min(28, Math.floor(width * (view === "columns" ? 0.34 : 0.32))),
  )
  const typeWidth = view === "columns" ? Math.max(9, Math.min(24, Math.floor(width * 0.3))) : 9
  const detailWidth = Math.max(8, width - nameWidth - typeWidth)
  const line = (name: string, type: string, detail: string) =>
    `${fitCell(name, nameWidth)}${fitCell(type, typeWidth)}${fitCell(detail, detailWidth)}`
  return (
    <box style={{ flexGrow: 1 }}>
      <text
        content={line(
          translateUi(view === "columns" ? "COLUNA" : "ÍNDICE"),
          translateUi("TIPO"),
          translateUi(view === "columns" ? "ATRIBUTOS" : "DEFINIÇÃO / COLUNAS"),
        )}
        style={{ fg: COLORS.database, bg: COLORS.panelRaised }}
      />
      {view === "columns" ? (
        columns.map((column) => (
          <text
            key={column.field}
            content={line(
              column.field,
              column.type,
              [
                column.key === "PRI" ? "PK" : column.key,
                column.nullable ? "NULL" : "NOT NULL",
                column.defaultValue === null
                  ? translateUi("sem padrão")
                  : `= ${column.defaultValue}`,
              ]
                .filter(Boolean)
                .join(" · "),
            )}
            style={{ fg: column.key === "PRI" ? COLORS.database : COLORS.text }}
          />
        ))
      ) : indexes === null ? null : indexes.length ? (
        indexes.map((index) => (
          <text
            key={index.name}
            content={line(index.name, index.unique ? "UNIQUE" : "INDEX", index.definition)}
            style={{ fg: index.unique ? COLORS.database : COLORS.text }}
          />
        ))
      ) : (
        <text content={translateUi("Nenhum índice encontrado.")} style={{ fg: COLORS.muted }} />
      )}
    </box>
  )
}
