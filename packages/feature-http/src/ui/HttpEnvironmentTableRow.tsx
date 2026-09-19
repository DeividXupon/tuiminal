import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"

export type HttpEnvironmentRow = { id: string; name: string; value: string }
export type HttpEnvironmentFormMode = "overview" | "choose" | "name" | "table" | "cell"

type Props = {
  row: HttpEnvironmentRow
  index: number
  mode: HttpEnvironmentFormMode
  rowIndex: number
  column: 0 | 1
  onRowChange: (index: number, column: 0 | 1, value: string) => void
  onFocusCell: (index: number, column: 0 | 1) => void
}

function cellStyle(background: string, selected: boolean) {
  const cellBackground = selected ? COLORS.http : background
  const foreground = selected ? COLORS.canvas : COLORS.text
  return {
    flexGrow: 0,
    backgroundColor: cellBackground,
    focusedBackgroundColor: cellBackground,
    textColor: foreground,
    focusedTextColor: foreground,
    selectionFg: COLORS.text,
    cursorColor: COLORS.http,
    placeholderColor: selected ? COLORS.canvas : COLORS.muted,
  }
}

export function HttpEnvironmentTableRow({
  row,
  index,
  mode,
  rowIndex,
  column,
  onRowChange,
  onFocusCell,
}: Props) {
  const background = index % 2 === 0 ? COLORS.panelAlt : COLORS.panelRaised
  const activeRow = rowIndex === index && (mode === "table" || mode === "cell")
  const selectedVariable = mode === "table" && rowIndex === index && column === 0
  const selectedValue = mode === "table" && rowIndex === index && column === 1
  return (
    <box
      id={`http-environment-row-${index}`}
      style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: background }}
    >
      <text content={activeRow && column === 0 ? "▸" : " "} style={{ width: 2, fg: COLORS.http }} />
      <input
        id={`http-environment-create-variable-${index}`}
        value={row.name}
        placeholder={translateUi("variável")}
        maxLength={120}
        onInput={(value) => onRowChange(index, 0, value)}
        onMouseDown={() => onFocusCell(index, 0)}
        style={{ ...cellStyle(background, selectedVariable), width: "44%" }}
      />
      <text content={activeRow && column === 1 ? "▸" : " "} style={{ width: 2, fg: COLORS.http }} />
      <input
        id={`http-environment-create-value-${index}`}
        value={row.value}
        placeholder={translateUi("valor privado")}
        maxLength={4096}
        onInput={(value) => onRowChange(index, 1, value)}
        onMouseDown={() => onFocusCell(index, 1)}
        style={{ ...cellStyle(background, selectedValue), width: "48%" }}
      />
    </box>
  )
}
