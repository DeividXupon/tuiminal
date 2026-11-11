import { httpScriptRequest, applyHttpScriptRequest } from "./script-request"
import type {
  HttpAssertionResult,
  HttpRequestDefinition,
  HttpResponseSnapshot,
  HttpVariableContext,
} from "../model/types"
import {
  applyHttpScriptScopes,
  httpScriptScopes,
  httpScriptLocals,
  scriptScope,
} from "./script-scopes"
import { requestHttpPrivacy } from "../model/secrets"
import { HttpScriptError, executePostmanScript } from "./script-sandbox"

export class HttpScriptExecutionError extends Error {
  constructor(
    message: string,
    readonly variables: HttpVariableContext,
  ) {
    super(message)
  }
}

export async function runHttpScript(
  source: string | undefined,
  request: HttpRequestDefinition,
  variables: HttpVariableContext,
  response?: HttpResponseSnapshot,
  signal?: AbortSignal,
) {
  if (!source?.trim()) return { request, variables, assertions: [] as HttpAssertionResult[] }
  const scopes = httpScriptScopes(variables)
  const local = httpScriptLocals(variables, scopes)
  const sdkRequest = httpScriptRequest(request)
  const { result, assertions } = await executePostmanScript(
    source,
    {
      request: sdkRequest.toJSON(),
      environment: scriptScope(scopes.environment),
      globals: scriptScope(scopes.globals),
      collectionVariables: scriptScope(scopes.collectionVariables),
      _variables: scriptScope(local),
      ...(response
        ? {
            response: {
              code: response.status,
              status: response.statusText,
              header: response.headers.map(([key, value]) => ({ key, value })),
              body: new TextDecoder().decode(response.body),
              responseTime: response.timings.totalMs,
            },
          }
        : {}),
    },
    response ? "test" : "prerequest",
    signal,
  ).catch((error: unknown) => {
    if (error instanceof HttpScriptError && error.result) {
      const changed = applyHttpScriptScopes(variables, error.result)
      throw new HttpScriptExecutionError(
        requestHttpPrivacy(request, changed).redactText(error.message),
        changed,
      )
    }
    throw error
  })
  const nextRequest = applyHttpScriptRequest(request, sdkRequest, result.request)
  return {
    request: nextRequest,
    variables: applyHttpScriptScopes(variables, result),
    assertions,
  }
}

export async function runHttpScriptPhase(
  phase: "preRequest" | "postResponse",
  request: HttpRequestDefinition,
  variables: HttpVariableContext,
  response?: HttpResponseSnapshot,
  signal?: AbortSignal,
) {
  let result = { request, variables, assertions: [] as HttpAssertionResult[] }
  for (const scripts of [...(request.inheritedScripts ?? []), request.scripts]) {
    const next = await runHttpScript(
      scripts?.[phase],
      result.request,
      result.variables,
      response,
      signal,
    )
    result = { ...next, assertions: [...result.assertions, ...next.assertions] }
  }
  return result
}

export async function runHttpPostScript(
  request: HttpRequestDefinition,
  variables: HttpVariableContext,
  response: HttpResponseSnapshot,
  signal?: AbortSignal,
) {
  try {
    return await runHttpScriptPhase("postResponse", request, variables, response, signal)
  } catch (error) {
    return {
      request,
      variables: error instanceof HttpScriptExecutionError ? error.variables : variables,
      assertions: [
        {
          id: "post-response-error",
          expression: "Post-response",
          passed: false,
          actual: "",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }
}
