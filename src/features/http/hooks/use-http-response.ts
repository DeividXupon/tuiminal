import { useCallback, useRef, useState } from "react"
import type { HttpDocumentState, HttpRequestDefinition, HttpVariableContext } from "../model/types"
import { HttpCookieJar } from "../services/cookies"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import { downloadCompleteHttpResponse } from "../services/download"
import { prepareHttpRequest } from "../services/request-builder"
import { applyHttpWorkspaceConfig, type HttpWorkspaceConfig } from "../storage/config"
import { saveCapturedHttpResponse } from "../storage/responses"
import { httpResponseOpenCommand, isSafeHttpResponseOpenType } from "../services/open-response"
import { httpInsecureTlsApproval, type HttpInsecureTlsApproval } from "../model/tls-policy"

type HttpClipboard = {
  copyToClipboardOSC52: (content: string) => boolean
  getSelection?: () => { getSelectedText: () => string } | null
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
  environmentName,
  clipboard,
  setNotice,
  workspaceConfig,
  variablesForRequest,
  isInsecureTlsApproved,
}: {
  documents: HttpDocumentState[]
  environmentName: string | null
  clipboard: HttpClipboard
  setNotice: (notice: string) => void
  workspaceConfig: HttpWorkspaceConfig
  variablesForRequest: (request: HttpRequestDefinition) => HttpVariableContext
  isInsecureTlsApproved: (approval: HttpInsecureTlsApproval) => boolean
}) {
  const cookieJars = useRef(new Map<string, HttpCookieJar>())
  const [, setCookieRevision] = useState(0)
  const [download, setDownload] = useState<{
    documentId: string
    controller: AbortController
  } | null>(null)
  const environmentKey = environmentName ?? "__no_environment__"
  let cookieJar = cookieJars.current.get(environmentKey)
  if (!cookieJar) {
    cookieJar = new HttpCookieJar()
    cookieJars.current.set(environmentKey, cookieJar)
  }
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
      if (download) return
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (document?.execution.status !== "success" || !document.execution.response.truncated) return
      const controller = new AbortController()
      setDownload({ documentId, controller })
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
          cookieJar,
          authorizeInsecureTls: (url) =>
            isInsecureTlsApproved(httpInsecureTlsApproval(url, environmentName)),
        })
        setNotice(`DOWNLOAD COMPLETO · ${result.bytes} BYTES · ${result.path}`)
      } catch (error) {
        setNotice(
          controller.signal.aborted
            ? "DOWNLOAD CANCELADO"
            : error instanceof Error
              ? error.message
              : String(error),
        )
      } finally {
        setDownload((current) => (current?.controller === controller ? null : current))
      }
    },
    [
      cookieJar,
      documents,
      download,
      environmentName,
      isInsecureTlsApproved,
      setNotice,
      variablesForRequest,
      workspaceConfig,
    ],
  )

  const cancelDownload = useCallback(() => download?.controller.abort(), [download])

  const openResponse = useCallback(
    async (documentId: string) => {
      const document = documents.find((candidate) => candidate.request.id === documentId)
      if (document?.execution.status !== "success") return
      const response = document.execution.response
      if (response.bodyKind !== "binary" || !isSafeHttpResponseOpenType(response.contentType)) {
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
