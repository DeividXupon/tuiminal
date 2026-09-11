import { realpathSync, statSync } from "node:fs"
import { basename, resolve, sep } from "node:path"
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
import { isValidHttpMethod } from "../model/request-validation"
import { httpSensitiveHeaderNames } from "../model/secrets"
import { resolveHttpPathParameters } from "../model/path-parameters"
import { httpUrlWithProtocol } from "../model/url-input"

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~\dA-Z-]+$/i

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
    case "api-key":
      if (!auth.name.trim()) {
        throw new HttpRequestValidationError("Informe o nome da API key.")
      }
      if (auth.placement === "query")
        url.searchParams.append(auth.name, resolveHttpTemplate(auth.value, variables))
      else setSingletonHeader(headers, auth.name, resolveHttpTemplate(auth.value, variables))
  }
}

function safeProjectFile(projectRoot: string | undefined, path: string) {
  if (!projectRoot) {
    throw new HttpRequestValidationError(
      "Selecione um projeto antes de usar um body por arquivo.",
      "body",
    )
  }
  let root: string
  let candidate: string
  try {
    root = realpathSync(projectRoot)
    candidate = realpathSync(resolve(root, path))
  } catch {
    throw new HttpRequestValidationError(
      `O arquivo de body não foi encontrado: ${path || "(vazio)"}.`,
      "body",
    )
  }
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw new HttpRequestValidationError(
      "O arquivo de body precisa permanecer dentro do projeto.",
      "body",
    )
  }
  if (!statSync(candidate).isFile()) {
    throw new HttpRequestValidationError("O caminho do body não aponta para um arquivo.", "body")
  }
  return candidate
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
  for (const entry of enabledValues(request.body.form)) {
    body.append(entry.name, resolveHttpTemplate(entry.value, variables))
  }
  return body.toString()
}

function prepareFileBody(
  request: HttpRequestDefinition,
  headers: Array<[string, string]>,
  variables?: HttpVariableContext,
  projectRoot?: string,
) {
  const path = safeProjectFile(
    projectRoot,
    resolveHttpTemplate(request.body.filePath ?? "", variables),
  )
  const file = Bun.file(path)
  if (!hasContentType(headers) && file.type) headers.push(["Content-Type", file.type])
  return { body: file, bodyDescriptor: { kind: "file" as const, path } }
}

function prepareMultipartBody(
  request: HttpRequestDefinition,
  variables?: HttpVariableContext,
  projectRoot?: string,
) {
  const form = new FormData()
  const parts: Array<{
    name: string
    value: string
    kind: "text" | "file"
    sensitivity: HttpMultipartPart["sensitivity"]
  }> = []
  for (const part of request.body.multipart ?? []) {
    if (!part.enabled || !part.name.trim()) continue
    if (part.kind === "file") {
      const path = safeProjectFile(projectRoot, resolveHttpTemplate(part.value, variables))
      form.append(part.name, Bun.file(path), basename(path))
      parts.push({
        name: part.name,
        value: path,
        kind: "file",
        sensitivity: part.sensitivity,
      })
    } else {
      const value = resolveHttpTemplate(part.value, variables)
      form.append(part.name, value)
      parts.push({ name: part.name, value, kind: "text", sensitivity: part.sensitivity })
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
      return prepareMultipartBody(request, variables, projectRoot)
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
  for (const entry of enabledValues(request.query)) {
    url.searchParams.append(entry.name, resolveHttpTemplate(entry.value, variables))
  }

  const headers = enabledValues(request.headers).map((entry): [string, string] => {
    const name = entry.name.trim()
    validateHeader(name, entry.value)
    return [name, resolveHttpTemplate(entry.value, variables)]
  })
  applyAuth(url, headers, request.auth, variables)
  const preparedBody = prepareBody(request, headers, variables, projectRoot)
  const proxyUrl = normalizeHttpProxyUrl(
    resolveHttpTemplate(request.options.proxy ?? "", variables),
  )

  return {
    executionId,
    requestId: request.id,
    requestRevision,
    method,
    url: url.toString(),
    headers,
    sensitiveHeaderNames: httpSensitiveHeaderNames(request, headers, variables),
    ...preparedBody,
    timeoutMs: request.options.timeoutMs,
    followRedirects: request.options.followRedirects,
    useCookieJar: request.options.cookieJar !== false,
    ...(proxyUrl ? { proxyUrl } : {}),
    tlsVerification: request.options.tlsVerification ?? "strict",
  }
}
