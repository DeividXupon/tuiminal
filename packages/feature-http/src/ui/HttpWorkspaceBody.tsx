import type {
  InputRenderable,
  MouseEvent as OpenTuiMouseEvent,
  ScrollBoxRenderable,
  TextareaRenderable,
} from "@opentui/core"
import { Fragment, useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { HttpLayout } from "../model/layout"
import type {
  HttpAssertionDefinition,
  HttpBodyKind,
  HttpAuth,
  HttpChainExtraction,
  HttpKeyValue,
  HttpNavigationView,
  HttpProjectRequestItem,
  HttpMultipartPart,
  HttpPane,
  HttpRequestView,
  HttpRequestMoreView,
  HttpResponseView,
  HttpWorkspaceState,
} from "../model/types"
import type { HttpCookie } from "../services/cookies"
import type { HttpPreparedRequestPreview } from "../services/request-preview"
import { HttpNavigationPane } from "./HttpNavigationPane"
import { HttpRequestPane } from "./HttpRequestPane"
import { HttpResponsePane } from "./HttpResponsePane"

type HttpWorkspaceBodyProps = {
  state: HttpWorkspaceState
  layout: HttpLayout
  height: number
  registerHeaderInput: (documentId: string, input: InputRenderable | null) => void
  registerBodyEditor: (documentId: string, editor: TextareaRenderable | null) => void
  registerRawScroll: (documentId: string, scroll: ScrollBoxRenderable | null) => void
  registerScroll: (documentId: string, scroll: ScrollBoxRenderable | null) => void
  registerResponseSearch: (documentId: string, input: InputRenderable | null) => void
  registerCollectionSearch: (input: InputRenderable | null) => void
  onSelectDocument: (documentId: string) => void
  onNavigationView: (view: HttpNavigationView) => void
  onCloseNavigation: () => void
  onSelectPane: (pane: HttpPane) => void
  onSelectRequestView: (documentId: string, view: HttpRequestView, focusControl?: boolean) => void
  onSelectRequestMoreView: (documentId: string, view: HttpRequestMoreView) => void
  onSelectResponseView: (documentId: string, view: HttpResponseView) => void
  onResponsePresentationChange: (
    documentId: string,
    patch: Partial<HttpWorkspaceState["documents"][number]["responsePresentation"]>,
  ) => void
  onQueryChange: (documentId: string, entries: HttpKeyValue[]) => void
  onPathChange: (documentId: string, entries: HttpKeyValue[]) => void
  onHeadersChange: (documentId: string, headers: HttpKeyValue[]) => void
  onAuthChange: (documentId: string, auth: HttpAuth) => void
  onBodyChange: (documentId: string, value: string) => void
  onBodyFormChange: (documentId: string, entries: HttpKeyValue[]) => void
  onBodyKindChange: (documentId: string, kind: HttpBodyKind) => void
  onBodyMultipartChange: (documentId: string, parts: HttpMultipartPart[]) => void
  onBodyFileChange: (documentId: string, path: string) => void
  onSend: (documentId: string) => void
  projectRequests: HttpProjectRequestItem[]
  projectErrors: number
  onOpenProjectRequest: (item: HttpProjectRequestItem) => void
  onImportCollection: () => void
  onRunCollection: () => void
  onNameChange: (documentId: string, name: string) => void
  onMethodChange: (documentId: string, method: string) => void
  onOptionsChange: (
    documentId: string,
    options: HttpWorkspaceState["documents"][number]["request"]["options"],
  ) => void
  onAssertionsChange: (documentId: string, assertions: HttpAssertionDefinition[]) => void
  onChainChange: (
    documentId: string,
    chain: { dependsOn?: string; extract: HttpChainExtraction[] },
  ) => void
  onImportCurl: () => void
  onExportCurl: () => void
  onDuplicate: (documentId: string) => void
  onMove: () => void
  onDelete: () => void
  cookies: HttpCookie[]
  onCopyResponse: (documentId: string, content: string, label: string) => void
  onSaveResponse: (documentId: string) => void
  onOpenResponse: (documentId: string) => void
  onDownloadResponse: (documentId: string) => void
  onCancelDownload: () => void
  downloadingDocumentId: string | null
  onToggleHistory: (entryId: string) => void
  onCompareHistory: () => void
  onOpenHistory: (entry: HttpWorkspaceState["history"][number]) => void
  preparedPreview: HttpPreparedRequestPreview | null
  onSplitRatioChange: (ratio: number) => void
}

function splitRatioFromMouse(layout: HttpLayout, event: OpenTuiMouseEvent) {
  const target = event.currentTarget
  if (!target) return null
  const stacked = layout.request.left === layout.response.left
  const available = stacked
    ? layout.request.height + layout.response.height
    : layout.request.width + layout.response.width
  const start = stacked ? target.screenY + layout.request.top : target.screenX + layout.request.left
  const position = stacked ? event.y : event.x
  return Math.min(0.7, Math.max(0.25, (position - start) / Math.max(1, available)))
}

function HttpSplitHandle({ layout, onStart }: { layout: HttpLayout; onStart: () => void }) {
  const stacked = layout.request.left === layout.response.left
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes expose mouse events but no ARIA role; keyboard split controls remain available in the footer.
    <box
      id="http-split-handle"
      style={{
        position: "absolute",
        left: stacked ? layout.request.left : layout.response.left - 1,
        top: stacked ? layout.response.top - 1 : layout.request.top,
        width: stacked ? layout.request.width : 1,
        height: stacked ? 1 : layout.request.height,
        zIndex: 4,
        backgroundColor: COLORS.border,
      }}
      onMouseDown={(event) => {
        onStart()
        event.preventDefault()
      }}
    />
  )
}

export function HttpWorkspaceBody({
  state,
  layout,
  height,
  registerHeaderInput,
  registerBodyEditor,
  registerRawScroll,
  registerScroll,
  registerResponseSearch,
  registerCollectionSearch,
  onSelectDocument,
  onNavigationView,
  onCloseNavigation,
  onSelectPane,
  onSelectRequestView,
  onSelectRequestMoreView,
  onSelectResponseView,
  onResponsePresentationChange,
  onQueryChange,
  onPathChange,
  onHeadersChange,
  onAuthChange,
  onBodyChange,
  onBodyFormChange,
  onBodyKindChange,
  onBodyMultipartChange,
  onBodyFileChange,
  onSend,
  projectRequests,
  projectErrors,
  onOpenProjectRequest,
  onImportCollection,
  onRunCollection,
  onNameChange,
  onMethodChange,
  onOptionsChange,
  onAssertionsChange,
  onChainChange,
  onImportCurl,
  onExportCurl,
  onDuplicate,
  onMove,
  onDelete,
  cookies,
  onCopyResponse,
  onSaveResponse,
  onOpenResponse,
  onDownloadResponse,
  onCancelDownload,
  downloadingDocumentId,
  onToggleHistory,
  onCompareHistory,
  onOpenHistory,
  preparedPreview,
  onSplitRatioChange,
}: HttpWorkspaceBodyProps) {
  const draggingSplit = useRef(false)
  const navigationVisible =
    layout.navigationFixed ||
    state.navigationOpen ||
    (layout.mode === "minimum" && state.activePane === "navigation")
  const navigationOverlayOpen = !layout.navigationFixed && state.navigationOpen

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI requires drag continuation on the containing box and does not expose ARIA roles.
    <box
      style={{ height, flexShrink: 0, position: "relative", overflow: "hidden" }}
      onMouseDrag={(event) => {
        if (!draggingSplit.current) return
        event.preventDefault()
        event.stopPropagation()
        const ratio = splitRatioFromMouse(layout, event)
        if (ratio !== null) onSplitRatioChange(ratio)
      }}
      onMouseUp={() => {
        draggingSplit.current = false
      }}
      onMouseDragEnd={() => {
        draggingSplit.current = false
      }}
    >
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
          (layout.simultaneousPanes || state.activePane === "request" || state.activePane === "url")
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
              focused={active && state.overlay === null && state.activePane === "request"}
              position={maximizedPane === "request" ? maximizedPosition : layout.request}
              registerHeaderInput={(input) => registerHeaderInput(document.request.id, input)}
              registerBodyEditor={(editor) => registerBodyEditor(document.request.id, editor)}
              registerRawScroll={(scroll) => registerRawScroll(document.request.id, scroll)}
              onSelectView={(view, focusControl) =>
                onSelectRequestView(document.request.id, view, focusControl)
              }
              onSelectMoreView={(view) => onSelectRequestMoreView(document.request.id, view)}
              onQueryChange={(entries) => onQueryChange(document.request.id, entries)}
              onPathChange={(entries) => onPathChange(document.request.id, entries)}
              onHeadersChange={(headers) => onHeadersChange(document.request.id, headers)}
              onAuthChange={(auth) => onAuthChange(document.request.id, auth)}
              onBodyChange={(value) => onBodyChange(document.request.id, value)}
              onBodyFormChange={(entries) => onBodyFormChange(document.request.id, entries)}
              onBodyKindChange={(kind) => onBodyKindChange(document.request.id, kind)}
              onBodyMultipartChange={(parts) => onBodyMultipartChange(document.request.id, parts)}
              onBodyFileChange={(path) => onBodyFileChange(document.request.id, path)}
              onSend={() => onSend(document.request.id)}
              onFocus={() => onSelectPane("request")}
              onNameChange={(name) => onNameChange(document.request.id, name)}
              onMethodChange={(method) => onMethodChange(document.request.id, method)}
              onOptionsChange={(options) => onOptionsChange(document.request.id, options)}
              onAssertionsChange={(assertions) =>
                onAssertionsChange(document.request.id, assertions)
              }
              onChainChange={(chain) => onChainChange(document.request.id, chain)}
              onImportCurl={onImportCurl}
              onExportCurl={onExportCurl}
              onDuplicate={() => onDuplicate(document.request.id)}
              onMove={onMove}
              onDelete={onDelete}
              preparedPreview={active ? preparedPreview : null}
            />
            <HttpResponsePane
              document={document}
              visible={responseVisible}
              focused={active && state.overlay === null && state.activePane === "response"}
              position={maximizedPane === "response" ? maximizedPosition : layout.response}
              registerScroll={(scroll) => registerScroll(document.request.id, scroll)}
              registerSearchInput={(input) => registerResponseSearch(document.request.id, input)}
              onSelectView={(view) => onSelectResponseView(document.request.id, view)}
              onPresentationChange={(patch) =>
                onResponsePresentationChange(document.request.id, patch)
              }
              onFocus={() => onSelectPane("response")}
              cookies={cookies}
              onCopy={(content, label) => onCopyResponse(document.request.id, content, label)}
              onSave={() => onSaveResponse(document.request.id)}
              onOpen={() => onOpenResponse(document.request.id)}
              onDownload={() => onDownloadResponse(document.request.id)}
              onCancelDownload={onCancelDownload}
              downloading={downloadingDocumentId === document.request.id}
            />
          </Fragment>
        )
      })}
      <HttpNavigationPane
        state={state}
        visible={navigationVisible}
        focused={state.overlay === null && state.activePane === "navigation"}
        overlay={!layout.navigationFixed}
        position={layout.navigation}
        onViewChange={onNavigationView}
        onSelectDocument={onSelectDocument}
        onClose={onCloseNavigation}
        onFocus={() => onSelectPane("navigation")}
        projectRequests={projectRequests}
        projectErrors={projectErrors}
        onOpenProjectRequest={onOpenProjectRequest}
        onImportCollection={onImportCollection}
        onRunCollection={onRunCollection}
        registerCollectionSearch={registerCollectionSearch}
        onToggleHistory={onToggleHistory}
        onCompareHistory={onCompareHistory}
        onOpenHistory={onOpenHistory}
      />
      {layout.simultaneousPanes &&
      !navigationOverlayOpen &&
      !state.documents.find((document) => document.request.id === state.activeDocumentId)
        ?.maximizedPane ? (
        <HttpSplitHandle
          layout={layout}
          onStart={() => {
            draggingSplit.current = true
          }}
        />
      ) : null}
    </box>
  )
}
