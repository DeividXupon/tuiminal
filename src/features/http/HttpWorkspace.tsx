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
import { httpBodyFor, type HttpDocumentRefs, newHttpExecutionId } from "./runtime"
import { createHttpWorkspaceState, httpWorkspaceReducer } from "./model/workspace"
import { HTTP_WORKING_DIRECTORY } from "./services/context"
import { applyHttpWorkspaceConfig } from "./storage/config"
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
import { runHttpCollectionCase } from "./services/collection-runner"
import { useHttpPreview } from "./hooks/use-http-request-preview"
import { useHttpUnsavedChanges } from "./hooks/use-http-unsaved-changes"

export function HttpClient({
  active,
  initialUrlRequest,
  onUnsavedChangesChange,
}: {
  active: boolean
  initialUrlRequest?: HttpClientUrlRequest | null
  onUnsavedChangesChange?: (dirty: boolean) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [state, dispatch] = useReducer(httpWorkspaceReducer, undefined, createHttpWorkspaceState)
  const urlRef = useRef<InputRenderable | null>(null)
  const collectionSearchRef = useRef<InputRenderable | null>(null)
  const documentRefs = useRef(new Map<string, HttpDocumentRefs>())
  const abortControllers = useRef(new Map<string, AbortController>())
  const documentCounter = useRef(1)
  const [notice, setNotice] = useState("")
  const httpProject = useHttpProject()
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
  })
  const activeDocument =
    state.documents.find((document) => document.request.id === state.activeDocumentId) ??
    state.documents[0]
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
  const refsFor = useCallback((documentId: string) => {
    const existing = documentRefs.current.get(documentId)
    if (existing) return existing
    const refs = { headers: null, body: null, response: null, responseSearch: null }
    documentRefs.current.set(documentId, refs)
    return refs
  }, [])
  const blurDocumentControls = useCallback(() => {
    urlRef.current?.blur()
    for (const refs of documentRefs.current.values()) {
      refs.headers?.blur()
      refs.body?.blur()
      refs.response?.blur()
      refs.responseSearch?.blur()
    }
  }, [])
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
  const sendDocument = useCallback(
    async (documentId: string) => {
      const document = state.documents.find((candidate) => candidate.request.id === documentId)
      if (!document || document.execution.status === "running") return

      const executionId = newHttpExecutionId()
      const requestRevision = document.revision
      const controller = new AbortController()
      abortControllers.current.set(executionId, controller)
      dispatch({ type: "start-execution", documentId, executionId, requestRevision })
      dispatch({ type: "select-pane", pane: "response" })
      refsFor(documentId).response?.scrollTo(0)

      try {
        const activeItem = {
          filePath: document.request.source.kind === "file" ? document.request.source.path : "",
          request: document.request,
        }
        const items = [
          ...projectRequests.filter((item) => item.request.id !== document.request.id),
          activeItem,
        ].map((item) => ({
          ...item,
          request: applyHttpWorkspaceConfig(item.request, workspaceConfig),
        }))
        const chain = await runHttpCollectionCase({
          name: document.request.name,
          items,
          selector: document.request.id,
          variables: new Map(),
          variablesForRequest,
          root: HTTP_WORKING_DIRECTORY,
          signal: controller.signal,
          cookieJar: responseTools.cookieJar,
        })
        if (controller.signal.aborted) {
          dispatch({ type: "cancel-execution", documentId, executionId, requestRevision })
          return
        }
        const result = chain.items.find((item) => item.requestId === document.request.id)
        const failed = result?.error ?? chain.items.findLast((item) => item.error)?.error
        if (!result?.response || failed) {
          const message = failed?.message ?? "O request não foi executado após suas dependências."
          dispatch({
            type: "fail-execution",
            documentId,
            executionId,
            requestRevision,
            kind: failed?.kind ?? "parse",
            message,
            historyEntry: document.request.options.noLog
              ? null
              : historyTools.failure(document, executionId, message, activeEnvironmentName),
          })
          return
        }
        const response = {
          ...result.response,
          executionId,
          requestId: documentId,
          requestRevision,
        }
        if (chain.items.length > 1) setNotice(`CHAIN EXECUTADO · ${chain.items.length} REQUESTS`)
        responseTools.responseCompleted()
        dispatch({
          type: "finish-execution",
          documentId,
          response,
          historyEntry: document.request.options.noLog
            ? null
            : historyTools.success(document, response, activeEnvironmentName),
        })
      } catch (error) {
        if (controller.signal.aborted) {
          dispatch({ type: "cancel-execution", documentId, executionId, requestRevision })
        } else {
          const message = error instanceof Error ? error.message : String(error)
          dispatch({
            type: "fail-execution",
            documentId,
            executionId,
            requestRevision,
            kind: "parse",
            message,
            historyEntry: document.request.options.noLog
              ? null
              : historyTools.failure(document, executionId, message, activeEnvironmentName),
          })
        }
      } finally {
        abortControllers.current.delete(executionId)
      }
    },
    [
      activeEnvironmentName,
      historyTools,
      projectRequests,
      refsFor,
      responseTools,
      state.documents,
      variablesForRequest,
      workspaceConfig,
    ],
  )
  const openEnvironmentManager = useCallback(() => {
    blurDocumentControls()
    dispatch({ type: "open-overlay", overlay: "environment-manager" })
  }, [blurDocumentControls])
  const openProjectRequest = useCallback(
    (item: HttpProjectRequestItem) => {
      blurDocumentControls()
      dispatch({ type: "add-document", request: item.request })
      setTimeout(() => urlRef.current?.focus(), 0)
    },
    [blurDocumentControls],
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
  })

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
  const urlWidth = Math.max(8, terminal.width - (layout.omnibarRows === 2 ? 13 : 35))
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
        inputWidth={urlWidth}
        running={running}
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
      <box style={{ height: LAYOUT.headerSpacing, flexShrink: 0 }} />
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
      />
      <box style={{ height: LAYOUT.headerSpacing, flexShrink: 0 }} />
      <HttpClientFooter
        minimum={layout.mode === "minimum"}
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
      />
    </box>
  )
}
