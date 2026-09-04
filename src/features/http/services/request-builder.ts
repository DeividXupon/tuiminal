import type {
  HttpAuth,
  HttpKeyValue,
  HttpPreparedRequest,
  HttpRequestDefinition,
  HttpVariableContext,
} from "../model/types"
import { resolveHttpTemplate } from "../model/variables"

const METHOD_PATTERN = /^[!#$%&'*+.^_`|~\dA-Z-]+$/i
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~\dA-Z-]+$/i

export class HttpRequestValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HttpRequestValidationError"
  }
}

export function normalizeHttpUrl(source: string) {
  const value = source.trim()
  if (!value) throw new HttpRequestValidationError("Informe uma URL para enviar a requisição.")

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`
  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new HttpRequestValidationError("URL inválida. Use um endereço HTTP ou HTTPS.")
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new HttpRequestValidationError("A URL deve usar HTTP ou HTTPS.")
  }
  return url
}

function enabledValues(entries: HttpKeyValue[]) {
  return entries.filter((entry) => entry.enabled && entry.name.trim())
}

function applyPathParameters(
  source: string,
  entries: HttpKeyValue[],
  variables?: HttpVariableContext,
) {
  let result = resolveHttpTemplate(source, variables)
  for (const entry of enabledValues(entries)) {
    const encoded = encodeURIComponent(resolveHttpTemplate(entry.value, variables))
    result = result.replaceAll(`:${entry.name}`, encoded).replaceAll(`{${entry.name}}`, encoded)
  }
  return result
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

function prepareBody(
  request: HttpRequestDefinition,
  headers: Array<[string, string]>,
  variables?: HttpVariableContext,
) {
  if (request.method.toUpperCase() === "GET" || request.method.toUpperCase() === "HEAD") {
    return undefined
  }
  if (request.body.kind === "none") return undefined

  if (request.body.kind === "json") {
    try {
      JSON.parse(resolveHttpTemplate(request.body.text, variables))
    } catch {
      throw new HttpRequestValidationError("O body JSON não é válido.")
    }
    if (!headers.some(([name]) => name.toLowerCase() === "content-type")) {
      headers.push(["Content-Type", "application/json"])
    }
  }
  if (request.body.kind === "form") {
    if (!headers.some(([name]) => name.toLowerCase() === "content-type")) {
      headers.push(["Content-Type", "application/x-www-form-urlencoded"])
    }
    const body = new URLSearchParams()
    for (const entry of enabledValues(request.body.form)) {
      body.append(entry.name, resolveHttpTemplate(entry.value, variables))
    }
    return body.toString()
  }
  if (request.body.kind === "text") {
    if (!headers.some(([name]) => name.toLowerCase() === "content-type")) {
      headers.push(["Content-Type", "text/plain; charset=utf-8"])
    }
  }
  return resolveHttpTemplate(request.body.text, variables)
}

export function prepareHttpRequest(
  request: HttpRequestDefinition,
  executionId: string,
  requestRevision: number,
  variables?: HttpVariableContext,
): HttpPreparedRequest {
  const method = request.method.trim().toUpperCase()
  if (!METHOD_PATTERN.test(method)) {
    throw new HttpRequestValidationError("O método HTTP contém caracteres inválidos.")
  }

  const url = normalizeHttpUrl(applyPathParameters(request.url, request.path, variables))
  for (const entry of enabledValues(request.query)) {
    url.searchParams.append(entry.name, resolveHttpTemplate(entry.value, variables))
  }

  const headers = enabledValues(request.headers).map((entry): [string, string] => {
    const name = entry.name.trim()
    validateHeader(name, entry.value)
    return [name, resolveHttpTemplate(entry.value, variables)]
  })
  applyAuth(url, headers, request.auth, variables)
  const body = prepareBody(request, headers, variables)

  return {
    executionId,
    requestId: request.id,
    requestRevision,
    method,
    url: url.toString(),
    headers,
    ...(body === undefined ? {} : { body }),
    timeoutMs: request.options.timeoutMs,
    followRedirects: request.options.followRedirects,
  }
}
