import { httpWorkspaceTabActions } from "./hooks/http-workspace-tab-actions"
import {
  blurHttpWorkspaceControl,
  selectHttpWorkspaceTab,
  applyHttpAuxiliaryDocumentCommand,
} from "./hooks/http-auxiliary-document-command"
import { useHttpCollectionSettings } from "./hooks/use-http-collection-settings"
import { HttpCollectionSettingsConfirmation } from "./ui/HttpCollectionSettingsConfirmation"
import { useHttpEnvironmentTabs } from "./hooks/use-http-environment-tabs"
import { HttpEnvironmentConfirmation } from "./ui/HttpEnvironmentConfirmation"
import { httpRequestUpdates } from "./hooks/http-request-updates"
import type { InputRenderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef } from "react"
import { LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import {
  DEFAULT_HTTP_SPLIT_RATIO,
  resizeHttpSplitRatio,
  resolveHttpWorkspaceLayout,
} from "./model/layout"
import { useHttpKeyboard } from "./hooks/use-http-keyboard"
import { HttpBoxSelectionContext } from "./ui/HttpBoxSelection"
import { useHttpWorkspaceActions } from "./hooks/use-http-workspace-actions"
import type { HttpKeyboardCommand, HttpKey } from "./model/keyboard-types"
import type { HttpRequestTableKey } from "./hooks/use-http-request-tables"
import { applyHttpViewKeyboardCommand } from "./model/workspace-keyboard-actions"
import { useHttpWorkspaceState } from "./hooks/use-http-workspace-state"
import { HTTP_WORKING_DIRECTORY } from "./services/context"
import { useHttpProject } from "./hooks/use-http-project"
import { DEFAULT_HTTP_WORKSPACE_CONFIG as workspaceConfig } from "./storage/config"
import type { HttpCompletionKey } from "./model/variable-completion"
import { HttpVariableCompletion } from "./ui/HttpVariableCompletion"
import { HttpWorkspaceHeader } from "./ui/HttpWorkspaceHeader"
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
import { useHttpCollectionManagement } from "./hooks/use-http-collection-management"
import { useHttpDocuments } from "./hooks/use-http-documents"
import { useHttpCollectionImport } from "./hooks/use-http-collection-import"
import { useHttpPostman, useHttpProjectRequestOpener } from "./hooks/use-http-postman"
import { httpSourceRuntime } from "./hooks/http-source-project"
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
import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import { useHttpExecutionNotifications } from "./hooks/use-http-execution-notifications"
import { ensureHttpRendererListenerBudget } from "./model/renderer-listener-budget"
import { useHttpJsonTree } from "./hooks/use-http-json-tree"
import type { HttpSourceWorkspaceProps } from "./ui/HttpSourceClient"
export function HttpInteractiveClient({
  active,
  initialUrlRequest,
  onUnsavedChangesChange,
  sourceMode,
  onChooseSource,
  startup,
}: HttpSourceWorkspaceProps) {
  const renderer = useRenderer()
  ensureHttpRendererListenerBudget(renderer)
  const terminal = useTerminalDimensions()
  const urlRef = useRef<InputRenderable | null>(null)
  const variableCompletionKeyRef = useRef<((key: HttpCompletionKey) => boolean) | null>(null)
  const requestTableKeyRef = useRef<((key: HttpRequestTableKey) => boolean) | null>(null)
  const collectionTreeKeyRef = useRef<((key: HttpKey) => boolean) | null>(null)
  const collectionSearchRef = useRef<InputRenderable | null>(null)
  const { documentRefs, refsFor, blurDocumentControls } = useHttpDocumentRefs(urlRef)
  const abortControllers = useRef(new Map<string, AbortController>())
  const { state, stateRef, dispatch, replacingDocumentId, cancelReplacement } =
    useHttpWorkspaceState(documentRefs, abortControllers)
  const documentCounter = useRef(0)
  const { notify } = useNotifications()
  const setNotice = useCallback((message: string) => notify({ source: "HTTP", message }), [notify])
  const tlsApprovals = useHttpTlsApprovals()
  const redirectApprovals = useHttpRedirectApprovals(tlsApprovals.approve)
  const activeDocument = state.documents.find(
    (document) => document.request.id === state.activeDocumentId,
  )
  const activeJsonTree = useHttpJsonTree(activeDocument)
  useHttpExecutionNotifications(state.documents)
  const httpProject = useHttpProject(undefined, sourceMode === "local")
  const postman = useHttpPostman(dispatch, blurDocumentControls, setNotice, stateRef, startup)
  const collectionSettings = useHttpCollectionSettings({
    state,
    stateRef,
    dispatch,
    session: sourceMode === "postman" ? postman.session : null,
  })
  const environments = useHttpEnvironmentTabs({
    state,
    stateRef,
    dispatch,
    project: httpProject,
    session: sourceMode === "postman" ? postman.session : null,
    notice: setNotice,
  })
  const {
    projectRequests,
    sourceFiles,
    sourceDirectories,
    sourcePostmanFolders,
    activeEnvironment,
    activeEnvironmentName,
    variablesForRequest,
    refreshProject,
  } = httpSourceRuntime(httpProject, postman, sourceMode)
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
  useHttpUnsavedChanges(
    state.documents,
    onUnsavedChangesChange,
    environments.blocked || collectionSettings.blocked,
  )
  const preparedPreview = useHttpPreview(activeDocument, workspaceConfig, variablesForRequest)
  const {
    command: curlImportCommand,
    setCommand: setCurlImportCommand,
    exported: exportedCurl,
    applyImport: applyCurlImport,
    copyExport: copyExportedCurl,
  } = useHttpCurl({
    activeDocument,
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
    hasDocument: Boolean(activeDocument),
    outerPadding: LAYOUT.outerPadding,
    spacing: LAYOUT.headerSpacing,
    splitRatio: activeDocument?.splitRatio ?? DEFAULT_HTTP_SPLIT_RATIO,
    navigationFocused: active && state.activePane === "navigation",
  })
  const panelSpacing = layout.mode === "minimum" ? 0 : LAYOUT.headerSpacing
  useHttpWorkspaceLifecycle({
    active,
    auxiliaryDocument: Boolean(collectionSettings.active || environments.active),
    activePane: state.activePane,
    initialUrlRequest,
    document: activeDocument,
    urlRef,
    abortControllers,
    dispatch,
  })
  const {
    selectDocument,
    openProjectRequest: openDocument,
    addDocument,
    cancelDocument,
    closeDocument,
    requestCloseDocument,
    confirmCloseDocument,
    cancelPendingClose,
    pendingCloseDocument,
  } = useHttpDocuments({
    documents: state.documents,
    replacingDocumentId,
    cancelReplacement,
    documentRefs,
    abortControllers,
    documentCounter,
    urlRef,
    refsFor,
    blurDocumentControls,
    dispatch,
  })
  const openProjectRequest = useHttpProjectRequestOpener(
    sourceMode,
    postman.openRequest,
    openDocument,
  )
  const persistenceContext = {
    root: HTTP_WORKING_DIRECTORY,
    sourceMode,
    postmanSession: postman.session,
    dispatch,
    refreshProject,
    setNotice,
  }
  const requestFiles = useHttpRequestFiles({
    ...persistenceContext,
    document: activeDocument,
    closeDocument,
  })
  const requestPersistence = useHttpRequestPersistence({
    ...persistenceContext,
    collectionFiles: sourceFiles,
    documents: state.documents,
    documentRefs,
    setNotice,
  })
  const sendDocument = useHttpSendDocument({
    prepareRequest: sourceMode === "postman" ? postman.session?.requestForExecution : undefined,
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
  const openEnvironmentManager = () => toggleNavigation("environments")
  const manageCollection = useHttpCollectionManagement({
    settingsBlocked: collectionSettings.isBlocked,
    ...persistenceContext,
    files: sourceFiles,
    ensurePostmanSession: postman.ensureSession,
    getDocuments: () => stateRef.current.documents,
    openRequest: openProjectRequest,
    setNotice,
  })
  const requestEditing = useHttpRequestEditing({
    documents: state.documents,
    activeDocument,
    refsFor,
    dispatch,
  })
  const { toggleNavigation } = useHttpNavigation({
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
    if (sourceMode === "postman" && !startup) postman.open()
  }, [postman.open, sourceMode, startup])
  const collectionRunner = useHttpCollectionRunner({
    root: HTTP_WORKING_DIRECTORY,
    items: projectRequests,
    variablesForRequest,
    environmentName: activeEnvironmentName,
    isInsecureTlsApproved: tlsApprovals.isApproved,
    approveInsecureTls: tlsApprovals.approve,
    authorizeRedirect: redirectApprovals.authorize,
  })
  const { selectTab, closeTab, chooseSource } = httpWorkspaceTabActions({
    stateRef,
    settings: collectionSettings,
    environments,
    selectDocument,
    requestCloseDocument,
    blur: blurDocumentControls,
    notice: setNotice,
    onChooseSource,
  })
  function runCommand(command: HttpKeyboardCommand) {
    const currentState = stateRef.current
    const currentDocument = currentState.documents.find(
      (item) => item.request.id === currentState.activeDocumentId,
    )
    if (
      blurHttpWorkspaceControl(
        command,
        () => renderer.currentFocusedRenderable?.blur(),
        blurDocumentControls,
        dispatch,
      )
    )
      return
    switch (command.kind) {
      case "choose-box":
        actions.openBoxes()
        return
      case "add-document":
        addDocument()
        return
      case "open-environment-manager":
        openEnvironmentManager()
        return
      case "focus-collection-search":
        return void collectionSearchRef.current?.focus()
      case "open-overlay":
        if (
          !currentDocument &&
          ["jump", "request-move", "request-delete", "curl-export"].includes(command.overlay)
        )
          return
        if (command.overlay === "help") return actions.openPalette()
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
        if (currentState.overlay === "collection-runner" && collectionRunner.cancel()) return
        if (currentState.overlay === "discard-document") cancelPendingClose()
        requestPersistence.cancelExternalConflict()
        closeOverlay()
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
        if (collectionRunner.status === "running") return
        collectionRunner.cycleTarget()
        return
      case "cycle-runner-concurrency":
        if (collectionRunner.status === "running") return
        collectionRunner.cycleConcurrency()
        return
      case "approve-runner-insecure-tls":
        collectionRunner.approvePendingTls()
        return
      case "navigation":
        toggleNavigation(command.view)
        return
      case "close-navigation":
        dispatch({ type: "close-navigation" })
        return
      case "pane":
        if (["request", "response"].includes(command.pane) && !currentDocument) return
        renderer.currentFocusedRenderable?.blur()
        dispatch({ type: "select-pane", pane: command.pane })
        if (currentDocument)
          renderer.root
            .findDescendantById(`http-${command.pane}-pane-${currentDocument.request.id}`)
            ?.focus()
        return
    }
    if (selectHttpWorkspaceTab(command, currentState, selectTab)) return
    if (collectionSettings.active || environments.active) {
      applyHttpAuxiliaryDocumentCommand(
        command,
        currentState,
        collectionSettings.active ? collectionSettings : environments,
        () => renderer.currentFocusedRenderable?.blur(),
        dispatch,
      )
      return
    }
    if (!currentDocument) return
    const documentId = currentDocument.request.id
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
      case "send":
        void sendDocument(documentId)
        return
      case "cancel":
        cancelDocument(documentId)
        return
      case "close-document":
        requestCloseDocument(documentId)
        return
      case "save-document":
        return void requestPersistence.saveDocument(documentId)
      case "push-postman-document":
        return void requestPersistence.saveDocument(currentDocument.request.id)
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
      case "duplicate-document":
        return void requestPersistence.duplicateDocument(documentId)
      case "jump":
        jumpTo(command.target)
        return
    }
  }
  const settingsPending = Boolean(environments.pending || collectionSettings.pending)
  const interactive =
    active &&
    !redirectApprovals.pending &&
    !manageCollection.pending &&
    !requestPersistence.pendingPostmanSaveId &&
    !settingsPending
  const actions = useHttpWorkspaceActions({
    active: interactive && state.overlay === null,
    document: activeDocument,
    environment: Boolean(environments.active || collectionSettings.active),
    requestPaneId: collectionSettings.active ? "http-collection-settings-pane" : undefined,
    pane: state.activePane,
    sourceMode,
    run: runCommand,
    focusPane: (pane) => {
      renderer.currentFocusedRenderable?.blur()
      dispatch({ type: "select-pane", pane })
      if (pane === "url") urlRef.current?.focus()
      if (pane === "request" && environments.active)
        renderer.root.findDescendantById("http-environment-pane")?.focus()
      if (pane === "response" && activeDocument)
        refsFor(activeDocument.request.id).response?.focus()
      if (pane === "navigation")
        renderer.root.findDescendantById("http-navigation-collection")?.focus()
    },
  })
  useHttpResponseFocus({
    active: interactive && !actions.blocked && state.overlay === null,
    document: activeDocument,
    pane: state.activePane,
    refsFor,
  })
  useHttpKeyboard({
    active: interactive && !actions.blocked,
    collectionSettingsActive: Boolean(collectionSettings.active),
    stateRef,
    minimum: layout.mode === "minimum",
    chooseSource,
    runCommand,
    variableCompletionKeyRef,
    requestTableKeyRef,
    collectionTreeKeyRef,
  })
  const workspace = (
    <box
      id="http-workspace"
      style={{
        flexGrow: 1,
        position: "relative",
        backgroundColor: LAYOUT.workspaceBackground,
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
        onSelectDocument={selectTab}
        onCloseDocument={closeTab}
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
        oauth={{ environmentName: activeEnvironmentName, variablesForRequest }}
        active={active}
        interactionBlocked={actions.blocked || settingsPending}
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
        onSelectDocument={selectTab}
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
        {...httpRequestUpdates(stateRef, dispatch)}
        onSend={(documentId) => void sendDocument(documentId)}
        onCancel={cancelDocument}
        projectRequests={projectRequests}
        projectDirectories={sourceDirectories}
        projectFiles={sourceFiles}
        postmanFolders={sourcePostmanFolders}
        postmanWorkspace={postman.workspace}
        onPostmanWorkspaceChange={postman.selectWorkspace}
        projectErrors={httpProject.project.errors.length}
        sourceMode={sourceMode}
        onOpenProjectRequest={openProjectRequest}
        onImportCollection={() => {
          collectionImport.open()
          dispatch({ type: "open-overlay", overlay: "collection-import" })
        }}
        onOpenPostman={postman.open}
        onRunCollection={(collection) => {
          collectionRunner.open(collection)
          dispatch({ type: "open-overlay", overlay: "collection-runner" })
        }}
        onManageCollection={manageCollection.manage}
        onNameChange={requestEditing.changeName}
        onScriptsChange={(documentId, scripts) =>
          dispatch({ type: "update-request", documentId, patch: { scripts } })
        }
        onDocsChange={requestEditing.changeDescription}
        onMethodChange={requestEditing.changeMethod}
        onOptionsChange={requestEditing.changeOptions}
        onAssertionsChange={requestEditing.changeAssertions}
        onChainChange={requestEditing.changeChain}
        onImportCurl={() => runCommand({ kind: "open-overlay", overlay: "curl-import" })}
        onExportCurl={() => runCommand({ kind: "open-overlay", overlay: "curl-export" })}
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
        environments={environments}
        collectionSettings={collectionSettings}
        preparedPreview={preparedPreview}
        onSplitRatioChange={(ratio) =>
          dispatch({
            type: "set-split-ratio",
            documentId: activeDocument?.request.id ?? "",
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
        onJump={actions.openBoxes}
        onHelp={actions.openPalette}
        onSave={() =>
          void (activeDocument && requestPersistence.saveDocument(activeDocument.request.id))
        }
      />
      {collectionSettings.pending ? (
        <HttpCollectionSettingsConfirmation settings={collectionSettings} />
      ) : null}
      <HttpWorkspaceOverlays
        overlay={state.overlay}
        document={activeDocument}
        activePane={state.activePane}
        terminalWidth={terminal.width}
        terminalHeight={terminal.height}
        historyDiff={selectedHttpHistoryEntries(state.history, state.historySelection)}
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
      {environments.pending ? <HttpEnvironmentConfirmation environments={environments} /> : null}
      <HttpVariableCompletion
        request={activeDocument?.request}
        project={httpProject}
        dispatch={dispatch}
        session={sourceMode === "postman" ? postman.session : null}
        active={active && !state.overlay && !actions.blocked && !environments.active}
        variables={activeDocument ? variablesForRequest(activeDocument.request) : new Map()}
        keyRef={variableCompletionKeyRef}
      />
      {actions.content}
      {manageCollection.content}
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
  return (
    <HttpBoxSelectionContext.Provider value={actions.boxOverlay}>
      {workspace}
    </HttpBoxSelectionContext.Provider>
  )
}
