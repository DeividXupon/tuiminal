import { useCallback } from "react"
import { createHttpAssertionDraft, createHttpExtractionDraft } from "../model/automation"
import type {
  HttpAssertionDefinition,
  HttpChainExtraction,
  HttpDocumentState,
  HttpRequestMoreView,
  HttpRequestView,
} from "../model/types"
import { nextHttpMethod, type HttpWorkspaceAction } from "../model/workspace"
import type { HttpDocumentRefs } from "../runtime"
import { cycleHttpRequestRedirects, cycleHttpRequestTimeout } from "../model/request-options"

export function useHttpRequestEditing({
  documents,
  activeDocument,
  refsFor,
  dispatch,
}: {
  documents: HttpDocumentState[]
  activeDocument: HttpDocumentState | undefined
  refsFor: (documentId: string) => HttpDocumentRefs
  dispatch: (action: HttpWorkspaceAction) => void
}) {
  const cycleMethod = useCallback(
    (direction: number) => {
      if (!activeDocument) return
      dispatch({
        type: "update-request",
        documentId: activeDocument.request.id,
        patch: { method: nextHttpMethod(activeDocument.request.method, direction < 0 ? -1 : 1) },
      })
    },
    [activeDocument, dispatch],
  )

  const changeMethod = useCallback(
    (documentId: string, method: string) => {
      dispatch({ type: "update-request", documentId, patch: { method } })
    },
    [dispatch],
  )

  const changeName = useCallback(
    (documentId: string, name: string) => {
      dispatch({ type: "update-request", documentId, patch: { name } })
    },
    [dispatch],
  )

  const changeAssertions = useCallback(
    (documentId: string, assertions: HttpAssertionDefinition[]) => {
      dispatch({ type: "update-request", documentId, patch: { assertions } })
    },
    [dispatch],
  )

  const changeChain = useCallback(
    (documentId: string, chain: { dependsOn?: string; extract: HttpChainExtraction[] }) => {
      dispatch({ type: "update-request", documentId, patch: { chain } })
    },
    [dispatch],
  )

  const changeOptions = useCallback(
    (documentId: string, options: HttpDocumentState["request"]["options"]) => {
      dispatch({ type: "update-request", documentId, patch: { options } })
    },
    [dispatch],
  )

  const patchActiveOptions = useCallback(
    (patch: Partial<HttpDocumentState["request"]["options"]>) => {
      if (!activeDocument) return
      changeOptions(activeDocument.request.id, { ...activeDocument.request.options, ...patch })
    },
    [activeDocument, changeOptions],
  )

  const cycleTimeout = useCallback(() => {
    if (!activeDocument) return
    changeOptions(
      activeDocument.request.id,
      cycleHttpRequestTimeout(activeDocument.request.options),
    )
  }, [activeDocument, changeOptions])

  const toggleRedirects = useCallback(() => {
    if (!activeDocument) return
    changeOptions(
      activeDocument.request.id,
      cycleHttpRequestRedirects(activeDocument.request.options),
    )
  }, [activeDocument, changeOptions])

  const toggleNoLog = useCallback(() => {
    if (!activeDocument) return
    patchActiveOptions({ noLog: !activeDocument.request.options.noLog })
  }, [activeDocument, patchActiveOptions])

  const toggleCookieJar = useCallback(() => {
    if (!activeDocument) return
    patchActiveOptions({ cookieJar: activeDocument.request.options.cookieJar === false })
  }, [activeDocument, patchActiveOptions])

  const toggleTlsVerification = useCallback(() => {
    if (!activeDocument) return
    patchActiveOptions({
      tlsVerification:
        activeDocument.request.options.tlsVerification === "insecure" ? "strict" : "insecure",
    })
  }, [activeDocument, patchActiveOptions])

  const applyOptionCommand = useCallback(
    (command: string) => {
      if (command === "cycle-request-timeout") cycleTimeout()
      else if (command === "toggle-request-redirects") toggleRedirects()
      else if (command === "toggle-request-cookie-jar") toggleCookieJar()
      else if (command === "toggle-request-tls-verification") toggleTlsVerification()
      else if (command === "toggle-request-no-log") toggleNoLog()
      else return false
      return true
    },
    [cycleTimeout, toggleCookieJar, toggleNoLog, toggleRedirects, toggleTlsVerification],
  )

  const selectRequestView = useCallback(
    (documentId: string, view: HttpRequestView, focusControl = true) => {
      dispatch({ type: "select-pane", pane: "request" })
      dispatch({ type: "select-request-view", documentId, view })
      const request = documents.find((document) => document.request.id === documentId)?.request
      if (
        focusControl &&
        view === "body" &&
        request &&
        ["json", "text", "xml"].includes(request.body.kind)
      ) {
        setTimeout(() => refsFor(documentId).body?.focus(), 0)
      }
    },
    [dispatch, documents, refsFor],
  )

  const selectRequestMoreView = useCallback(
    (documentId: string, view: HttpRequestMoreView) => {
      dispatch({ type: "select-request-more-view", documentId, view })
    },
    [dispatch],
  )

  const addAutomationRow = useCallback(() => {
    if (!activeDocument) return
    const documentId = activeDocument.request.id
    if (activeDocument.requestMoreView === "assertions") {
      dispatch({
        type: "update-request",
        documentId,
        patch: {
          assertions: [
            ...(activeDocument.request.assertions ?? []),
            createHttpAssertionDraft(documentId),
          ],
        },
      })
    } else if (activeDocument.requestMoreView === "chaining") {
      dispatch({
        type: "update-request",
        documentId,
        patch: {
          chain: {
            ...(activeDocument.request.chain ?? { extract: [] }),
            extract: [
              ...(activeDocument.request.chain?.extract ?? []),
              createHttpExtractionDraft(documentId),
            ],
          },
        },
      })
    }
  }, [activeDocument, dispatch])

  return {
    cycleMethod,
    changeMethod,
    changeName,
    changeAssertions,
    changeChain,
    changeOptions,
    cycleTimeout,
    toggleRedirects,
    toggleCookieJar,
    toggleTlsVerification,
    toggleNoLog,
    applyOptionCommand,
    selectRequestView,
    selectRequestMoreView,
    addAutomationRow,
  }
}
