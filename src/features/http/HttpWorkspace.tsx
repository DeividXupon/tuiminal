import type { InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { COLORS, LAYOUT } from "../../core/settings/theme"
import { resizeHttpSplitRatio, resolveHttpWorkspaceLayout } from "./model/layout"
import { resolveHttpKeyboardCommand } from "./model/keyboard"
import {
  HTTP_METHODS,
  type HttpAuth,
  type HttpBodyKind,
  type HttpClientUrlRequest,
  type HttpJumpTarget,
  type HttpKeyValue,
  type HttpProjectRequestItem,
} from "./model/types"
import { httpBodyFor, type HttpDocumentRefs, newHttpExecutionId } from "./runtime"
import {
  createHttpWorkspaceState,
  createScratchRequest,
  HTTP_DOCUMENT_LIMIT,
  httpWorkspaceReducer,
} from "./model/workspace"
import { executePreparedHttpRequest, HttpExecutionError } from "./services/fetch-transport"
import { prepareHttpRequest } from "./services/request-builder"
import { HTTP_WORKING_DIRECTORY } from "./services/context"
import { requestFromHttpFile } from "./model/http-file"
import {
  saveHttpRequest,
  scanHttpProject,
  watchHttpProject,
  type HttpProjectCollection,
} from "./storage/collections"
import {
  applyHttpWorkspaceConfig,
  DEFAULT_HTTP_WORKSPACE_CONFIG,
  loadHttpWorkspaceConfig,
} from "./storage/config"
import {
  environmentVariableContext,
  loadHttpEnvironments,
  type HttpEnvironment,
} from "./storage/environments"
import { HttpDocumentBar } from "./ui/HttpDocumentBar"
import { HttpOmnibar } from "./ui/HttpOmnibar"
import { HttpPaneSelector } from "./ui/HttpPaneSelector"
import { HttpWorkspaceBody } from "./ui/HttpWorkspaceBody"
import { HttpWorkspaceFooter } from "./ui/HttpWorkspaceFooter"
import { HttpWorkspaceOverlay } from "./ui/HttpWorkspaceOverlay"

function isRequestJumpTarget(
  target: HttpJumpTarget,
): target is "params" | "headers" | "body" | "auth" {
  return target === "params" || target === "headers" || target === "body" || target === "auth"
}

export function HttpClient({
  active,
  initialUrlRequest,
}: {
  active: boolean
  initialUrlRequest?: HttpClientUrlRequest | null
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [state, dispatch] = useReducer(httpWorkspaceReducer, undefined, () =>
    createHttpWorkspaceState(),
  )
  const urlRef = useRef<InputRenderable | null>(null)
  const documentRefs = useRef(new Map<string, HttpDocumentRefs>())
  const abortControllers = useRef(new Map<string, AbortController>())
  const documentCounter = useRef(1)
  const handledInitialRequestId = useRef<number | null>(null)
  const [project, setProject] = useState<HttpProjectCollection>({
    root: HTTP_WORKING_DIRECTORY,
    files: [],
    errors: [],
  })
  const [environments, setEnvironments] = useState<HttpEnvironment[]>([])
  const [activeEnvironmentName, setActiveEnvironmentName] = useState<string | null>(null)
  const [workspaceConfig, setWorkspaceConfig] = useState(DEFAULT_HTTP_WORKSPACE_CONFIG)
  const [notice, setNotice] = useState("")

  const activeDocument =
    state.documents.find((document) => document.request.id === state.activeDocumentId) ??
    state.documents[0]
  const { layout, bodyHeight } = resolveHttpWorkspaceLayout({
    terminalWidth: terminal.width,
    terminalHeight: terminal.height,
    appHeaderRows: LAYOUT.compact ? 1 : 2,
    outerPadding: LAYOUT.outerPadding,
    spacing: LAYOUT.headerSpacing,
    splitRatio: activeDocument?.splitRatio ?? 0.4,
  })
  const projectRequests = useMemo<HttpProjectRequestItem[]>(
    () =>
      project.files.flatMap((file) =>
        file.requests.map((block) => ({
          filePath: file.path,
          request: requestFromHttpFile(file, block),
        })),
      ),
    [project.files],
  )
  const activeEnvironment = environments.find(
    (environment) => environment.name === activeEnvironmentName,
  )

  const refreshProject = useCallback(async () => {
    const [nextProject, nextEnvironments, nextConfig] = await Promise.all([
      scanHttpProject(HTTP_WORKING_DIRECTORY),
      loadHttpEnvironments(HTTP_WORKING_DIRECTORY),
      loadHttpWorkspaceConfig(HTTP_WORKING_DIRECTORY),
    ])
    setProject(nextProject)
    setEnvironments(nextEnvironments)
    setWorkspaceConfig(nextConfig)
    setActiveEnvironmentName((current) => {
      if (current && nextEnvironments.some((environment) => environment.name === current)) {
        return current
      }
      if (
        nextConfig.defaultEnvironment &&
        nextEnvironments.some((environment) => environment.name === nextConfig.defaultEnvironment)
      ) {
        return nextConfig.defaultEnvironment
      }
      return null
    })
  }, [])

  const refsFor = useCallback((documentId: string) => {
    const existing = documentRefs.current.get(documentId)
    if (existing) return existing
    const refs = { headers: null, body: null, response: null }
    documentRefs.current.set(documentId, refs)
    return refs
  }, [])

  const blurDocumentControls = useCallback(() => {
    urlRef.current?.blur()
    for (const refs of documentRefs.current.values()) {
      refs.headers?.blur()
      refs.body?.blur()
      refs.response?.blur()
    }
  }, [])

  const selectDocument = useCallback(
    (documentId: string) => {
      blurDocumentControls()
      dispatch({ type: "select-document", documentId })
      setTimeout(() => urlRef.current?.focus(), 0)
    },
    [blurDocumentControls],
  )

  const addDocument = useCallback(() => {
    if (state.documents.length >= HTTP_DOCUMENT_LIMIT) return
    documentCounter.current += 1
    dispatch({
      type: "add-document",
      request: createScratchRequest(`http-scratch-${documentCounter.current}`),
    })
    setTimeout(() => urlRef.current?.focus(), 0)
  }, [state.documents.length])

  const cancelDocument = useCallback(
    (documentId: string) => {
      const document = state.documents.find((candidate) => candidate.request.id === documentId)
      if (document?.execution.status !== "running") return
      abortControllers.current.get(document.execution.executionId)?.abort()
    },
    [state.documents],
  )

  const closeDocument = useCallback(
    (documentId: string) => {
      cancelDocument(documentId)
      documentRefs.current.delete(documentId)
      dispatch({ type: "close-document", documentId })
      setTimeout(() => urlRef.current?.focus(), 0)
    },
    [cancelDocument],
  )

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
        const requestSource = document.request.source
        const fileVariables =
          requestSource.kind === "file"
            ? project.files.find((file) => file.path === requestSource.path)?.variables
            : undefined
        const variables = environmentVariableContext(activeEnvironment, fileVariables)
        const configuredRequest = applyHttpWorkspaceConfig(document.request, workspaceConfig)
        const prepared = prepareHttpRequest(
          configuredRequest,
          executionId,
          requestRevision,
          variables,
        )
        const response = await executePreparedHttpRequest(prepared, controller.signal)
        dispatch({ type: "finish-execution", documentId, response })
      } catch (error) {
        if (error instanceof HttpExecutionError && error.kind === "cancelled") {
          dispatch({ type: "cancel-execution", documentId, executionId, requestRevision })
        } else {
          dispatch({
            type: "fail-execution",
            documentId,
            executionId,
            requestRevision,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        abortControllers.current.delete(executionId)
      }
    },
    [activeEnvironment, project.files, refsFor, state.documents, workspaceConfig],
  )

  const cycleEnvironment = useCallback(() => {
    if (!environments.length) {
      setActiveEnvironmentName(null)
      setNotice("Nenhum ambiente configurado no projeto.")
      return
    }
    const current = environments.findIndex(
      (environment) => environment.name === activeEnvironmentName,
    )
    const next = environments[(current + 1) % environments.length]
    setActiveEnvironmentName(next?.name ?? null)
    setNotice(next?.production ? "AMBIENTE DE PRODUÇÃO SELECIONADO" : "")
  }, [activeEnvironmentName, environments])

  const saveDocument = useCallback(
    async (documentId: string) => {
      const document = state.documents.find((candidate) => candidate.request.id === documentId)
      if (!document || document.execution.status === "running") return
      setNotice("SALVANDO REQUEST…")
      try {
        const saved = await saveHttpRequest(HTTP_WORKING_DIRECTORY, document.request)
        if (saved.id !== documentId) documentRefs.current.delete(documentId)
        dispatch({ type: "commit-saved-document", documentId, request: saved })
        setNotice(
          `REQUEST SALVO · ${saved.source.kind === "file" ? saved.source.path : saved.name}`,
        )
        await refreshProject()
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [refreshProject, state.documents],
  )

  const openProjectRequest = useCallback(
    (item: HttpProjectRequestItem) => {
      blurDocumentControls()
      dispatch({ type: "add-document", request: item.request })
      setTimeout(() => urlRef.current?.focus(), 0)
    },
    [blurDocumentControls],
  )

  const cycleMethod = useCallback(
    (direction: number) => {
      if (!activeDocument) return
      const method = activeDocument.request.method.toUpperCase() as (typeof HTTP_METHODS)[number]
      const index = HTTP_METHODS.indexOf(method)
      const next =
        HTTP_METHODS[(Math.max(0, index) + direction + HTTP_METHODS.length) % HTTP_METHODS.length]
      if (!next) return
      dispatch({
        type: "update-request",
        documentId: activeDocument.request.id,
        patch: { method: next },
      })
    },
    [activeDocument],
  )

  const selectRequestView = useCallback(
    (documentId: string, view: "params" | "headers" | "body" | "auth" | "more") => {
      dispatch({ type: "select-pane", pane: "request" })
      dispatch({ type: "select-request-view", documentId, view })
      const request = state.documents.find(
        (document) => document.request.id === documentId,
      )?.request
      if (view === "headers") setTimeout(() => refsFor(documentId).headers?.focus(), 0)
      if (view === "body" && request?.body.kind !== "none")
        setTimeout(() => refsFor(documentId).body?.focus(), 0)
    },
    [refsFor, state.documents],
  )

  const cycleDocument = useCallback(
    (direction: number) => {
      const current = state.documents.findIndex(
        (document) => document.request.id === state.activeDocumentId,
      )
      const next =
        state.documents[(current + direction + state.documents.length) % state.documents.length]
      if (next) selectDocument(next.request.id)
    },
    [selectDocument, state.activeDocumentId, state.documents],
  )

  const toggleNavigation = useCallback(
    (view: "collection" | "history") => {
      if (!layout.navigationFixed && state.navigationOpen && state.navigationView === view) {
        dispatch({ type: "close-navigation" })
        return
      }
      dispatch({ type: "toggle-navigation", view })
      dispatch({ type: "select-pane", pane: "navigation" })
    },
    [layout.navigationFixed, state.navigationOpen, state.navigationView],
  )

  const closeOverlay = useCallback(() => {
    dispatch({ type: "close-overlay" })
    if (!activeDocument) return
    setTimeout(() => {
      if (state.activePane === "response") refsFor(activeDocument.request.id).response?.focus()
      else if (state.activePane === "request") urlRef.current?.focus()
    }, 0)
  }, [activeDocument, refsFor, state.activePane])

  const jumpTo = useCallback(
    (target: HttpJumpTarget) => {
      dispatch({ type: "close-overlay" })
      if (!activeDocument) return
      const documentId = activeDocument.request.id
      if (target === "url") {
        dispatch({ type: "select-pane", pane: "request" })
        setTimeout(() => urlRef.current?.focus(), 0)
        return
      }
      if (isRequestJumpTarget(target)) {
        selectRequestView(documentId, target)
        return
      }
      if (target === "response") {
        dispatch({ type: "select-pane", pane: "response" })
        setTimeout(() => refsFor(documentId).response?.focus(), 0)
        return
      }
      dispatch({ type: "select-navigation-view", view: target })
      dispatch({ type: "select-pane", pane: "navigation" })
    },
    [activeDocument, refsFor, selectRequestView],
  )

  useEffect(() => {
    if (!initialUrlRequest || !activeDocument) return
    if (handledInitialRequestId.current === initialUrlRequest.id) return
    handledInitialRequestId.current = initialUrlRequest.id
    dispatch({
      type: "update-request",
      documentId: activeDocument.request.id,
      patch: { method: "GET", url: initialUrlRequest.url },
    })
    dispatch({ type: "select-pane", pane: "request" })
    setTimeout(() => urlRef.current?.focus(), 0)
  }, [activeDocument, initialUrlRequest])

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => urlRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [active])

  useEffect(() => {
    let disposed = false
    let stopWatching: (() => void) | undefined
    void refreshProject()
    void watchHttpProject(HTTP_WORKING_DIRECTORY, () => {
      if (!disposed) void refreshProject()
    }).then((stop) => {
      if (disposed) stop()
      else stopWatching = stop
    })
    return () => {
      disposed = true
      stopWatching?.()
    }
  }, [refreshProject])

  useEffect(() => {
    if (
      !active ||
      !activeDocument ||
      state.activePane !== "response" ||
      activeDocument.execution.status !== "success"
    ) {
      return
    }
    const timer = setTimeout(() => refsFor(activeDocument.request.id).response?.focus(), 0)
    return () => clearTimeout(timer)
  }, [active, activeDocument, refsFor, state.activePane])

  useEffect(
    () => () => {
      for (const controller of abortControllers.current.values()) controller.abort()
      abortControllers.current.clear()
    },
    [],
  )

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
      overlay: state.overlay,
    })
    if (command.kind === "none" || command.kind === "ignore") return
    key.preventDefault()
    key.stopPropagation()

    switch (command.kind) {
      case "blur-url":
        urlRef.current?.blur()
        dispatch({ type: "select-pane", pane: "request" })
        return
      case "blur-editor":
        blurDocumentControls()
        dispatch({ type: "select-pane", pane: "request" })
        return
      case "blur-control":
        renderer.currentFocusedRenderable?.blur()
        dispatch({ type: "select-pane", pane: "request" })
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
        closeDocument(documentId)
        return
      case "save-document":
        void saveDocument(documentId)
        return
      case "cycle-environment":
        cycleEnvironment()
        return
      case "cycle-document":
        cycleDocument(command.direction)
        return
      case "cycle-method":
        cycleMethod(command.direction)
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
        blurDocumentControls()
        dispatch({ type: "open-overlay", overlay: command.overlay })
        return
      case "close-overlay":
        closeOverlay()
        return
      case "jump":
        jumpTo(command.target)
        return
      case "focus-url":
        urlRef.current?.focus()
        return
      case "request-view":
        selectRequestView(documentId, command.view)
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
        onClose={closeDocument}
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
        onCycleMethod={cycleMethod}
        onSend={() => void sendDocument(activeDocument.request.id)}
        onCancel={() => cancelDocument(activeDocument.request.id)}
        environmentName={activeEnvironmentName}
        productionEnvironment={activeEnvironment?.production ?? false}
        onCycleEnvironment={cycleEnvironment}
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
        onSelectDocument={selectDocument}
        onNavigationView={(view) => dispatch({ type: "select-navigation-view", view })}
        onCloseNavigation={() => dispatch({ type: "close-navigation" })}
        onSelectPane={(pane) => dispatch({ type: "select-pane", pane })}
        onSelectRequestView={selectRequestView}
        onSelectResponseView={(documentId, view) => {
          dispatch({ type: "select-pane", pane: "response" })
          dispatch({ type: "select-response-view", documentId, view })
        }}
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
        onSend={(documentId) => void sendDocument(documentId)}
        projectRequests={projectRequests}
        projectErrors={project.errors.length}
        onOpenProjectRequest={openProjectRequest}
      />
      <box style={{ height: LAYOUT.headerSpacing, flexShrink: 0 }} />
      <HttpWorkspaceFooter
        minimum={layout.mode === "minimum"}
        maximized={activeDocument.maximizedPane !== null}
        onResize={(direction) =>
          dispatch({
            type: "set-split-ratio",
            documentId: activeDocument.request.id,
            ratio: resizeHttpSplitRatio(activeDocument.splitRatio, direction),
          })
        }
        onMaximize={() => {
          const pane = state.activePane === "response" ? "response" : "request"
          dispatch({ type: "select-pane", pane })
          dispatch({ type: "toggle-maximize", documentId: activeDocument.request.id, pane })
        }}
        onJump={() => {
          blurDocumentControls()
          dispatch({ type: "open-overlay", overlay: "jump" })
        }}
        onHelp={() => {
          blurDocumentControls()
          dispatch({ type: "open-overlay", overlay: "help" })
        }}
        onSave={() => void saveDocument(activeDocument.request.id)}
        notice={notice}
      />
      {state.overlay ? (
        <HttpWorkspaceOverlay
          overlay={state.overlay}
          document={activeDocument}
          activePane={state.activePane}
          terminalWidth={terminal.width}
          terminalHeight={terminal.height}
          onJump={jumpTo}
          onClose={closeOverlay}
        />
      ) : null}
    </box>
  )
}
