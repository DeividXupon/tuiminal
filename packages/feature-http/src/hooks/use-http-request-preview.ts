import { useMemo } from "react"
import type { HttpDocumentState, HttpRequestDefinition, HttpVariableContext } from "../model/types"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import { createHttpPreparedRequestPreview } from "../services/request-preview"
import { applyHttpWorkspaceConfig, type HttpWorkspaceConfig } from "../storage/config"

export function useHttpPreview(
  document: HttpDocumentState | undefined,
  config: HttpWorkspaceConfig,
  variablesForRequest: (request: HttpRequestDefinition) => HttpVariableContext,
) {
  return useMemo(() => {
    if (!document) return null
    return createHttpPreparedRequestPreview({
      sourceRequest: document.request,
      effectiveRequest: applyHttpWorkspaceConfig(document.request, config),
      revision: document.revision,
      variables: variablesForRequest(document.request),
      projectRoot: HTTP_WORKING_DIRECTORY,
    })
  }, [config, document, variablesForRequest])
}
