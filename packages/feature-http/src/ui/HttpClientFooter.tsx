import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpDocumentState, HttpPane } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import { resizeHttpSplitRatio } from "../model/layout"
import { HttpWorkspaceFooter } from "./HttpWorkspaceFooter"

export function HttpClientFooter({
  availableWidth,
  minimum,
  narrow,
  document,
  activePane,
  responseJsonTree,
  dispatch,
  onJump,
  onHelp,
  onSave,
}: {
  availableWidth: number
  minimum: boolean
  narrow: boolean
  document: HttpDocumentState | undefined
  activePane: HttpPane
  responseJsonTree: boolean
  dispatch: (action: HttpWorkspaceAction) => void
  onJump: () => void
  onHelp: () => void
  onSave: () => void
}) {
  if (!document)
    return (
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        <InlineButton id="http-jump-button" label="[M]" accent={COLORS.http} onPress={onJump} />
        <InlineButton
          id="http-action-palette-open"
          label="[?] Ações"
          accent={COLORS.http}
          onPress={onHelp}
        />
      </box>
    )
  return (
    <HttpWorkspaceFooter
      availableWidth={availableWidth}
      minimum={minimum}
      narrow={narrow}
      readOnly={
        document.request.source.kind === "file" && document.request.source.supported === false
      }
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
      onPushPostman={onSave}
      postmanRequest={
        document.request.source.kind === "file" &&
        document.request.source.path.replaceAll("\\", "/").startsWith("postman/")
      }
      responseJsonTree={responseJsonTree}
    />
  )
}
