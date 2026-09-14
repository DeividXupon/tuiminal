import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { SqlCompletionKind } from "../model/sql-autocomplete"
import type { DatabaseTableMutation } from "../model/types"

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
