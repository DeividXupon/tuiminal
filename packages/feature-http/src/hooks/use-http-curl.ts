import { useCallback, useMemo, useState } from "react"
import type { HttpDocumentState, HttpRequestDefinition, HttpVariableContext } from "../model/types"
import { HTTP_DOCUMENT_LIMIT } from "../model/workspace"
import { exportPreparedRequestAsCurl } from "../exporting/curl"
import { importCurl } from "../importing/curl"
import { prepareHttpRequest } from "../services/request-builder"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import { applyHttpWorkspaceConfig, type HttpWorkspaceConfig } from "../storage/config"
import { httpRequestSecretValues } from "../model/secrets"

type HttpClipboard = { copyToClipboardOSC52: (content: string) => boolean }

export function useHttpCurl({
  activeDocument,
  documentCount,
  workspaceConfig,
  variablesForRequest,
  clipboard,
  setNotice,
  onImported,
}: {
  activeDocument: HttpDocumentState | undefined
  documentCount: number
  workspaceConfig: HttpWorkspaceConfig
  variablesForRequest: (request: HttpRequestDefinition) => HttpVariableContext
  clipboard: HttpClipboard
  setNotice: (notice: string) => void
  onImported: (request: HttpRequestDefinition) => void
}) {
  const [command, setCommand] = useState("")
  const exported = useMemo(() => {
    if (!activeDocument) return ""
    try {
      const request = applyHttpWorkspaceConfig(activeDocument.request, workspaceConfig)
      const variables = variablesForRequest(activeDocument.request)
      const prepared = prepareHttpRequest(
        request,
        "curl-preview",
        activeDocument.revision,
        variables,
        HTTP_WORKING_DIRECTORY,
      )
      return exportPreparedRequestAsCurl(prepared, {
        secretValues: httpRequestSecretValues(request, variables),
      })
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, [activeDocument, variablesForRequest, workspaceConfig])

  const applyImport = useCallback(() => {
    if (documentCount >= HTTP_DOCUMENT_LIMIT) {
      setNotice(`LIMITE DE ${HTTP_DOCUMENT_LIMIT} REQUESTS ABERTOS`)
      return
    }
    try {
      const request = importCurl(command, `http-curl-${Date.now()}`)
      onImported(request)
      setCommand("")
      setNotice("cURL IMPORTADO EM UMA NOVA TAB")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }, [command, documentCount, onImported, setNotice])

  const copyExport = useCallback(() => {
    const copied = clipboard.copyToClipboardOSC52(exported)
    setNotice(copied ? "cURL REDIGIDO COPIADO" : "O terminal não aceitou a cópia OSC52.")
  }, [clipboard, exported, setNotice])

  return { command, setCommand, exported, applyImport, copyExport }
}
