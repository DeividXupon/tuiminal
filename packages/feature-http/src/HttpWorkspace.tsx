import type { InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import {
  DEFAULT_HTTP_SPLIT_RATIO,
  resizeHttpSplitRatio,
  resolveHttpWorkspaceLayout,
} from "./model/layout"
import { resolveHttpKeyboardCommand } from "./model/keyboard"
import type { HttpKey } from "./model/keyboard-types"
import type { HttpRequestTableKey } from "./hooks/use-http-request-tables"
import { httpJsonTreeForDocument } from "./model/json-tree"
import { applyHttpViewKeyboardCommand } from "./model/workspace-keyboard-actions"
import type { HttpAuth, HttpBodyKind, HttpKeyValue, HttpMultipartPart } from "./model/types"
import { httpBodyFor } from "./runtime"
import {
  createHttpWorkspaceState,
  httpWorkspaceReducer,
  type HttpWorkspaceAction,
} from "./model/workspace"
import { HTTP_WORKING_DIRECTORY } from "./services/context"
import { useHttpProject } from "./hooks/use-http-project"
import { DEFAULT_HTTP_WORKSPACE_CONFIG } from "./storage/config"
import type { HttpCompletionKey } from "./ui/HttpOmnibar"
import { HttpWorkspaceHeader } from "./ui/HttpWorkspaceHeader"
import { HttpWorkspaceBody } from "./ui/HttpWorkspaceBody"
import { handleHttpCollectionTreeKey } from "./ui/handle-collection-tree-key"
import { HttpClientFooter } from "./ui/HttpClientFooter"
import { HttpWorkspaceOverlays } from "./ui/HttpWorkspaceOverlays"
import { useHttpCurl } from "./hooks/use-http-curl"
import { useHttpResponse } from "./hooks/use-http-response"
import { useHttpHistory } from "./hooks/use-http-history"
import { useHttpResponseFocus } from "./hooks/use-http-response-focus"
import { selectedHttpHistoryEntries } from "./model/history"
import { useHttpWorkspaceLifecycle } from "./hooks/use-http-workspace-lifecycle"
import { useHttpRequestFiles } from "./hooks/use-http-request-files"
import { useHttpCollectionManagement } from "./hooks/use-http-collection-management"
import { useHttpDocuments } from "./hooks/use-http-documents"
import { useHttpCollectionImport } from "./hooks/use-http-collection-import"
import { useHttpPostman } from "./hooks/use-http-postman"
import { httpSourceProject } from "./hooks/http-source-project"
import { useHttpNavigation } from "./hooks/use-http-navigation"
import { useHttpOverlayNavigation } from "./hooks/use-http-overlay-navigation"
import { useHttpCollectionRunner } from "./hooks/use-http-collection-runner"
import { useHttpRequestPersistence } from "./hooks/use-http-request-persistence"
import { useHttpRequestEditing } from "./hooks/use-http-request-editing"
import { useHttpPreview } from "./hooks/use-http-request-preview"
import { useHttpUnsavedChanges } from "./hooks/use-http-unsaved-changes"
import { useHttpDocumentRefs } from "./hooks/use-http-document-refs"
import { useHttpTlsApprovals } from "./hooks/use-http-tls-approvals"
import { useHttpSendDocument } from "./hooks/use-http-send-document"
import { useHttpRedirectApprovals } from "./hooks/use-http-redirect-approvals"
import { HttpRedirectApprovalModal } from "./ui/HttpRedirectApprovalModal"
import { useNotificationFromValue } from "@xupon/tuiminal-core/notifications/index"
import { useHttpExecutionNotifications } from "./hooks/use-http-execution-notifications"
import { ensureHttpRendererListenerBudget } from "./model/renderer-listener-budget"
import { useHttpJsonTree } from "./hooks/use-http-json-tree"
import { applyHttpUrlQueryEdit } from "./model/url-query"
import { httpSourceSwitchBlocker, type HttpSourceMode } from "./model/source-mode"
import type { HttpClientProps } from "./model/types"
export function HttpInteractiveClient({
  active,
  initialUrlRequest,
  onUnsavedChangesChange,
  sourceMode,
  onChooseSource,
}: HttpClientProps & { sourceMode: HttpSourceMode; onChooseSource: () => void }) {
  const renderer = useRenderer()
  ensureHttpRendererListenerBudget(renderer)
  const terminal = useTerminalDimensions()
  const [state, reactDispatch] = useReducer(
    httpWorkspaceReducer,
    undefined,
    createHttpWorkspaceState,
  )
  const stateRef = useRef(state)
  stateRef.current = state
  const dispatch = useCallback((action: HttpWorkspaceAction) => {
    stateRef.current = httpWorkspaceReducer(stateRef.current, action)
    reactDispatch(action)
  }, [])
  const urlRef = useRef<InputRenderable | null>(null)
  const urlCompletionKeyRef = useRef<((key: HttpCompletionKey) => boolean) | null>(null)
  const requestTableKeyRef = useRef<((key: HttpRequestTableKey) => boolean) | null>(null)
  const collectionTreeKeyRef = useRef<((key: HttpKey) => boolean) | null>(null)
  const collectionSearchRef = useRef<InputRenderable | null>(null)
  const { documentRefs, refsFor, blurDocumentControls } = useHttpDocumentRefs(urlRef)
  const abortControllers = useRef(new Map<string, AbortController>())
  const documentCounter = useRef(1)
  const [notice, setNotice] = useState("")
  const tlsApprovals = useHttpTlsApprovals()
  const redirectApprovals = useHttpRedirectApprovals(tlsApprovals.approve)
  const activeDocument =
    state.documents.find((document) => document.request.id === state.activeDocumentId) ??
    state.documents[0]
  const activeJsonTree = useHttpJsonTree(activeDocument)
  useNotificationFromValue(notice, { source: "HTTP" })
  useHttpExecutionNotifications(state.documents)
  const httpProject = useHttpProject()
  const {
    project,
    activeEnvironment,
    activeEnvironmentName,
    refresh: refreshProject,
    variablesForRequest,
  } = httpProject
  const postman = useHttpPostman(httpProject, dispatch, blurDocumentControls, setNotice)
  const { projectRequests, sourceFiles, sourceDirectories, sourcePostmanFolders } =
    httpSourceProject(httpProject, sourceMode, postman.workspace?.id)
  const workspaceConfig = DEFAULT_HTTP_WORKSPACE_CONFIG
  const historyTools = useHttpHistory({
    config: workspaceConfig,
    dispatch,
    setNotice,
    documents: state.documents,
    projectRequests,
  })
  const responseTools = useHttpResponse({
    documents: state.documents,
    activeRequest: activeDocument?.request,
    environmentName: activeEnvironmentName,
    clipboard: renderer,
    setNotice,
    workspaceConfig,
    variablesForRequest,
    isInsecureTlsApproved: tlsApprovals.isApproved,
    authorizeRedirect: redirectApprovals.authorize,
  })
  useHttpUnsavedChanges(state.documents, onUnsavedChangesChange)
  const preparedPreview = useHttpPreview(activeDocument, workspaceConfig, variablesForRequest)
  const {
    command: curlImportCommand,
    setCommand: setCurlImportCommand,
    exported: exportedCurl,
    applyImport: applyCurlImport,
    copyExport: copyExportedCurl,
  } = useHttpCurl({
    activeDocument,
    documentCount: state.documents.length,
    workspaceConfig,
    variablesForRequest,
    clipboard: renderer,
    setNotice,
    onImported(request) {
      dispatch({ type: "add-document", request })
      dispatch({ type: "close-overlay" })
      setTimeout(() => urlRef.current?.focus(), 0)
    },
  })
  const { layout, bodyHeight } = resolveHttpWorkspaceLayout({
    terminalWidth: terminal.width,
    terminalHeight: terminal.height,
    appHeaderRows: LAYOUT.compact ? 1 : 2,
    outerPadding: LAYOUT.outerPadding,
    spacing: LAYOUT.headerSpacing,
    splitRatio: activeDocument?.splitRatio ?? DEFAULT_HTTP_SPLIT_RATIO,
  })
  const panelSpacing = layout.mode === "minimum" ? 0 : LAYOUT.headerSpacing
  useHttpResponseFocus({
    active,
    document: activeDocument,
    pane: state.activePane,
    refsFor,
  })
  useHttpWorkspaceLifecycle({
    active,
    initialUrlRequest,
    document: activeDocument,
    urlRef,
    abortControllers,
    dispatch,
  })
  const {
    selectDocument,
    openProjectRequest,
    addDocument,
    cancelDocument,
    closeDocument,
    requestCloseDocument,
    confirmCloseDocument,
    cancelPendingClose,
    pendingCloseDocument,
  } = useHttpDocuments({
    documents: state.documents,
    documentRefs,
    abortControllers,
    documentCounter,
    urlRef,
    refsFor,
    blurDocumentControls,
    dispatch,
  })
  const requestFiles = useHttpRequestFiles({
    root: HTTP_WORKING_DIRECTORY,
    document: activeDocument,
    dispatch,
    refreshProject,
    closeDocument,
    setNotice,
    documentCount: state.documents.length,
  })
  const requestPersistence = useHttpRequestPersistence({
    root: HTTP_WORKING_DIRECTORY,
    sourceMode,
    collectionFiles: sourceFiles,
    documents: state.documents,
    documentRefs,
    dispatch,
    refreshProject,
    setNotice,
  })
  const sendDocument = useHttpSendDocument({
    getDocuments: () => stateRef.current.documents,
    projectRequests,
    workspaceConfig,
    activeEnvironmentName,
    variablesForRequest,
    historyTools,
    cookieJarForRequest: responseTools.cookieJarForRequest,
    responseCompleted: responseTools.responseCompleted,
    isInsecureTlsApproved: tlsApprovals.isApproved,
    refsFor,
    blurDocumentControls,
    abortControllers,
    dispatch,
    setNotice,
    authorizeRedirect: redirectApprovals.authorize,
  })
  const openEnvironmentManager = useCallback(() => {
    blurDocumentControls()
    renderer.currentFocusedRenderable?.blur()
    dispatch({ type: "open-overlay", overlay: "environment-manager" })
  }, [blurDocumentControls, dispatch, renderer])
  const manageCollection = useHttpCollectionManagement({
    root: HTTP_WORKING_DIRECTORY,
    sourceMode,
    files: project.files,
    getDocuments: () => stateRef.current.documents,
    dispatch,
    refreshProject,
    openRequest: openProjectRequest,
    setNotice,
  })
  const requestEditing = useHttpRequestEditing({
    documents: state.documents,
    activeDocument,
    refsFor,
    dispatch,
  })
  const { cycleDocument, toggleNavigation } = useHttpNavigation({
    state,
    layout,
    dispatch,
    selectDocument,
  })
  const { closeOverlay, jumpTo } = useHttpOverlayNavigation({
    document: activeDocument,
    activePane: state.activePane,
    refsFor,
    urlRef,
    dispatch,
  })
  const collectionImport = useHttpCollectionImport({
    root: HTTP_WORKING_DIRECTORY,
    refreshProject,
    closeOverlay,
    setNotice,
  })
  useEffect(() => {
    if (sourceMode === "postman") postman.open()
  }, [postman.open, sourceMode])
  const collectionRunner = useHttpCollectionRunner({
    root: HTTP_WORKING_DIRECTORY,
    items: projectRequests,
    variablesForRequest,
    environmentName: activeEnvironmentName,
    isInsecureTlsApproved: tlsApprovals.isApproved,
    approveInsecureTls: tlsApprovals.approve,
    authorizeRedirect: redirectApprovals.authorize,
  })
  const chooseSource = () => {
    const blocker = httpSourceSwitchBlocker(stateRef.current.documents)
    if (blocker) {
      setNotice(blocker)
      return
    }
    blurDocumentControls()
    onChooseSource()
  }
  useKeyboard((key) => {
    if (!active || !activeDocument || redirectApprovals.pending) return
    if (requestPersistence.pendingPostmanSaveId) return
    const currentState = stateRef.current
    if (key.ctrl && key.name === "g" && currentState.overlay === null) {
      key.preventDefault()
      key.stopPropagation()
      chooseSource()
      return
    }
    const currentDocument =
      currentState.documents.find(
        (document) => document.request.id === currentState.activeDocumentId,
      ) ?? currentState.documents[0]
    if (!currentDocument) return
    const focusedId = renderer.currentFocusedRenderable?.id ?? ""
    if (focusedId === "http-url-input" && urlCompletionKeyRef.current?.(key)) return
    if (handleHttpCollectionTreeKey(key, currentState, focusedId, collectionTreeKeyRef)) return
    if (focusedId === "http-collection-name-input") return
    if (
      currentState.overlay === null &&
      currentState.activePane === "request" &&
      requestTableKeyRef.current?.(key)
    )
      return
    const documentId = currentDocument.request.id
    const currentJsonTree = httpJsonTreeForDocument(currentDocument)
    const command = resolveHttpKeyboardCommand({
      key,
      focusedId,
      navigationOpen: currentState.navigationOpen,
      running: currentDocument.execution.status === "running",
      minimum: layout.mode === "minimum",
      activePane: currentState.activePane,
      overlay: currentState.overlay,
      navigationView: currentState.navigationView,
      requestView: currentDocument.requestView,
      requestMoreView: currentDocument.requestMoreView,
      responseView: currentDocument.responseView,
      responseMoreView: currentDocument.responsePresentation.moreView,
      responseJsonTree: currentJsonTree !== null,
    })
    if (command.kind === "none" || command.kind === "ignore") return
    key.preventDefault()
    key.stopPropagation()
    if (requestEditing.applyOptionCommand(command.kind)) return
    if (
      applyHttpViewKeyboardCommand({
        command,
        state: currentState,
        document: currentDocument,
        renderer,
        dispatch,
        blurDocumentControls,
        focusUrl: () => urlRef.current?.focus(),
        responseTarget: () => refsFor(documentId).response,
        selectRequestView: requestEditing.selectRequestView,
        selectRequestMoreView: requestEditing.selectRequestMoreView,
        addAutomationRow: requestEditing.addAutomationRow,
      })
    ) {
      return
    }
    switch (command.kind) {
      case "blur-url":
        urlRef.current?.blur()
        dispatch({ type: "select-pane", pane: "request" })
        return
      case "blur-editor":
        renderer.currentFocusedRenderable?.blur()
        blurDocumentControls()
        dispatch({ type: "select-pane", pane: "request" })
        return
      case "blur-control":
        renderer.currentFocusedRenderable?.blur()
        dispatch({ type: "select-pane", pane: "request" })
        return
      case "blur-navigation-control":
        renderer.currentFocusedRenderable?.blur()
        dispatch({ type: "select-pane", pane: "navigation" })
        return
      case "send":
        void sendDocument(documentId)
        return
      case "cancel":
        cancelDocument(documentId)
        return
      case "add-document":
        addDocument()
        return
      case "close-document":
        requestCloseDocument(documentId)
        return
      case "save-document":
        return void requestPersistence.saveDocument(documentId)
      case "push-postman-document":
        return void postman.push(currentDocument)
      case "open-environment-manager":
        openEnvironmentManager()
        return
      case "open-response-search":
        dispatch({ type: "select-pane", pane: "response" })
        dispatch({
          type: "update-response-presentation",
          documentId,
          patch: { searchOpen: true },
        })
        setTimeout(() => refsFor(documentId).responseSearch?.focus(), 0)
        return
      case "open-response":
        return void responseTools.openResponse(documentId)
      case "focus-collection-search":
        return void collectionSearchRef.current?.focus()
      case "cycle-document":
        return void cycleDocument(command.direction)
      case "cycle-method":
        requestEditing.cycleMethod(command.direction)
        return
      case "resize-split":
        dispatch({
          type: "set-split-ratio",
          documentId,
          ratio: resizeHttpSplitRatio(currentDocument.splitRatio, command.direction),
        })
        return
      case "toggle-maximize": {
        const pane = currentState.activePane === "response" ? "response" : "request"
        dispatch({ type: "select-pane", pane })
        dispatch({ type: "toggle-maximize", documentId, pane })
        return
      }
      case "open-overlay":
        if (command.overlay === "request-move") return requestFiles.openMove()
        if (command.overlay === "request-delete") return requestFiles.openDelete()
        if (command.overlay === "collection-import" && sourceMode === "postman") {
          setNotice("Troque para HTTP Local antes de importar um arquivo local.")
          return
        }
        if (command.overlay === "collection-import") collectionImport.open()
        if (command.overlay === "collection-runner") collectionRunner.open()
        blurDocumentControls()
        dispatch({ type: "open-overlay", overlay: command.overlay })
        return
      case "close-overlay":
        if (currentState.overlay === "collection-runner") collectionRunner.cancel()
        if (currentState.overlay === "discard-document") cancelPendingClose()
        requestPersistence.cancelExternalConflict()
        closeOverlay()
        return
      case "resolve-external-conflict":
        return void requestPersistence.resolveExternalConflict(command.resolution)
      case "close-response-control":
        renderer.currentFocusedRenderable?.blur()
        dispatch({
          type: "update-response-presentation",
          documentId,
          patch:
            command.control === "search"
              ? { searchOpen: false }
              : { jsonPathOpen: false, jsonPath: "" },
        })
        setTimeout(() => refsFor(documentId).response?.focus(), 0)
        return
      case "apply-overlay":
        if (currentState.overlay === "curl-import") applyCurlImport()
        else if (currentState.overlay === "collection-import") void collectionImport.apply()
        else if (currentState.overlay === "collection-runner") void collectionRunner.run()
        else if (currentState.overlay === "discard-document") {
          confirmCloseDocument()
          closeOverlay()
        } else void requestFiles.apply(currentState.overlay)
        return
      case "back-import-preview":
        collectionImport.back()
        return
      case "cycle-runner-target":
        collectionRunner.cycleTarget()
        return
      case "cycle-runner-concurrency":
        collectionRunner.cycleConcurrency()
        return
      case "approve-runner-insecure-tls":
        collectionRunner.approvePendingTls()
        return
      case "duplicate-document":
        return void requestPersistence.duplicateDocument(documentId)
      case "jump":
        jumpTo(command.target)
        return
      case "navigation":
        toggleNavigation(command.view)
        return
      case "close-navigation":
        dispatch({ type: "close-navigation" })
        return
      case "pane":
        dispatch({ type: "select-pane", pane: command.pane })
    }
  })
  if (!activeDocument) return null
  const historyDiff = selectedHttpHistoryEntries(state.history, state.historySelection)
  return (
    <box
      style={{
        flexGrow: 1,
        position: "relative",
        backgroundColor: COLORS.canvas,
        padding: LAYOUT.outerPadding,
      }}
    >
      <HttpWorkspaceHeader
        document={activeDocument}
        state={state}
        layout={layout}
        terminalWidth={terminal.width}
        sourceMode={sourceMode}
        onChooseSource={chooseSource}
        urlRef={urlRef}
        completionKeyRef={urlCompletionKeyRef}
        variableNames={[...httpProject.variablesForRequest(activeDocument.request).keys()]}
        onSelectDocument={selectDocument}
        onCloseDocument={requestCloseDocument}
        onAddDocument={addDocument}
        dispatch={dispatch}
        onCycleMethod={requestEditing.cycleMethod}
        onSend={(id) => void sendDocument(id)}
        onCancel={cancelDocument}
        environmentName={activeEnvironmentName}
        productionEnvironment={activeEnvironment?.production ?? false}
        onOpenEnvironment={openEnvironmentManager}
        onNavigation={toggleNavigation}
      />
      <box style={{ height: panelSpacing, flexShrink: 0 }} />
      <HttpWorkspaceBody
        state={state}
        requestTableKeyRef={requestTableKeyRef}
        collectionTreeKeyRef={collectionTreeKeyRef}
        layout={layout}
        height={bodyHeight}
        registerHeaderInput={(documentId, input) => (refsFor(documentId).headers = input)}
        registerBodyEditor={(documentId, editor) => (refsFor(documentId).body = editor)}
        registerRawScroll={(documentId, scroll) => (refsFor(documentId).raw = scroll)}
        registerScroll={(documentId, scroll) => {
          refsFor(documentId).response = scroll
        }}
        registerResponseSearch={(documentId, input) => {
          refsFor(documentId).responseSearch = input
        }}
        registerCollectionSearch={(input) => {
          collectionSearchRef.current = input
        }}
        onSelectDocument={selectDocument}
        onNavigationView={(view) => dispatch({ type: "select-navigation-view", view })}
        onCloseNavigation={() => dispatch({ type: "close-navigation" })}
        onSelectPane={(pane) => dispatch({ type: "select-pane", pane })}
        onSelectRequestView={requestEditing.selectRequestView}
        onSelectRequestMoreView={requestEditing.selectRequestMoreView}
        onSelectResponseView={(documentId, view) => {
          dispatch({ type: "select-pane", pane: "response" })
          dispatch({ type: "select-response-view", documentId, view })
        }}
        onResponsePresentationChange={(documentId, patch) =>
          dispatch({ type: "update-response-presentation", documentId, patch })
        }
        onQueryChange={(documentId, query) => {
          const document = stateRef.current.documents.find((item) => item.request.id === documentId)
          if (!document) return
          dispatch({
            type: "update-request",
            documentId,
            patch: applyHttpUrlQueryEdit(document.request.url, query, documentId),
          })
        }}
        onPathChange={(documentId, path) =>
          dispatch({ type: "update-request", documentId, patch: { path } })
        }
        onHeadersChange={(documentId, headers: HttpKeyValue[]) =>
          dispatch({ type: "update-request", documentId, patch: { headers } })
        }
        onAuthChange={(documentId, auth: HttpAuth) =>
          dispatch({ type: "update-request", documentId, patch: { auth } })
        }
        onBodyChange={(documentId, text) =>
          dispatch({
            type: "update-request",
            documentId,
            patch: { body: { ...httpBodyFor(state, documentId), text } },
          })
        }
        onBodyFormChange={(documentId, form) =>
          dispatch({
            type: "update-request",
            documentId,
            patch: { body: { ...httpBodyFor(state, documentId), form } },
          })
        }
        onBodyKindChange={(documentId, kind: HttpBodyKind) =>
          dispatch({
            type: "update-request",
            documentId,
            patch: { body: { ...httpBodyFor(state, documentId), kind } },
          })
        }
        onBodyMultipartChange={(documentId, multipart: HttpMultipartPart[]) =>
          dispatch({
            type: "update-request",
            documentId,
            patch: { body: { ...httpBodyFor(state, documentId), multipart } },
          })
        }
        onBodyFileChange={(documentId, filePath) =>
          dispatch({
            type: "update-request",
            documentId,
            patch: { body: { ...httpBodyFor(state, documentId), filePath } },
          })
        }
        onSend={(documentId) => void sendDocument(documentId)}
        projectRequests={projectRequests}
        projectDirectories={sourceDirectories}
        projectFiles={sourceFiles.map((file) => file.path)}
        postmanFolders={sourcePostmanFolders}
        postmanWorkspace={postman.workspace}
        onPostmanWorkspaceChange={postman.selectWorkspace}
        projectErrors={project.errors.length}
        sourceMode={sourceMode}
        onOpenProjectRequest={openProjectRequest}
        onImportCollection={() => {
          collectionImport.open()
          dispatch({ type: "open-overlay", overlay: "collection-import" })
        }}
        onOpenPostman={postman.open}
        onRunCollection={() => {
          collectionRunner.open()
          dispatch({ type: "open-overlay", overlay: "collection-runner" })
        }}
        onManageCollection={manageCollection}
        onNameChange={requestEditing.changeName}
        onMethodChange={requestEditing.changeMethod}
        onOptionsChange={requestEditing.changeOptions}
        onAssertionsChange={requestEditing.changeAssertions}
        onChainChange={requestEditing.changeChain}
        onImportCurl={() => {
          blurDocumentControls()
          dispatch({ type: "open-overlay", overlay: "curl-import" })
        }}
        onExportCurl={() => {
          blurDocumentControls()
          dispatch({ type: "open-overlay", overlay: "curl-export" })
        }}
        onDuplicate={(documentId) => void requestPersistence.duplicateDocument(documentId)}
        onMove={requestFiles.openMove}
        onDelete={requestFiles.openDelete}
        cookies={responseTools.cookies}
        onCopyResponse={responseTools.copyResponse}
        onSaveResponse={(documentId) => void responseTools.saveResponse(documentId)}
        onOpenResponse={(documentId) => void responseTools.openResponse(documentId)}
        onDownloadResponse={(documentId) => void responseTools.downloadComplete(documentId)}
        onCancelDownload={responseTools.cancelDownload}
        downloadingDocumentId={responseTools.downloadingDocumentId}
        onToggleHistory={(entryId) => dispatch({ type: "toggle-history-selection", entryId })}
        onCompareHistory={() => {
          if (historyDiff) dispatch({ type: "open-overlay", overlay: "history-diff" })
        }}
        onOpenHistory={historyTools.open}
        preparedPreview={preparedPreview}
        onSplitRatioChange={(ratio) =>
          dispatch({
            type: "set-split-ratio",
            documentId: activeDocument.request.id,
            ratio,
          })
        }
      />
      <box style={{ height: panelSpacing, flexShrink: 0 }} />
      <HttpClientFooter
        availableWidth={Math.max(1, terminal.width - LAYOUT.outerPadding * 2)}
        minimum={layout.mode === "minimum"}
        narrow={layout.mode === "minimum" || layout.mode === "focus"}
        document={activeDocument}
        activePane={state.activePane}
        responseJsonTree={state.activePane === "response" && activeJsonTree !== null}
        dispatch={dispatch}
        onJump={() => {
          blurDocumentControls()
          dispatch({ type: "open-overlay", overlay: "jump" })
        }}
        onHelp={() => {
          blurDocumentControls()
          dispatch({ type: "open-overlay", overlay: "help" })
        }}
        onSave={() => void requestPersistence.saveDocument(activeDocument.request.id)}
        onPushPostman={() => void postman.push(activeDocument)}
        notice={notice}
      />
      <HttpWorkspaceOverlays
        overlay={state.overlay}
        document={activeDocument}
        activePane={state.activePane}
        terminalWidth={terminal.width}
        terminalHeight={terminal.height}
        historyDiff={historyDiff}
        curl={exportedCurl}
        curlCommand={curlImportCommand}
        onCurlCommandChange={setCurlImportCommand}
        onApplyCurl={applyCurlImport}
        onCopyCurl={copyExportedCurl}
        onJump={jumpTo}
        onClose={closeOverlay}
        moveTarget={requestFiles.moveTarget}
        onMoveTargetChange={requestFiles.setMoveTarget}
        onApplyRequestFileAction={() => void requestFiles.apply(state.overlay)}
        collectionImport={collectionImport}
        postman={postman}
        collectionRunner={collectionRunner}
        environment={httpProject}
        externalConflict={requestPersistence}
        postmanSave={{ files: sourceFiles, folders: sourcePostmanFolders }}
        pendingCloseName={pendingCloseDocument?.request.name ?? ""}
        onConfirmCloseDocument={() => {
          confirmCloseDocument()
          closeOverlay()
        }}
        onCancelCloseDocument={() => {
          cancelPendingClose()
          closeOverlay()
        }}
      />
      {active && redirectApprovals.pending ? (
        <HttpRedirectApprovalModal
          pending={redirectApprovals.pending}
          decide={redirectApprovals.decide}
          terminalWidth={terminal.width}
          terminalHeight={terminal.height}
        />
      ) : null}
    </box>
  )
}
