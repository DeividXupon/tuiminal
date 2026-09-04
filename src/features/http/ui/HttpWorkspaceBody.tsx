import type { InputRenderable, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import { Fragment } from "react"
import type { HttpLayout } from "../model/layout"
import type {
  HttpBodyKind,
  HttpAuth,
  HttpKeyValue,
  HttpNavigationView,
  HttpProjectRequestItem,
  HttpRequestView,
  HttpResponseView,
  HttpWorkspaceState,
} from "../model/types"
import { HttpNavigationPane } from "./HttpNavigationPane"
import { HttpRequestPane } from "./HttpRequestPane"
import { HttpResponsePane } from "./HttpResponsePane"

type HttpWorkspaceBodyProps = {
  state: HttpWorkspaceState
  layout: HttpLayout
  height: number
  registerHeaderInput: (documentId: string, input: InputRenderable | null) => void
  registerBodyEditor: (documentId: string, editor: TextareaRenderable | null) => void
  registerScroll: (documentId: string, scroll: ScrollBoxRenderable | null) => void
  onSelectDocument: (documentId: string) => void
  onNavigationView: (view: HttpNavigationView) => void
  onCloseNavigation: () => void
  onSelectPane: (pane: "navigation" | "request" | "response") => void
  onSelectRequestView: (documentId: string, view: HttpRequestView) => void
  onSelectResponseView: (documentId: string, view: HttpResponseView) => void
  onQueryChange: (documentId: string, entries: HttpKeyValue[]) => void
  onPathChange: (documentId: string, entries: HttpKeyValue[]) => void
  onHeadersChange: (documentId: string, headers: HttpKeyValue[]) => void
  onAuthChange: (documentId: string, auth: HttpAuth) => void
  onBodyChange: (documentId: string, value: string) => void
  onBodyFormChange: (documentId: string, entries: HttpKeyValue[]) => void
  onBodyKindChange: (documentId: string, kind: HttpBodyKind) => void
  onSend: (documentId: string) => void
  projectRequests: HttpProjectRequestItem[]
  projectErrors: number
  onOpenProjectRequest: (item: HttpProjectRequestItem) => void
}

export function HttpWorkspaceBody({
  state,
  layout,
  height,
  registerHeaderInput,
  registerBodyEditor,
  registerScroll,
  onSelectDocument,
  onNavigationView,
  onCloseNavigation,
  onSelectPane,
  onSelectRequestView,
  onSelectResponseView,
  onQueryChange,
  onPathChange,
  onHeadersChange,
  onAuthChange,
  onBodyChange,
  onBodyFormChange,
  onBodyKindChange,
  onSend,
  projectRequests,
  projectErrors,
  onOpenProjectRequest,
}: HttpWorkspaceBodyProps) {
  const navigationVisible =
    layout.navigationFixed ||
    state.navigationOpen ||
    (layout.mode === "minimum" && state.activePane === "navigation")
  const navigationOverlayOpen = !layout.navigationFixed && state.navigationOpen

  return (
    <box style={{ height, flexShrink: 0, position: "relative" }}>
      {state.documents.map((document) => {
        const active = document.request.id === state.activeDocumentId
        const contentRight = layout.response.left + layout.response.width
        const maximizedPane = layout.simultaneousPanes ? document.maximizedPane : null
        const maximizedPosition = {
          left: layout.request.left,
          top: 0,
          width: contentRight - layout.request.left,
          height,
        }
        const requestVisible =
          active &&
          !navigationOverlayOpen &&
          (!maximizedPane || maximizedPane === "request") &&
          (layout.simultaneousPanes || state.activePane === "request")
        const responseVisible =
          active &&
          !navigationOverlayOpen &&
          (!maximizedPane || maximizedPane === "response") &&
          (layout.simultaneousPanes || state.activePane === "response")

        return (
          <Fragment key={document.request.id}>
            <HttpRequestPane
              document={document}
              visible={requestVisible}
              focused={active && state.activePane === "request"}
              position={maximizedPane === "request" ? maximizedPosition : layout.request}
              registerHeaderInput={(input) => registerHeaderInput(document.request.id, input)}
              registerBodyEditor={(editor) => registerBodyEditor(document.request.id, editor)}
              onSelectView={(view) => onSelectRequestView(document.request.id, view)}
              onQueryChange={(entries) => onQueryChange(document.request.id, entries)}
              onPathChange={(entries) => onPathChange(document.request.id, entries)}
              onHeadersChange={(headers) => onHeadersChange(document.request.id, headers)}
              onAuthChange={(auth) => onAuthChange(document.request.id, auth)}
              onBodyChange={(value) => onBodyChange(document.request.id, value)}
              onBodyFormChange={(entries) => onBodyFormChange(document.request.id, entries)}
              onBodyKindChange={(kind) => onBodyKindChange(document.request.id, kind)}
              onSend={() => onSend(document.request.id)}
              onFocus={() => onSelectPane("request")}
            />
            <HttpResponsePane
              document={document}
              visible={responseVisible}
              focused={active && state.activePane === "response"}
              position={maximizedPane === "response" ? maximizedPosition : layout.response}
              registerScroll={(scroll) => registerScroll(document.request.id, scroll)}
              onSelectView={(view) => onSelectResponseView(document.request.id, view)}
              onFocus={() => onSelectPane("response")}
            />
          </Fragment>
        )
      })}
      <HttpNavigationPane
        state={state}
        visible={navigationVisible}
        focused={state.activePane === "navigation"}
        overlay={!layout.navigationFixed}
        position={layout.navigation}
        onViewChange={onNavigationView}
        onSelectDocument={onSelectDocument}
        onClose={onCloseNavigation}
        onFocus={() => onSelectPane("navigation")}
        projectRequests={projectRequests}
        projectErrors={projectErrors}
        onOpenProjectRequest={onOpenProjectRequest}
      />
    </box>
  )
}
