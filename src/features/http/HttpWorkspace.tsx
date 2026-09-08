import type { InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useReducer, useRef, useState } from "react"
import { COLORS, LAYOUT } from "../../core/settings/theme"
import { resizeHttpSplitRatio, resolveHttpWorkspaceLayout } from "./model/layout"
import { resolveHttpKeyboardCommand } from "./model/keyboard"
import type {
  HttpAuth,
  HttpBodyKind,
  HttpClientUrlRequest,
  HttpKeyValue,
  HttpMultipartPart,
  HttpProjectRequestItem,
} from "./model/types"
import { httpBodyFor } from "./runtime"
import {
  createHttpWorkspaceState,
  httpWorkspaceReducer,
  type HttpWorkspaceAction,
} from "./model/workspace"
import { httpRequestFilePath, isOpaqueHttpRequest } from "./model/request-capabilities"
import { HTTP_WORKING_DIRECTORY } from "./services/context"
import { useHttpProject } from "./hooks/use-http-project"
import { HttpDocumentBar } from "./ui/HttpDocumentBar"
import { HttpOmnibar } from "./ui/HttpOmnibar"
import { HttpPaneSelector } from "./ui/HttpPaneSelector"
import { HttpWorkspaceBody } from "./ui/HttpWorkspaceBody"
import { HttpClientFooter } from "./ui/HttpClientFooter"
import { HttpWorkspaceOverlays } from "./ui/HttpWorkspaceOverlays"
import { useHttpCurl } from "./hooks/use-http-curl"
import { useHttpResponse } from "./hooks/use-http-response"
import { useHttpHistory } from "./hooks/use-http-history"
import { useHttpResponseFocus } from "./hooks/use-http-response-focus"
import { selectedHttpHistoryEntries } from "./model/history"
import { useHttpWorkspaceLifecycle } from "./hooks/use-http-workspace-lifecycle"
import { useHttpRequestFiles } from "./hooks/use-http-request-files"
import { useHttpDocuments } from "./hooks/use-http-documents"
import { useHttpCollectionImport } from "./hooks/use-http-collection-import"
import { useHttpNavigation } from "./hooks/use-http-navigation"
import { useHttpOverlayNavigation } from "./hooks/use-http-overlay-navigation"
import { useHttpCollectionRunner } from "./hooks/use-http-collection-runner"
import { useHttpRequestPersistence } from "./hooks/use-http-request-persistence"
import { useHttpRequestEditing } from "./hooks/use-http-request-editing"
import { useHttpPreview } from "./hooks/use-http-request-preview"
import { useHttpUnsavedChanges } from "./hooks/use-http-unsaved-changes"
import { useHttpDocumentRefs } from "./hooks/use-http-document-refs"
import { useHttpTlsApprovals } from "./hooks/use-http-tls-approvals"
import { useHttpSendDocument, type HttpPendingTlsApproval } from "./hooks/use-http-send-document"
import { HttpTutorialDemo } from "./tutorial/HttpTutorialDemo"
import { useNotificationFromValue } from "../../shared/notifications/index"
import { useHttpExecutionNotifications } from "./hooks/use-http-execution-notifications"
import { ensureHttpRendererListenerBudget } from "./model/renderer-listener-budget"

type HttpClientProps = {
  active: boolean
  initialUrlRequest?: HttpClientUrlRequest | null
  onUnsavedChangesChange?: (dirty: boolean) => void
  tutorialMode?: boolean
}

export function HttpClient({ tutorialMode = false, ...props }: HttpClientProps) {
  if (tutorialMode) return <HttpTutorialDemo />
  return <HttpInteractiveClient {...props} />
}

function HttpInteractiveClient({
  active,
  initialUrlRequest,
  onUnsavedChangesChange,
}: HttpClientProps) {
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
  const collectionSearchRef = useRef<InputRenderable | null>(null)
  const { documentRefs, refsFor, blurDocumentControls } = useHttpDocumentRefs(urlRef)
  const abortControllers = useRef(new Map<string, AbortController>())
  const documentCounter = useRef(1)
  const [notice, setNotice] = useState("")
  const [pendingTlsApproval, setPendingTlsApproval] = useState<HttpPendingTlsApproval | null>(null)
  const tlsApprovals = useHttpTlsApprovals()
  const activeDocument =
    state.documents.find((document) => document.request.id === state.activeDocumentId) ??
    state.documents[0]
  useNotificationFromValue(notice, { source: "HTTP" })
  useHttpExecutionNotifications(state.documents)
  const httpProject = useHttpProject(httpRequestFilePath(activeDocument?.request))
  const {
    project,
    projectRequests,
    activeEnvironment,
    activeEnvironmentName,
    workspaceConfig,
    refresh: refreshProject,
    variablesForRequest,
  } = httpProject
  const historyTools = useHttpHistory({
    config: workspaceConfig,
    dispatch,
    setNotice,
    documents: state.documents,
    projectRequests,
  })
  const responseTools = useHttpResponse({
    documents: state.documents,
    environmentName: activeEnvironmentName,
    clipboard: renderer,
    setNotice,
    workspaceConfig,
    variablesForRequest,
    isInsecureTlsApproved: tlsApprovals.isApproved,
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
    splitRatio: activeDocument?.splitRatio ?? 0.4,
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
    cookieJar: responseTools.cookieJar,
    responseCompleted: responseTools.responseCompleted,
    isInsecureTlsApproved: tlsApprovals.isApproved,
    refsFor,
    blurDocumentControls,
    abortControllers,
    dispatch,
    setNotice,
    setPendingTlsApproval,
  })
  const openEnvironmentManager = useCallback(() => {
    blurDocumentControls()
    dispatch({ type: "open-overlay", overlay: "environment-manager" })
  }, [blurDocumentControls, dispatch])
  const openProjectRequest = useCallback(
    (item: HttpProjectRequestItem) => {
      blurDocumentControls()
      dispatch({ type: "add-document", request: item.request })
      setTimeout(() => {
        if (isOpaqueHttpRequest(item.request)) {
          refsFor(item.request.id).raw?.focus()
        } else {
          urlRef.current?.focus()
        }
      }, 0)
    },
    [blurDocumentControls, dispatch, refsFor],
  )

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
    selectRequestView: requestEditing.selectRequestView,
  })
  const collectionImport = useHttpCollectionImport({
    root: HTTP_WORKING_DIRECTORY,
    refreshProject,
    closeOverlay,
    setNotice,
  })
  const collectionRunner = useHttpCollectionRunner({
    root: HTTP_WORKING_DIRECTORY,
    items: projectRequests,
    variablesForRequest,
    environmentName: activeEnvironmentName,
    isInsecureTlsApproved: tlsApprovals.isApproved,
    approveInsecureTls: tlsApprovals.approve,
  })
  const confirmInsecureTls = useCallback(() => {
    if (!pendingTlsApproval) return
    const pendingDocumentId = pendingTlsApproval.documentId
    tlsApprovals.approve(pendingTlsApproval)
    setPendingTlsApproval(null)
    closeOverlay()
    setTimeout(() => void sendDocument(pendingDocumentId), 0)
  }, [closeOverlay, pendingTlsApproval, sendDocument, tlsApprovals.approve])
  const cancelInsecureTls = useCallback(() => {
    setPendingTlsApproval(null)
    closeOverlay()
  }, [closeOverlay])

  useKeyboard((key) => {
    if (!active || !activeDocument) return
    const focusedId = renderer.currentFocusedRenderable?.id ?? ""
    const documentId = activeDocument.request.id
    const command = resolveHttpKeyboardCommand({
      key,
      focusedId,
      navigationOpen: state.navigationOpen,
      running: activeDocument.execution.status === "running",
      minimum: layout.mode === "minimum",
      activePane: state.activePane,
      overlay: state.overlay,
      navigationView: state.navigationView,
      requestView: activeDocument.requestView,
      requestMoreView: activeDocument.requestMoreView,
    })
    if (command.kind === "none" || command.kind === "ignore") return
    key.preventDefault()
    key.stopPropagation()
    if (requestEditing.applyOptionCommand(command.kind)) return

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
        void responseTools.openResponse(documentId)
        return
      case "focus-collection-search":
        collectionSearchRef.current?.focus()
        return
      case "cycle-document":
        cycleDocument(command.direction)
        return
      case "cycle-method":
        requestEditing.cycleMethod(command.direction)
        return
      case "resize-split":
        dispatch({
          type: "set-split-ratio",
          documentId,
          ratio: resizeHttpSplitRatio(activeDocument.splitRatio, command.direction),
        })
        return
      case "toggle-maximize": {
        const pane = state.activePane === "response" ? "response" : "request"
        dispatch({ type: "select-pane", pane })
        dispatch({ type: "toggle-maximize", documentId, pane })
        return
      }
      case "open-overlay":
        if (command.overlay === "request-move") return requestFiles.openMove()
        if (command.overlay === "request-delete") return requestFiles.openDelete()
        if (command.overlay === "collection-import") collectionImport.open()
        if (command.overlay === "collection-runner") collectionRunner.open()
        blurDocumentControls()
        dispatch({ type: "open-overlay", overlay: command.overlay })
        return
      case "close-overlay":
        if (state.overlay === "collection-runner") collectionRunner.cancel()
        if (state.overlay === "discard-document") cancelPendingClose()
        if (state.overlay === "insecure-tls-confirmation") setPendingTlsApproval(null)
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
        if (state.overlay === "curl-import") applyCurlImport()
        else if (state.overlay === "collection-import") void collectionImport.apply()
        else if (state.overlay === "collection-runner") void collectionRunner.run()
        else if (state.overlay === "discard-document") {
          confirmCloseDocument()
          closeOverlay()
        } else if (state.overlay === "insecure-tls-confirmation" && pendingTlsApproval) {
          confirmInsecureTls()
        } else void requestFiles.apply(state.overlay)
        return
      case "toggle-import-format":
        collectionImport.cycleFormat()
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
      case "focus-url":
        urlRef.current?.focus()
        return
      case "request-view":
        requestEditing.selectRequestView(documentId, command.view)
        return
      case "request-more-view":
        requestEditing.selectRequestMoreView(documentId, command.view)
        return
      case "add-automation-row":
        requestEditing.addAutomationRow()
        return
      case "cycle-response": {
        const views = ["pretty", "raw", "headers", "timing", "more"] as const
        const current = views.indexOf(activeDocument.responseView)
        const view = views[(current + 1) % views.length]
        if (view) dispatch({ type: "select-response-view", documentId, view })
        dispatch({ type: "select-pane", pane: "response" })
        return
      }
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
  const running = activeDocument.execution.status === "running"
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
      <HttpDocumentBar
        documents={state.documents}
        activeDocumentId={state.activeDocumentId}
        compact={terminal.width < 96}
        onSelect={selectDocument}
        onClose={requestCloseDocument}
        onAdd={addDocument}
      />
      <HttpOmnibar
        request={activeDocument.request}
        twoRows={layout.omnibarRows === 2}
        running={running}
        readOnly={isOpaqueHttpRequest(activeDocument.request)}
        urlRef={urlRef}
        onUrlChange={(url) =>
          dispatch({
            type: "update-request",
            documentId: activeDocument.request.id,
            patch: { url },
          })
        }
        onCycleMethod={requestEditing.cycleMethod}
        onSend={() => void sendDocument(activeDocument.request.id)}
        onCancel={() => cancelDocument(activeDocument.request.id)}
        environmentName={activeEnvironmentName}
        productionEnvironment={activeEnvironment?.production ?? false}
        onOpenEnvironment={openEnvironmentManager}
      />
      <HttpPaneSelector
        mode={layout.mode}
        activePane={state.activePane}
        navigationOpen={state.navigationOpen}
        navigationView={state.navigationView}
        onPane={(pane) => dispatch({ type: "select-pane", pane })}
        onNavigation={toggleNavigation}
      />
      <box style={{ height: panelSpacing, flexShrink: 0 }} />
      <HttpWorkspaceBody
        state={state}
        layout={layout}
        height={bodyHeight}
        registerHeaderInput={(documentId, input) => {
          refsFor(documentId).headers = input
        }}
        registerBodyEditor={(documentId, editor) => {
          refsFor(documentId).body = editor
        }}
        registerRawScroll={(documentId, scroll) => {
          refsFor(documentId).raw = scroll
        }}
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
        onQueryChange={(documentId, query) =>
          dispatch({ type: "update-request", documentId, patch: { query } })
        }
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
        projectErrors={project.errors.length}
        onOpenProjectRequest={openProjectRequest}
        onImportCollection={() => {
          collectionImport.open()
          dispatch({ type: "open-overlay", overlay: "collection-import" })
        }}
        onRunCollection={() => {
          collectionRunner.open()
          dispatch({ type: "open-overlay", overlay: "collection-runner" })
        }}
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
        collectionRunner={collectionRunner}
        environment={httpProject}
        onOpenWorkspaceSettings={() =>
          dispatch({ type: "open-overlay", overlay: "workspace-settings" })
        }
        externalConflict={requestPersistence}
        pendingCloseName={pendingCloseDocument?.request.name ?? ""}
        onConfirmCloseDocument={() => {
          confirmCloseDocument()
          closeOverlay()
        }}
        onCancelCloseDocument={() => {
          cancelPendingClose()
          closeOverlay()
        }}
        pendingTlsApproval={pendingTlsApproval}
        onConfirmInsecureTls={confirmInsecureTls}
        onCancelInsecureTls={cancelInsecureTls}
      />
    </box>
  )
}
