import type { InputRenderable, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import { Fragment } from "react"
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
  registerScroll: (documentId: string, scroll: ScrollBoxRenderable | null) => void
  registerResponseSearch: (documentId: string, input: InputRenderable | null) => void
  registerCollectionSearch: (input: InputRenderable | null) => void
  onSelectDocument: (documentId: string) => void
  onNavigationView: (view: HttpNavigationView) => void
  onCloseNavigation: () => void
  onSelectPane: (pane: "navigation" | "request" | "response") => void
  onSelectRequestView: (documentId: string, view: HttpRequestView) => void
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
}

export function HttpWorkspaceBody({
  state,
  layout,
  height,
  registerHeaderInput,
  registerBodyEditor,
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
              focused={active && state.activePane === "response"}
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
        onImportCollection={onImportCollection}
        onRunCollection={onRunCollection}
        registerCollectionSearch={registerCollectionSearch}
        onToggleHistory={onToggleHistory}
        onCompareHistory={onCompareHistory}
        onOpenHistory={onOpenHistory}
      />
    </box>
  )
}
