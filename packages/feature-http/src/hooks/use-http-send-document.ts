import { useCallback } from "react"
import {
  HTTP_ENVIRONMENT_PREPARATION_ERROR,
  httpHistoryErrorPrivacy,
} from "../model/history-privacy"
import type { HttpRedirectAuthorizer } from "../model/redirect-policy"
import { isOpaqueHttpRequest } from "../model/request-capabilities"
import { combineHttpPrivacy, requestHttpPrivacy } from "../model/secrets"
import type { HttpInsecureTlsApproval } from "../model/tls-policy"
import type {
  HttpDocumentState,
  HttpHistoryEntry,
  HttpPrivacyContext,
  HttpProjectRequestItem,
  HttpRequestDefinition,
  HttpResponseSnapshot,
  HttpVariableContext,
} from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import { type HttpDocumentRefs, newHttpExecutionId } from "../runtime"
import { type HttpRunCase, runHttpCollectionCase } from "../services/collection-runner"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import type { HttpCookieJarResolver } from "../services/cookies"
import { applyHttpWorkspaceConfig, type HttpWorkspaceConfig } from "../storage/config"

type HistoryTools = {
  success: (
    document: HttpDocumentState,
    response: HttpResponseSnapshot,
    environmentName: string | null,
  ) => HttpHistoryEntry
  failure: (
    document: HttpDocumentState,
    executionId: string,
    error: string,
    environmentName: string | null,
    privacy?: HttpPrivacyContext,
  ) => HttpHistoryEntry
}

type SendContext = {
  getDocuments: () => HttpDocumentState[]
  projectRequests: HttpProjectRequestItem[]
  workspaceConfig: HttpWorkspaceConfig
  activeEnvironmentName: string | null
  variablesForRequest: (request: HttpRequestDefinition) => HttpVariableContext
  historyTools: HistoryTools
  cookieJarForRequest: HttpCookieJarResolver
  responseCompleted: () => void
  isInsecureTlsApproved: (approval: HttpInsecureTlsApproval) => boolean
  refsFor: (documentId: string) => HttpDocumentRefs
  blurDocumentControls: () => void
  abortControllers: { current: Map<string, AbortController> }
  dispatch: (action: HttpWorkspaceAction) => void
  setNotice: (notice: string) => void
  authorizeRedirect: HttpRedirectAuthorizer
}

type ExecutionDetails = {
  documentId: string
  executionId: string
  requestRevision: number
}

function startExecution(context: SendContext, document: HttpDocumentState) {
  const details = {
    documentId: document.request.id,
    executionId: newHttpExecutionId(),
    requestRevision: document.revision,
  }
  const controller = new AbortController()
  context.abortControllers.current.set(details.executionId, controller)
  context.dispatch({ type: "start-execution", ...details })
  context.refsFor(details.documentId).response?.scrollTo(0)
  return { details, controller }
}

function configuredItems(context: SendContext, document: HttpDocumentState) {
  const activeItem = {
    filePath: document.request.source.kind === "file" ? document.request.source.path : "",
    request: document.request,
  }
  return [
    ...context.projectRequests.filter((item) => item.request.id !== document.request.id),
    activeItem,
  ].map((item) => ({
    ...item,
    request: applyHttpWorkspaceConfig(item.request, context.workspaceConfig),
  }))
}

function executionHistory(
  context: SendContext,
  document: HttpDocumentState,
  executionId: string,
  message: string,
  privacy?: HttpPrivacyContext,
) {
  return document.request.options.noLog
    ? null
    : context.historyTools.failure(
        document,
        executionId,
        message,
        context.activeEnvironmentName,
        privacy,
      )
}

function handleChainResult(
  context: SendContext,
  document: HttpDocumentState,
  details: ExecutionDetails,
  controller: AbortController,
  chain: HttpRunCase,
) {
  if (controller.signal.aborted) {
    context.dispatch({ type: "cancel-execution", ...details })
    return
  }
  const result = chain.items.find((item) => item.requestId === document.request.id)
  const privacy = combineHttpPrivacy(...chain.items.map((item) => item.privacy))
  const failed = result?.error ?? chain.items.findLast((item) => item.error)?.error
  if (!result?.response || failed) {
    const message = failed?.message ?? "O request não foi executado após suas dependências."
    context.dispatch({
      type: "fail-execution",
      ...details,
      kind: failed?.kind ?? "parse",
      message,
      historyEntry: executionHistory(context, document, details.executionId, message, privacy),
    })
    return
  }
  const response = {
    ...result.response,
    privacy,
    executionId: details.executionId,
    requestId: details.documentId,
    requestRevision: details.requestRevision,
  }
  if (chain.items.length > 1) context.setNotice(`CHAIN EXECUTADO · ${chain.items.length} REQUESTS`)
  context.responseCompleted()
  context.dispatch({
    type: "finish-execution",
    documentId: details.documentId,
    response,
    historyEntry: document.request.options.noLog
      ? null
      : context.historyTools.success(document, response, context.activeEnvironmentName),
  })
}

function handleUnexpectedError(
  context: SendContext,
  document: HttpDocumentState,
  details: ExecutionDetails,
  controller: AbortController,
  error: unknown,
) {
  if (controller.signal.aborted) {
    context.dispatch({ type: "cancel-execution", ...details })
    return
  }
  let privacy = requestHttpPrivacy(document.request)
  let message = HTTP_ENVIRONMENT_PREPARATION_ERROR
  try {
    privacy = requestHttpPrivacy(document.request, context.variablesForRequest(document.request))
    message = httpHistoryErrorPrivacy(
      privacy,
      error instanceof Error ? error.message : String(error),
    )
  } catch {
    // The resolver may fail before providing its secrets; never print its raw error.
  }
  context.dispatch({
    type: "fail-execution",
    ...details,
    kind: "parse",
    message,
    historyEntry: executionHistory(context, document, details.executionId, message, privacy),
  })
}

async function sendHttpDocument(context: SendContext, documentId: string) {
  const document = context.getDocuments().find((candidate) => candidate.request.id === documentId)
  if (!document || document.execution.status === "running") return
  if (isOpaqueHttpRequest(document.request)) {
    context.setNotice(
      "Este request usa recursos .http que o Tuiminal ainda não executa com segurança.",
    )
    return
  }
  const { details, controller } = startExecution(context, document)
  try {
    const chain = await runHttpCollectionCase({
      name: document.request.name,
      items: configuredItems(context, document),
      selector: document.request.id,
      variables: new Map(),
      variablesForRequest: context.variablesForRequest,
      root: HTTP_WORKING_DIRECTORY,
      signal: controller.signal,
      cookieJarForRequest: context.cookieJarForRequest,
      environmentName: context.activeEnvironmentName,
      isInsecureTlsApproved: context.isInsecureTlsApproved,
      authorizeRedirect: context.authorizeRedirect,
    })
    handleChainResult(context, document, details, controller, chain)
  } catch (error) {
    handleUnexpectedError(context, document, details, controller, error)
  } finally {
    context.abortControllers.current.delete(details.executionId)
  }
}

export function useHttpSendDocument(context: SendContext) {
  return useCallback((documentId: string) => sendHttpDocument(context, documentId), [context])
}
