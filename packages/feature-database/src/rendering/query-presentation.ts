import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { DatabaseQueryWindowDirection } from "../model/query-window"
import type { SqlCompletionKind } from "../model/sql-autocomplete"
import type { DatabaseQueryResult, DatabaseTableMutation } from "../model/types"

export function queryCompletionPresentation(kind: SqlCompletionKind) {
  switch (kind) {
    case "keyword":
      return { icon: "K", accent: "#c792ea" }
    case "function":
      return { icon: "ƒ", accent: "#82aaff" }
    case "table":
      return { icon: "▦", accent: COLORS.database }
    case "column":
      return { icon: "◇", accent: "#80cbc4" }
  }
}

export function queryRowColors(kind: DatabaseTableMutation["kind"] | undefined, index: number) {
  switch (kind) {
    case "insert":
      return { background: COLORS.databaseInsertedBg, accent: COLORS.runner }
    case "delete":
      return { background: COLORS.databaseDeletedBg, accent: COLORS.danger }
    case "update":
      return { background: COLORS.databaseEditedBg, accent: COLORS.warning }
    default:
      return {
        background: index % 2 === 0 ? COLORS.panel : COLORS.panelRaised,
        accent: COLORS.text,
      }
  }
}

export function queryCellForeground(
  selected: boolean,
  changed: boolean,
  focused: boolean,
  rowAccent: string,
  selectionForeground: string,
) {
  if (selected) return selectionForeground
  if (changed) return rowAccent
  return focused ? COLORS.text : COLORS.muted
}

export function queryResultSummary(
  result: DatabaseQueryResult | null,
  compact: boolean,
  hasMaskedValues: boolean,
) {
  if (!result) return translateUi("O resultado aparecerá aqui")
  if (result.mutating) {
    return `${result.command} · ${result.affectedRows ?? "?"} ${translateUi("linha(s) afetada(s)")} · ${result.durationMs.toFixed(1)} ms`
  }
  const bounded = result.hasRowsBefore || result.hasRowsAfter
  const rows = bounded
    ? `${result.windowOffset + 1}–${result.windowOffset + result.rowCount} ${translateUi("linhas")} ${result.hasRowsBefore ? "↑" : ""}${result.hasRowsAfter ? "↓" : ""}`
    : `${result.rowCount} ${translateUi(compact ? "linhas" : "linha(s)")}`
  return `${rows} · ${result.durationMs.toFixed(1)} ms${hasMaskedValues ? (compact ? " · 🔒" : ` · ${translateUi("sensíveis mascarados")}`) : ""}`
}

export function queryWindowLoadingLabel(direction: DatabaseQueryWindowDirection) {
  return translateUi(direction < 0 ? "Carregando 40 linhas acima…" : "Carregando 40 linhas abaixo…")
}
