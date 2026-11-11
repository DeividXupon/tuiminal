import type { HttpWorkspaceBodyProps } from "./http-workspace-body-props"
import { HttpCollectionSettingsPane } from "./HttpCollectionSettingsPane"
import { HttpEnvironmentPane } from "./HttpEnvironmentPane"
import { httpChainingRequests } from "../model/chaining"
import {
  useWorkspaceRepaint,
  WorkspaceRepaintBoundary,
} from "@xupon/tuiminal-core/ui/workspace-repaint"
import { useRef } from "react"
import { HttpSplitHandle, splitRatioFromMouse } from "./HttpSplitHandle"
import { HttpEmptyState } from "./HttpEmptyState"
import { HttpNavigationPane } from "./HttpNavigationPane"
import { HttpRequestPane } from "./HttpRequestPane"
import { HttpResponsePane } from "./HttpResponsePane"
export function HttpWorkspaceBody({
  active: workspaceActive,
  interactionBlocked = false,
  state,
  oauth,
  layout,
  height,
  registerHeaderInput,
  registerBodyEditor,
  registerRawScroll,
  registerScroll,
  registerResponseSearch,
  registerCollectionSearch,
  requestTableKeyRef,
  collectionTreeKeyRef,
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
  onBodyFilesChange,
  onSend,
  onCancel,
  projectRequests,
  projectDirectories,
  projectFiles,
  postmanFolders,
  postmanWorkspace,
  onPostmanWorkspaceChange,
  projectErrors,
  sourceMode,
  onOpenProjectRequest,
  onImportCollection,
  onOpenPostman,
  onRunCollection,
  onManageCollection,
  onNameChange,
  onDocsChange,
  onScriptsChange,
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
  collectionSettings,
  environments,
  preparedPreview,
  onSplitRatioChange,
}: HttpWorkspaceBodyProps) {
  const draggingSplit = useRef(false)
  const navigationVisible =
    layout.navigationFixed ||
    state.navigationOpen ||
    (layout.mode === "minimum" && state.activePane === "navigation")
  const navigationOverlayOpen = !layout.navigationFixed && state.navigationOpen
  useWorkspaceRepaint(
    JSON.stringify([
      layout.mode,
      layout.navigation.width,
      navigationVisible,
      navigationOverlayOpen,
      state.documents.length === 0,
      environments.active?.id,
      collectionSettings.active?.id,
    ]),
  )

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI requires drag continuation on the containing box and does not expose ARIA roles.
    <box
      style={{
        height,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
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
      {state.documents.length === 0 &&
      !collectionSettings.active &&
      !environments.active &&
      !navigationOverlayOpen ? (
        <HttpEmptyState
          left={layout.request.left}
          width={layout.response.left + layout.response.width - layout.request.left}
          height={height}
        />
      ) : null}
      {collectionSettings.active && !navigationOverlayOpen ? (
        <HttpCollectionSettingsPane
          key={collectionSettings.active.id}
          settings={collectionSettings}
          document={collectionSettings.active}
          active={
            workspaceActive &&
            !interactionBlocked &&
            !state.overlay &&
            state.activePane !== "navigation"
          }
          onFocus={() => onSelectPane("request")}
          onBack={() => {
            onNavigationView("collection")
            onSelectPane("navigation")
          }}
          position={{
            left: layout.request.left,
            top: 0,
            width: layout.response.left + layout.response.width - layout.request.left,
            height,
          }}
        />
      ) : null}
      {environments.active && !navigationOverlayOpen ? (
        <HttpEnvironmentPane
          key={environments.active.id}
          environments={environments}
          document={environments.active}
          active={
            workspaceActive &&
            !interactionBlocked &&
            !state.overlay &&
            state.activePane !== "navigation"
          }
          onFocus={() => onSelectPane("request")}
          onBack={() => {
            onNavigationView("environments")
            onSelectPane("navigation")
          }}
          position={{
            left: layout.request.left,
            top: 0,
            width: layout.response.left + layout.response.width - layout.request.left,
            height,
          }}
        />
      ) : null}
      {state.documents.map((document) => {
        const active = document.request.id === state.activeDocumentId
        const interactive =
          workspaceActive && active && !interactionBlocked && state.overlay === null
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
          <WorkspaceRepaintBoundary
            key={document.request.id}
            visible={active}
            transitionKey={JSON.stringify([requestVisible, responseVisible, maximizedPane])}
          >
            <HttpRequestPane
              document={document}
              oauthContext={
                oauth
                  ? {
                      variables: oauth.variablesForRequest(document.request),
                      environmentName: oauth.environmentName,
                    }
                  : undefined
              }
              requestTableKeyRef={requestTableKeyRef}
              chainRequests={httpChainingRequests(
                projectRequests,
                state.documents.map((item) => item.request),
              )}
              visible={requestVisible}
              focused={interactive && state.activePane === "request"}
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
              onBodyFilesChange={(path) => onBodyFilesChange(document.request.id, path)}
              onSend={() => onSend(document.request.id)}
              onFocus={() => onSelectPane("request")}
              onNameChange={(name) => onNameChange(document.request.id, name)}
              onScriptsChange={(value) => onScriptsChange(document.request.id, value)}
              onDocsChange={(value) => onDocsChange(document.request.id, value)}
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
              focused={interactive && state.activePane === "response"}
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
              onCancel={() => onCancel(document.request.id)}
              onCancelDownload={onCancelDownload}
              downloading={downloadingDocumentId === document.request.id}
            />
          </WorkspaceRepaintBoundary>
        )
      })}
      <HttpNavigationPane
        state={state}
        visible={navigationVisible}
        focused={workspaceActive && state.overlay === null && state.activePane === "navigation"}
        overlay={!layout.navigationFixed}
        position={layout.navigation}
        onViewChange={onNavigationView}
        onSelectDocument={onSelectDocument}
        onClose={onCloseNavigation}
        onFocus={() => onSelectPane("navigation")}
        projectRequests={projectRequests}
        projectDirectories={projectDirectories}
        projectFiles={projectFiles}
        postmanFolders={postmanFolders}
        postmanWorkspace={postmanWorkspace}
        onPostmanWorkspaceChange={onPostmanWorkspaceChange}
        projectErrors={projectErrors}
        sourceMode={sourceMode}
        onOpenProjectRequest={onOpenProjectRequest}
        onImportCollection={onImportCollection}
        onOpenPostman={onOpenPostman}
        onRunCollection={onRunCollection}
        onManageCollection={onManageCollection}
        onCollectionSettings={collectionSettings.open}
        registerCollectionSearch={registerCollectionSearch}
        collectionTreeKeyRef={collectionTreeKeyRef}
        environments={environments}
      />
      {!collectionSettings.active &&
      !environments.active &&
      state.documents.length > 0 &&
      layout.simultaneousPanes &&
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
