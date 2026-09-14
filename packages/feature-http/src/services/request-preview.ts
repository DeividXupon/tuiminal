import { httpHeaderSensitivity } from "../model/key-value"
import { sanitizeTerminalText } from "../model/response"
import {
  httpRequestSecretValues,
  redactHttpUrlSecrets,
  redactKnownHttpSecrets,
} from "../model/secrets"
import type {
  HttpKeyValue,
  HttpPreparedRequest,
  HttpRequestDefinition,
  HttpVariableContext,
  HttpVariableOrigin,
} from "../model/types"
import { resolveHttpTemplate } from "../model/variables"
import { prepareHttpRequest } from "./request-builder"

export type HttpPreparedHeaderOrigin = "request" | "collection" | "workspace" | "auth" | "automatic"

export type HttpPreparedRequestPreview =
  | {
      ok: true
      method: string
      url: string
      headers: Array<{
        id: string
        name: string
        value: string
        origin: HttpPreparedHeaderOrigin
        masked: boolean
      }>
      variables: Array<{
        name: string
        value: string
        origin: HttpVariableOrigin
        masked: boolean
      }>
      body: { kind: string; content: string; truncated: boolean }
      timeoutMs: number
      followRedirects: boolean
      useCookieJar: boolean
      proxy: string | null
      tlsVerification: "strict" | "insecure"
      noLog: boolean
    }
  | { ok: false; error: string }

const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([A-Za-z_$][\w$.-]*)\s*\}\}/g
const BODY_PREVIEW_LIMIT = 4_096

function containsKnownSecret(value: string, secretValues: readonly string[]) {
  return secretValues.some((secret) => secret && value.includes(secret))
}

function redactedValue(value: string, secretValues: readonly string[], force = false) {
  if (force || containsKnownSecret(value, secretValues)) return "<redacted>"
  return sanitizeTerminalText(redactKnownHttpSecrets(value, secretValues))
}

function enabledHeaders(request: HttpRequestDefinition, variables: HttpVariableContext) {
  return request.headers
    .filter((entry) => entry.enabled && entry.name.trim())
    .map((entry) => ({
      entry,
      name: entry.name.trim(),
      value: resolveHttpTemplate(entry.value, variables),
      used: false,
    }))
}

function authHeaderName(request: HttpRequestDefinition) {
  if (request.auth.kind === "bearer" || request.auth.kind === "basic") return "authorization"
  if (request.auth.kind === "api-key" && request.auth.placement === "header") {
    return request.auth.name.toLowerCase()
  }
  return null
}

function candidateForPreparedHeader(
  candidates: Array<{ entry: HttpKeyValue; name: string; value: string; used: boolean }>,
  name: string,
  value: string,
) {
  const exact = candidates.find(
    (candidate) =>
      !candidate.used &&
      candidate.name.toLowerCase() === name.toLowerCase() &&
      candidate.value === value,
  )
  const candidate =
    exact ?? candidates.find((item) => !item.used && item.name.toLowerCase() === name.toLowerCase())
  if (candidate) candidate.used = true
  return candidate
}

function previewHeaders(
  request: HttpRequestDefinition,
  prepared: HttpPreparedRequest,
  variables: HttpVariableContext,
  secretValues: readonly string[],
) {
  const candidates = enabledHeaders(request, variables)
  const authName = authHeaderName(request)
  let authAssigned = false
  return prepared.headers.map(([name, value], index) => {
    if (!authAssigned && authName === name.toLowerCase()) {
      authAssigned = true
      candidateForPreparedHeader(candidates, name, value)
      return {
        id: `${request.id}-prepared-${index}`,
        name,
        value: "<redacted>",
        origin: "auth" as const,
        masked: true,
      }
    }
    const candidate = candidateForPreparedHeader(candidates, name, value)
    const origin: HttpPreparedHeaderOrigin =
      candidate?.entry.origin ?? (candidate ? "request" : "automatic")
    const masked =
      httpHeaderSensitivity(name) !== "normal" ||
      (candidate ? candidate.entry.sensitivity !== "normal" : false) ||
      containsKnownSecret(value, secretValues)
    return {
      id: candidate?.entry.id ?? `${request.id}-prepared-${index}`,
      name: sanitizeTerminalText(name),
      value: redactedValue(value, secretValues, masked),
      origin,
      masked,
    }
  })
}

function requestTemplateSources(request: HttpRequestDefinition) {
  const auth =
    request.auth.kind === "bearer"
      ? [request.auth.token]
      : request.auth.kind === "basic"
        ? [request.auth.username, request.auth.password]
        : request.auth.kind === "api-key"
          ? [request.auth.name, request.auth.value]
          : []
  return [
    request.url,
    request.body.text,
    request.body.filePath ?? "",
    ...request.query.flatMap((entry) => [entry.name, entry.value]),
    ...request.path.flatMap((entry) => [entry.name, entry.value]),
    ...request.headers.flatMap((entry) => [entry.name, entry.value]),
    ...request.body.form.flatMap((entry) => [entry.name, entry.value]),
    ...(request.body.multipart ?? []).flatMap((entry) => [entry.name, entry.value]),
    request.options.proxy ?? "",
    ...auth,
  ]
}

function referencedVariables(request: HttpRequestDefinition) {
  const names = new Set<string>()
  for (const source of requestTemplateSources(request)) {
    for (const match of source.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
      const name = match[1]
      if (name) names.add(name)
    }
  }
  return [...names].sort()
}

function previewVariables(
  request: HttpRequestDefinition,
  variables: HttpVariableContext,
  secretValues: readonly string[],
) {
  return referencedVariables(request).flatMap((name) => {
    const definition = variables.get(name)
    if (!definition) return []
    const value = resolveHttpTemplate(`{{${name}}}`, variables)
    const masked = definition.secret || containsKnownSecret(value, secretValues)
    return [
      {
        name,
        value: redactedValue(value, secretValues, masked),
        origin: definition.origin,
        masked,
      },
    ]
  })
}

function truncateBody(content: string) {
  const sanitized = sanitizeTerminalText(content)
  return sanitized.length <= BODY_PREVIEW_LIMIT
    ? { content: sanitized, truncated: false }
    : { content: `${sanitized.slice(0, BODY_PREVIEW_LIMIT)}…`, truncated: true }
}

function multipartPreview(
  descriptor: Extract<NonNullable<HttpPreparedRequest["bodyDescriptor"]>, { kind: "multipart" }>,
  secretValues: readonly string[],
) {
  return descriptor.parts
    .map((part) => {
      const sensitive =
        part.sensitivity !== "normal" || httpHeaderSensitivity(part.name) !== "normal"
      return `${part.name}=${redactedValue(part.value, secretValues, sensitive)}`
    })
    .join("\n")
}

function previewBody(
  request: HttpRequestDefinition,
  prepared: HttpPreparedRequest,
  secretValues: readonly string[],
) {
  if (prepared.bodyDescriptor?.kind === "file") {
    return {
      kind: "file",
      ...truncateBody(redactedValue(request.body.filePath ?? "", secretValues)),
    }
  }
  if (prepared.bodyDescriptor?.kind === "multipart") {
    return {
      kind: "multipart",
      ...truncateBody(multipartPreview(prepared.bodyDescriptor, secretValues)),
    }
  }
  if (typeof prepared.body === "string") {
    return {
      kind: request.body.kind,
      ...truncateBody(redactKnownHttpSecrets(prepared.body, secretValues)),
    }
  }
  return { kind: "none", content: "", truncated: false }
}

export function createHttpPreparedRequestPreview({
  sourceRequest,
  effectiveRequest,
  revision,
  variables,
  projectRoot,
}: {
  sourceRequest: HttpRequestDefinition
  effectiveRequest: HttpRequestDefinition
  revision: number
  variables: HttpVariableContext
  projectRoot?: string
}): HttpPreparedRequestPreview {
  const secretValues = httpRequestSecretValues(effectiveRequest, variables)
  try {
    const prepared = prepareHttpRequest(
      effectiveRequest,
      "request-preview",
      revision,
      variables,
      projectRoot,
    )
    return {
      ok: true,
      method: prepared.method,
      url: sanitizeTerminalText(redactHttpUrlSecrets(prepared.url, secretValues)),
      headers: previewHeaders(effectiveRequest, prepared, variables, secretValues),
      variables: previewVariables(sourceRequest, variables, secretValues),
      body: previewBody(effectiveRequest, prepared, secretValues),
      timeoutMs: prepared.timeoutMs,
      followRedirects: prepared.followRedirects,
      useCookieJar: prepared.useCookieJar !== false,
      proxy: prepared.proxyUrl
        ? sanitizeTerminalText(redactHttpUrlSecrets(prepared.proxyUrl, secretValues))
        : null,
      tlsVerification: prepared.tlsVerification ?? "strict",
      noLog: sourceRequest.options.noLog === true,
    }
  } catch (error) {
    return {
      ok: false,
      error: sanitizeTerminalText(
        redactKnownHttpSecrets(
          error instanceof Error ? error.message : String(error),
          secretValues,
        ),
      ),
    }
  }
}
