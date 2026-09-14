import type { HttpKeyboardCommand } from "./keyboard-types"
import { nextHttpBodyKind } from "./body-kind-navigation"
import { updateHttpJsonTree } from "./json-tree"
import { httpAuthForKind, nextHttpAuthKind, nextHttpResponseView } from "./nested-view-navigation"
import { nextHttpPane } from "./pane-navigation"
import type {
  HttpDocumentState,
  HttpRequestMoreView,
  HttpRequestView,
  HttpWorkspaceState,
} from "./types"
import type { HttpWorkspaceAction } from "./workspace"

type FocusTarget = { focus(): void }
type WorkspaceRenderer = { currentFocusedRenderable?: { blur(): void } | null }

export function applyHttpViewKeyboardCommand({
  command,
  state,
  document,
  renderer,
  dispatch,
  blurDocumentControls,
  focusUrl,
  responseTarget,
  selectRequestView,
  selectRequestMoreView,
  addAutomationRow,
}: {
  command: HttpKeyboardCommand
  state: HttpWorkspaceState
  document: HttpDocumentState
  renderer: WorkspaceRenderer
  dispatch: (action: HttpWorkspaceAction) => void
  blurDocumentControls: () => void
  focusUrl: () => void
  responseTarget: () => FocusTarget | null | undefined
  selectRequestView: (documentId: string, view: HttpRequestView, focusControl?: boolean) => void
  selectRequestMoreView: (documentId: string, view: HttpRequestMoreView) => void
  addAutomationRow: () => void
}) {
  const documentId = document.request.id
  switch (command.kind) {
    case "focus-url":
      dispatch({ type: "select-pane", pane: "url" })
      focusUrl()
      return true
    case "cycle-pane": {
      blurDocumentControls()
      renderer.currentFocusedRenderable?.blur()
      const pane = nextHttpPane(state.activePane, command.direction)
      dispatch({ type: "select-pane", pane })
      if (pane === "response") setTimeout(() => responseTarget()?.focus(), 0)
      return true
    }
    case "response-json": {
      const patch = updateHttpJsonTree(document, command.action)
      if (patch) dispatch({ type: "update-response-presentation", documentId, patch })
      return true
    }
    case "request-view":
      selectRequestView(documentId, command.view, false)
      return true
    case "cycle-body-kind":
      dispatch({
        type: "update-request",
        documentId,
        patch: {
          body: {
            ...document.request.body,
            kind: nextHttpBodyKind(document.request.body.kind, command.direction),
          },
        },
      })
      return true
    case "cycle-auth-kind":
      dispatch({
        type: "update-request",
        documentId,
        patch: {
          auth: httpAuthForKind(nextHttpAuthKind(document.request.auth.kind, command.direction)),
        },
      })
      return true
    case "request-more-view":
      selectRequestMoreView(documentId, command.view)
      return true
    case "response-more-view":
      dispatch({
        type: "update-response-presentation",
        documentId,
        patch: { moreView: command.view },
      })
      return true
    case "add-automation-row":
      addAutomationRow()
      return true
    case "cycle-response":
      dispatch({
        type: "select-response-view",
        documentId,
        view: nextHttpResponseView(document.responseView, command.direction),
      })
      dispatch({ type: "select-pane", pane: "response" })
      return true
    default:
      return false
  }
}
