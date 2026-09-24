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
  const request = document?.request
  const revision = document?.revision
  return useMemo(() => {
    if (!request || revision === undefined) return null
    return createHttpPreparedRequestPreview({
      sourceRequest: request,
      effectiveRequest: applyHttpWorkspaceConfig(request, config),
      revision,
      variables: variablesForRequest(request),
      projectRoot: HTTP_WORKING_DIRECTORY,
    })
  }, [config, request, revision, variablesForRequest])
}
