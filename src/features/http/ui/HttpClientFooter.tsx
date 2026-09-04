import type { HttpDocumentState, HttpPane } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import { resizeHttpSplitRatio } from "../model/layout"
import { HttpWorkspaceFooter } from "./HttpWorkspaceFooter"

export function HttpClientFooter({
  minimum,
  document,
  activePane,
  notice,
  dispatch,
  onJump,
  onHelp,
  onSave,
}: {
  minimum: boolean
  document: HttpDocumentState
  activePane: HttpPane
  notice: string
  dispatch: (action: HttpWorkspaceAction) => void
  onJump: () => void
  onHelp: () => void
  onSave: () => void
}) {
  return (
    <HttpWorkspaceFooter
      minimum={minimum}
      maximized={document.maximizedPane !== null}
      onResize={(direction) =>
        dispatch({
          type: "set-split-ratio",
          documentId: document.request.id,
          ratio: resizeHttpSplitRatio(document.splitRatio, direction),
        })
      }
      onMaximize={() => {
        const pane = activePane === "response" ? "response" : "request"
        dispatch({ type: "select-pane", pane })
        dispatch({ type: "toggle-maximize", documentId: document.request.id, pane })
      }}
      onJump={onJump}
      onHelp={onHelp}
      onSave={onSave}
      notice={notice}
    />
  )
}
