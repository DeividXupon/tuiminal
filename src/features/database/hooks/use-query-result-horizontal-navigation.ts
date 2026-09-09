import { useCallback } from "react"
import {
  databaseHorizontalKeyDirection,
  databaseResultHorizontalNavigationAction,
} from "../model/layout"

export function useQueryResultHorizontalNavigation({
  columnCount,
  selectedColumnIndex,
  pane,
  inspectorVisible,
  moveColumn,
  focusPane,
  onReturnToCatalog,
}: {
  columnCount: number
  selectedColumnIndex: number
  pane: "grid" | "inspector"
  inspectorVisible: boolean
  moveColumn: (delta: number) => void
  focusPane: (pane: "grid" | "inspector") => void
  onReturnToCatalog: () => void
}) {
  return useCallback(
    (keyName: string) => {
      const direction = databaseHorizontalKeyDirection(keyName)
      if (!direction || !columnCount) return false
      const action = databaseResultHorizontalNavigationAction({
        pane,
        direction,
        selectedColumnIndex,
        columnCount,
        inspectorVisible,
      })
      if (action === "previous-column") moveColumn(-1)
      else if (action === "next-column") moveColumn(1)
      else if (action === "previous-workspace-pane") onReturnToCatalog()
      else if (action) focusPane(action === "previous-pane" ? "grid" : "inspector")
      return Boolean(action)
    },
    [
      columnCount,
      focusPane,
      inspectorVisible,
      moveColumn,
      onReturnToCatalog,
      pane,
      selectedColumnIndex,
    ],
  )
}
