import { useCallback, useEffect, useRef, useState } from "react"
import type { HttpDocumentState, HttpRequestDefinition, HttpVariableContext } from "../model/types"
import { HttpCookieJarStore } from "../services/cookies"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import { downloadCompleteHttpResponse } from "../services/download"
import { prepareHttpRequest } from "../services/request-builder"
import { applyHttpWorkspaceConfig, type HttpWorkspaceConfig } from "../storage/config"
import { saveCapturedHttpResponse } from "../storage/responses"
import { httpResponseOpenCommand, isSafeHttpResponseOpenType } from "../services/open-response"
import { httpInsecureTlsApproval, type HttpInsecureTlsApproval } from "../model/tls-policy"
import type { HttpRedirectAuthorizer } from "../model/redirect-policy"

type HttpClipboard = {
  copyToClipboardOSC52: (content: string) => boolean
  getSelection?: () => { getSelectedText: () => string } | null
}

type HttpDownload = { documentId: string; controller: AbortController }

function downloadFailureNotice(signal: AbortSignal, error: unknown) {
  if (signal.aborted) return "DOWNLOAD CANCELADO"
  return error instanceof Error ? error.message : String(error)
}

function copiedResponseNotice(selected: boolean, label: string) {
  if (selected) return "SELEÇÃO COPIADA"
  if (label === "BODY DA RESPOSTA") return "BODY DA RESPOSTA COPIADO"
  if (label === "HEADERS") return "HEADERS COPIADOS"
  if (label === "VALOR JSONPATH") return "VALOR JSONPATH COPIADO"
  if (label === "LINHA") return "LINHA COPIADA"
  return "CONTEÚDO COPIADO"
}

export function useHttpResponse({
  documents,
  activeRequest,
  environmentName,
  clipboard,
  setNotice,
  workspaceConfig,
  variablesForRequest,
  isInsecureTlsApproved,
  authorizeRedirect,
}: {
  documents: HttpDocumentState[]
  activeRequest: HttpRequestDefinition | undefined
  environmentName: string | null
  clipboard: HttpClipboard
  setNotice: (notice: string) => void
  workspaceConfig: HttpWorkspaceConfig
  variablesForRequest: (request: HttpRequestDefinition) => HttpVariableContext
  isInsecureTlsApproved: (approval: HttpInsecureTlsApproval) => boolean
  authorizeRedirect: HttpRedirectAuthorizer
}) {
  const cookieJars = useRef(new HttpCookieJarStore())
  const [, setCookieRevision] = useState(0)
  const [download, setDownload] = useState<HttpDownload | null>(null)
  const downloadOwner = useRef({ mounted: true, documents, operation: null as HttpDownload | null })
  downloadOwner.current.documents = documents
  useEffect(() => {
    const owner = downloadOwner.current
    owner.mounted = true
    return () => {
      owner.mounted = false
      owner.operation?.controller.abort()
      owner.operation = null
    }
  }, [])
  useEffect(() => {
    const operation = downloadOwner.current.operation
    if (operation && !documents.some((document) => document.request.id === operation.documentId)) {
      operation.controller.abort()
    }
  }, [documents])
  const cookieJarForRequest = useCallback(
    (request: HttpRequestDefinition) => cookieJars.current.forRequest(request, environmentName),
    [environmentName],
  )
  const cookieJar = activeRequest
    ? cookieJarForRequest(activeRequest)
    : cookieJars.current.forRequest(
        {
          id: "__scratch_cookie_scope__",
          source: { kind: "scratch" },
        } as HttpRequestDefinition,
        environmentName,
      )
  const cookies = cookieJar.list()

  const responseCompleted = useCallback(() => {
    setCookieRevision((current) => current + 1)
  }, [])

  const copyResponse = useCallback(
    (documentId: string, displayedContent: string, label = "CONTEÚDO") => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (document?.execution.status !== "success") return
      const selected = clipboard.getSelection?.()?.getSelectedText() ?? ""
      const bodyView = document.responseView === "pretty" || document.responseView === "raw"
      if (!selected && bodyView && document.execution.response.bodyKind === "binary") {
        setNotice("RESPOSTA BINÁRIA NÃO FOI COPIADA · USE SALVAR")
        return
      }
      const copied = clipboard.copyToClipboardOSC52(selected || displayedContent)
      setNotice(
        copied
          ? copiedResponseNotice(Boolean(selected), label)
          : "O terminal não aceitou a cópia OSC52.",
      )
    },
    [clipboard, documents, setNotice],
  )

  const saveResponse = useCallback(
    async (documentId: string) => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (document?.execution.status !== "success") return
      try {
        const path = await saveCapturedHttpResponse(
          HTTP_WORKING_DIRECTORY,
          document.request.name,
          document.execution.response,
        )
        setNotice(`RESPOSTA SALVA · ${path}`)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [documents, setNotice],
  )

  const downloadComplete = useCallback(
    async (documentId: string) => {
      const owner = downloadOwner.current
      if (!owner.mounted || owner.operation) return
      const document = owner.documents.find((candidate) => candidate.request.id === documentId)
      if (document?.execution.status !== "success" || !document.execution.response.truncated) return
      const controller = new AbortController()
      const operation = { documentId, controller }
      owner.operation = operation
      setDownload(operation)
      setNotice("BAIXANDO RESPOSTA COMPLETA…")
      try {
        const configured = applyHttpWorkspaceConfig(document.request, workspaceConfig)
        const prepared = prepareHttpRequest(
          configured,
          `http-download-${Date.now()}`,
          document.revision,
          variablesForRequest(document.request),
          HTTP_WORKING_DIRECTORY,
        )
        const result = await downloadCompleteHttpResponse({
          root: HTTP_WORKING_DIRECTORY,
          requestName: document.request.name,
          request: prepared,
          signal: controller.signal,
          cookieJar: cookieJarForRequest(document.request),
          authorizeInsecureTls: (url) =>
            isInsecureTlsApproved(httpInsecureTlsApproval(url, environmentName)),
          authorizeRedirect: (approval, signal) =>
            authorizeRedirect(Object.freeze({ ...approval, environmentName }), signal),
        })
        if (owner.operation !== operation) return
        controller.signal.throwIfAborted()
        setNotice(`DOWNLOAD COMPLETO · ${result.bytes} BYTES · ${result.path}`)
      } catch (error) {
        if (owner.operation !== operation) return
        setNotice(downloadFailureNotice(controller.signal, error))
      } finally {
        if (owner.operation === operation) {
          owner.operation = null
          setDownload(null)
        }
      }
    },
    [
      cookieJarForRequest,
      authorizeRedirect,
      environmentName,
      isInsecureTlsApproved,
      setNotice,
      variablesForRequest,
      workspaceConfig,
    ],
  )

  const cancelDownload = useCallback(() => downloadOwner.current.operation?.controller.abort(), [])

  const openResponse = useCallback(
    async (documentId: string) => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (document?.execution.status !== "success") return
      const response = document.execution.response
      if (
        response.bodyKind !== "binary" ||
        !isSafeHttpResponseOpenType(response.contentType, response.body)
      ) {
        setNotice("ESTE TIPO DE RESPOSTA NÃO É ABERTO EXTERNAMENTE")
        return
      }
      try {
        const path = await saveCapturedHttpResponse(
          HTTP_WORKING_DIRECTORY,
          document.request.name,
          response,
        )
        const process = Bun.spawn(httpResponseOpenCommand(path), {
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        })
        process.unref()
        setNotice(`RESPOSTA ABERTA · ${path}`)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [documents, setNotice],
  )

  return {
    cookieJar,
    cookieJarForRequest,
    cookies,
    responseCompleted,
    copyResponse,
    saveResponse,
    openResponse,
    downloadComplete,
    cancelDownload,
    downloadingDocumentId: download?.documentId ?? null,
  }
}
