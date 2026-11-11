import { statSync } from "node:fs"
import { basename } from "node:path"
import { HTTP_BODY_FILE_MAX_BYTES, resolveHttpBodyFile } from "./body-file"
import type {
  HttpAuth,
  HttpKeyValue,
  HttpMultipartPart,
  HttpPreparedRequest,
  HttpRequestDefinition,
  HttpVariableContext,
} from "../model/types"
import { resolveHttpTemplate } from "../model/variables"
import { validateHttpRequestAutomation } from "../model/automation"
import { resolveHttpPathParameters } from "../model/path-parameters"
import { isValidHttpMethod } from "../model/request-validation"
import { httpSensitiveHeaderNames, requestHttpPrivacy } from "../model/secrets"
import { httpUrlWithProtocol } from "../model/url-input"
import { urlQueryEntryPrefix } from "../model/url-query"

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~\dA-Z-]+$/i
export const HTTP_REQUEST_LIMITS = {
  urlBytes: 16_384,
  headers: 200,
  headerBytes: 128 * 1024,
  fields: 500,
  bodyBytes: 8 * 1024 * 1024,
  fileBytes: HTTP_BODY_FILE_MAX_BYTES,
} as const

export class HttpRequestValidationError extends Error {
  constructor(
    message: string,
    readonly kind: "url" | "body" | "parse" = "parse",
  ) {
    super(message)
    this.name = "HttpRequestValidationError"
  }
}

export function normalizeHttpUrl(source: string) {
  const value = source.trim()
  if (!value) {
    throw new HttpRequestValidationError("Informe uma URL para enviar a requisição.", "url")
  }

  const withProtocol = httpUrlWithProtocol(value)
  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new HttpRequestValidationError("URL inválida. Use um endereço HTTP ou HTTPS.", "url")
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new HttpRequestValidationError("A URL deve usar HTTP ou HTTPS.", "url")
  }
  return url
}

export function normalizeHttpProxyUrl(source: string) {
  const value = source.trim()
  if (!value) return undefined
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`
  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new HttpRequestValidationError(
      "Proxy inválido. Use uma URL HTTP/HTTPS ou uma variável privada.",
    )
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new HttpRequestValidationError("O proxy deve usar HTTP ou HTTPS.")
  }
  return url.toString()
}

function enabledValues(entries: HttpKeyValue[]) {
  return entries.filter((entry) => entry.enabled && entry.name.trim())
}

function validateHeader(name: string, value: string) {
  if (!HEADER_NAME_PATTERN.test(name)) {
    throw new HttpRequestValidationError(`Nome de header inválido: ${name || "(vazio)"}.`)
  }
  if (value.includes("\r") || value.includes("\n")) {
    throw new HttpRequestValidationError(`O header ${name} contém uma quebra de linha.`)
  }
}

function setSingletonHeader(headers: Array<[string, string]>, name: string, value: string) {
  const index = headers.findIndex(([candidate]) => candidate.toLowerCase() === name.toLowerCase())
  if (index >= 0) headers[index] = [name, value]
  else headers.push([name, value])
}

function applyAuth(
  url: URL,
  headers: Array<[string, string]>,
  auth: HttpAuth,
  variables?: HttpVariableContext,
) {
  switch (auth.kind) {
    case "oauth2":
      throw new HttpRequestValidationError("OAuth2: autorize esta requisição na aba Autenticação.")
    case "none":
      return
    case "bearer":
      setSingletonHeader(
        headers,
        "Authorization",
        `Bearer ${resolveHttpTemplate(auth.token, variables)}`,
      )
      return
    case "basic":
      setSingletonHeader(
        headers,
        "Authorization",
        `Basic ${Buffer.from(
          `${resolveHttpTemplate(auth.username, variables)}:${resolveHttpTemplate(auth.password, variables)}`,
        ).toString("base64")}`,
      )
      return
    case "api-key": {
      const name = resolveHttpTemplate(auth.name, variables).trim()
      const value = resolveHttpTemplate(auth.value, variables)
      if (!name) {
        throw new HttpRequestValidationError("Informe o nome da API key.")
      }
      if (auth.placement === "query") url.searchParams.append(name, value)
      else {
        validateHeader(name, value)
        setSingletonHeader(headers, name, value)
      }
    }
  }
}

function bodyFile(projectRoot: string | undefined, path: string) {
  try {
    return resolveHttpBodyFile(path, projectRoot)
  } catch (error) {
    throw new HttpRequestValidationError(
      error instanceof Error ? error.message : String(error),
      "body",
    )
  }
}

function hasContentType(headers: Array<[string, string]>) {
  return headers.some(([name]) => name.toLowerCase() === "content-type")
}

function prepareTextBody(
  request: HttpRequestDefinition,
  headers: Array<[string, string]>,
  variables?: HttpVariableContext,
) {
  const text = resolveHttpTemplate(request.body.text, variables)
  if (Buffer.byteLength(text) > HTTP_REQUEST_LIMITS.bodyBytes) {
    throw new HttpRequestValidationError("O body excede o limite de 8 MB.", "body")
  }
  if (request.body.kind === "json") {
    try {
      JSON.parse(text)
    } catch {
      throw new HttpRequestValidationError("O body JSON não é válido.", "body")
    }
    if (!hasContentType(headers)) headers.push(["Content-Type", "application/json"])
  }
  if (request.body.kind === "xml" && !hasContentType(headers)) {
    headers.push(["Content-Type", "application/xml; charset=utf-8"])
  }
  if (request.body.kind === "text" && !hasContentType(headers)) {
    headers.push(["Content-Type", "text/plain; charset=utf-8"])
  }
  return text
}

function prepareFormBody(
  request: HttpRequestDefinition,
  headers: Array<[string, string]>,
  variables?: HttpVariableContext,
) {
  if (!hasContentType(headers)) {
    headers.push(["Content-Type", "application/x-www-form-urlencoded"])
  }
  const body = new URLSearchParams()
  const entries = enabledValues(request.body.form)
  if (entries.length > HTTP_REQUEST_LIMITS.fields) {
    throw new HttpRequestValidationError("O formulário excede 500 campos.", "body")
  }
  for (const entry of entries) {
    body.append(
      resolveHttpTemplate(entry.name, variables),
      resolveHttpTemplate(entry.value, variables),
    )
  }
  const serialized = body.toString()
  if (Buffer.byteLength(serialized) > HTTP_REQUEST_LIMITS.bodyBytes) {
    throw new HttpRequestValidationError("O formulário excede o limite de 8 MB.", "body")
  }
  return serialized
}

function prepareFileBody(
  request: HttpRequestDefinition,
  headers: Array<[string, string]>,
  variables?: HttpVariableContext,
  projectRoot?: string,
) {
  const path = bodyFile(projectRoot, resolveHttpTemplate(request.body.filePath ?? "", variables))
  const file = Bun.file(path)
  if (!hasContentType(headers) && file.type) headers.push(["Content-Type", file.type])
  return { body: file, bodyDescriptor: { kind: "file" as const, path } }
}

function prepareMultipartBody(
  request: HttpRequestDefinition,
  headers: Array<[string, string]>,
  variables?: HttpVariableContext,
  projectRoot?: string,
) {
  // FormData generates a new boundary, including for a multipart body reopened from .http.
  for (let index = headers.length - 1; index >= 0; index--) {
    const header = headers[index]
    if (
      header?.[0].toLowerCase() === "content-type" &&
      /^multipart\/form-data(?:;|$)/i.test(header[1])
    )
      headers.splice(index, 1)
  }
  const form = new FormData()
  const parts: Array<{
    name: string
    value: string
    kind: "text" | "file"
    sensitivity: HttpMultipartPart["sensitivity"]
  }> = []
  const enabledParts = (request.body.multipart ?? []).filter(
    (part) => part.enabled && part.name.trim(),
  )
  if (enabledParts.length > HTTP_REQUEST_LIMITS.fields) {
    throw new HttpRequestValidationError("O multipart excede 500 partes.", "body")
  }
  let totalBytes = 0
  let textBytes = 0
  for (const part of enabledParts) {
    const name = resolveHttpTemplate(part.name, variables)
    if (part.kind === "file") {
      const path = bodyFile(projectRoot, resolveHttpTemplate(part.value, variables))
      const size = statSync(path).size
      if (
        size > HTTP_REQUEST_LIMITS.fileBytes ||
        totalBytes + size > HTTP_REQUEST_LIMITS.fileBytes
      ) {
        throw new HttpRequestValidationError("Os arquivos multipart excedem 256 MB.", "body")
      }
      totalBytes += size
      form.append(name, Bun.file(path), basename(path))
      parts.push({
        name,
        value: path,
        kind: "file",
        sensitivity: part.sensitivity,
      })
    } else {
      const value = resolveHttpTemplate(part.value, variables)
      const size = Buffer.byteLength(name) + Buffer.byteLength(value)
      textBytes += size
      totalBytes += size
      if (textBytes > HTTP_REQUEST_LIMITS.bodyBytes || totalBytes > HTTP_REQUEST_LIMITS.fileBytes) {
        throw new HttpRequestValidationError("O texto multipart excede 8 MB.", "body")
      }
      form.append(name, value)
      parts.push({ name, value, kind: "text", sensitivity: part.sensitivity })
    }
  }
  return { body: form, bodyDescriptor: { kind: "multipart" as const, parts } }
}

function prepareBody(
  request: HttpRequestDefinition,
  headers: Array<[string, string]>,
  variables?: HttpVariableContext,
  projectRoot?: string,
) {
  if (["GET", "HEAD"].includes(request.method.toUpperCase())) return {}
  switch (request.body.kind) {
    case "none":
      return {}
    case "form":
      return { body: prepareFormBody(request, headers, variables) }
    case "file":
      return prepareFileBody(request, headers, variables, projectRoot)
    case "multipart":
      return prepareMultipartBody(request, headers, variables, projectRoot)
    default:
      return { body: prepareTextBody(request, headers, variables) }
  }
}

export function prepareHttpRequest(
  request: HttpRequestDefinition,
  executionId: string,
  requestRevision: number,
  variables?: HttpVariableContext,
  projectRoot?: string,
): HttpPreparedRequest {
  if (request.source.kind === "file" && request.source.supported === false) {
    throw new HttpRequestValidationError(
      "Este request usa recursos .http que o Tuiminal ainda não executa com segurança.",
    )
  }
  const automationError = validateHttpRequestAutomation(request)
  if (automationError) throw new HttpRequestValidationError(automationError)
  const method = request.method.trim().toUpperCase()
  if (!isValidHttpMethod(method)) {
    throw new HttpRequestValidationError("O método HTTP contém caracteres inválidos.")
  }

  const url = normalizeHttpUrl(resolveHttpPathParameters(request.url, request.path, variables))
  const queryEntries = enabledValues(request.query).filter(
    (entry) => !entry.id.startsWith(urlQueryEntryPrefix(request.id)),
  )
  if (queryEntries.length > HTTP_REQUEST_LIMITS.fields) {
    throw new HttpRequestValidationError("A query excede 500 parâmetros.", "url")
  }
  for (const entry of queryEntries) {
    url.searchParams.append(
      resolveHttpTemplate(entry.name, variables),
      resolveHttpTemplate(entry.value, variables),
    )
  }
  if (Buffer.byteLength(url.toString()) > HTTP_REQUEST_LIMITS.urlBytes) {
    throw new HttpRequestValidationError("A URL excede o limite de 16 KB.", "url")
  }

  const headerEntries = enabledValues(request.headers)
  if (headerEntries.length > HTTP_REQUEST_LIMITS.headers) {
    throw new HttpRequestValidationError("A requisição excede 200 headers.")
  }
  const headers = headerEntries.map((entry): [string, string] => {
    const name = resolveHttpTemplate(entry.name, variables).trim()
    const value = resolveHttpTemplate(entry.value, variables)
    validateHeader(name, value)
    return [name, value]
  })
  applyAuth(url, headers, request.auth, variables)
  if (Buffer.byteLength(url.toString()) > HTTP_REQUEST_LIMITS.urlBytes) {
    throw new HttpRequestValidationError("A URL excede o limite de 16 KB.", "url")
  }
  const headerBytes = headers.reduce(
    (total, [name, value]) => total + Buffer.byteLength(name) + Buffer.byteLength(value) + 4,
    0,
  )
  if (headerBytes > HTTP_REQUEST_LIMITS.headerBytes) {
    throw new HttpRequestValidationError("Os headers excedem o limite de 128 KB.")
  }
  const preparedBody = prepareBody(request, headers, variables, projectRoot)
  const proxyUrl = normalizeHttpProxyUrl(
    resolveHttpTemplate(request.options.proxy ?? "", variables),
  )

  return {
    executionId,
    privacy: requestHttpPrivacy(request, variables),
    credentialHeaderNames: httpSensitiveHeaderNames(request, headers, variables),
    requestId: request.id,
    requestRevision,
    method,
    url: url.toString(),
    headers,
    ...preparedBody,
    timeoutMs: request.options.timeoutMs,
    followRedirects: request.options.followRedirects,
    useCookieJar: request.options.cookieJar !== false,
    ...(proxyUrl ? { proxyUrl } : {}),
    tlsVerification: request.options.tlsVerification ?? "strict",
  }
}
