import { useCallback } from "react"
import type { HttpLayout } from "../model/layout"
import type { HttpWorkspaceState } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"

export function useHttpNavigation({
  state,
  layout,
  dispatch,
  selectDocument,
}: {
  state: HttpWorkspaceState
  layout: HttpLayout
  dispatch: (action: HttpWorkspaceAction) => void
  selectDocument: (documentId: string) => void
}) {
  const cycleDocument = useCallback(
    (direction: number) => {
      const current = state.documents.findIndex(
        (document) => document.request.id === state.activeDocumentId,
      )
      const next =
        state.documents[(current + direction + state.documents.length) % state.documents.length]
      if (next) selectDocument(next.request.id)
    },
    [selectDocument, state.activeDocumentId, state.documents],
  )

  const toggleNavigation = useCallback(
    (view: "collection" | "history") => {
      if (!layout.navigationFixed && state.navigationOpen && state.navigationView === view) {
        dispatch({ type: "close-navigation" })
        return
      }
      dispatch({ type: "toggle-navigation", view })
      dispatch({ type: "select-pane", pane: "navigation" })
    },
    [dispatch, layout.navigationFixed, state.navigationOpen, state.navigationView],
  )

  return { cycleDocument, toggleNavigation }
}
