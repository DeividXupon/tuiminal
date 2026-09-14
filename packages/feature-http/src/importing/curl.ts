import { createScratchRequest } from "../model/workspace"
import type { HttpKeyValue, HttpMultipartPart, HttpRequestDefinition } from "../model/types"
import { httpHeaderSensitivity } from "../model/key-value"

export class HttpCurlImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HttpCurlImportError"
  }
}

export function tokenizeCurl(command: string) {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let escaped = false
  for (const character of command.trim()) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else current += character
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (/\s/.test(character)) {
      if (current) tokens.push(current)
      current = ""
      continue
    }
    current += character
  }
  if (escaped || quote) throw new HttpCurlImportError("O comando cURL possui aspas incompletas.")
  if (current) tokens.push(current)
  return tokens
}

function importedHeader(id: string, index: number, source: string): HttpKeyValue {
  const separator = source.indexOf(":")
  if (separator <= 0) throw new HttpCurlImportError(`Header cURL inválido: ${source}`)
  const name = source.slice(0, separator).trim()
  return {
    id: `${id}-curl-header-${index}`,
    enabled: true,
    name,
    value: source.slice(separator + 1).trim(),
    sensitivity: httpHeaderSensitivity(name),
  }
}

function takeValue(tokens: string[], index: number, option: string) {
  const value = tokens[index + 1]
  if (!value) throw new HttpCurlImportError(`A opção ${option} exige um valor.`)
  return value
}

type CurlDraft = {
  url: string
  body?: string
  filePath?: string
  multipart: HttpMultipartPart[]
  explicitMethod: boolean
  useGet: boolean
}

function appendCurlData(draft: CurlDraft, value: string) {
  draft.body = draft.body === undefined ? value : `${draft.body}&${value}`
}

function importedMultipartPart(
  requestId: string,
  index: number,
  source: string,
  forceText: boolean,
): HttpMultipartPart {
  const separator = source.indexOf("=")
  if (separator <= 0) throw new HttpCurlImportError(`Parte multipart inválida: ${source}`)
  const name = source.slice(0, separator).trim()
  const rawValue = source.slice(separator + 1)
  const file = !forceText && rawValue.startsWith("@")
  const value = file ? (rawValue.slice(1).split(";", 1)[0] ?? "") : rawValue
  return {
    id: `${requestId}-curl-part-${index}`,
    enabled: true,
    name,
    value,
    kind: file ? "file" : "text",
    sensitivity: httpHeaderSensitivity(name),
  }
}

function appendConvenienceHeader(request: HttpRequestDefinition, name: string, value: string) {
  request.headers.push({
    id: `${request.id}-curl-header-${request.headers.length}`,
    enabled: true,
    name,
    value,
    sensitivity: httpHeaderSensitivity(name),
  })
}

function applyCurlOption(
  token: string,
  index: number,
  tokens: string[],
  request: HttpRequestDefinition,
  draft: CurlDraft,
) {
  switch (token) {
    case "-X":
    case "--request":
      request.method = takeValue(tokens, index, token).toUpperCase()
      draft.explicitMethod = true
      return index + 1
    case "--url":
      draft.url = takeValue(tokens, index, token)
      return index + 1
    case "-H":
    case "--header":
      request.headers.push(
        importedHeader(request.id, request.headers.length, takeValue(tokens, index, token)),
      )
      return index + 1
    case "-d":
    case "--data":
    case "--data-raw":
    case "--data-urlencode":
    case "--data-binary": {
      const body = takeValue(tokens, index, token)
      if (token === "--data-binary" && body.startsWith("@")) draft.filePath = body.slice(1)
      else appendCurlData(draft, body)
      return index + 1
    }
    case "-F":
    case "--form":
    case "--form-string":
      draft.multipart.push(
        importedMultipartPart(
          request.id,
          draft.multipart.length,
          takeValue(tokens, index, token),
          token === "--form-string",
        ),
      )
      return index + 1
    case "-G":
    case "--get":
      draft.useGet = true
      return index
    case "-I":
    case "--head":
      request.method = "HEAD"
      draft.explicitMethod = true
      return index
    case "-b":
    case "--cookie":
      appendConvenienceHeader(request, "Cookie", takeValue(tokens, index, token))
      return index + 1
    case "-A":
    case "--user-agent":
      appendConvenienceHeader(request, "User-Agent", takeValue(tokens, index, token))
      return index + 1
    case "-e":
    case "--referer":
      appendConvenienceHeader(request, "Referer", takeValue(tokens, index, token))
      return index + 1
    case "-L":
    case "--location":
      request.options.followRedirects = true
      request.options.followRedirectsExplicit = true
      return index
    case "-x":
    case "--proxy":
      request.options.proxy = takeValue(tokens, index, token)
      return index + 1
    case "-k":
    case "--insecure":
      request.options.tlsVerification = "insecure"
      return index
    case "--max-time": {
      const seconds = Number(takeValue(tokens, index, token))
      if (Number.isFinite(seconds) && seconds > 0) {
        request.options.timeoutMs = seconds * 1_000
        request.options.timeoutExplicit = true
      }
      return index + 1
    }
    case "-u":
    case "--user": {
      const [username = "", password = ""] = takeValue(tokens, index, token).split(":", 2)
      request.auth = { kind: "basic", username, password }
      return index + 1
    }
    default:
      if (!token.startsWith("-") && !draft.url) draft.url = token
      return index
  }
}

function applyCurlGetData(request: HttpRequestDefinition, body: string, requestId: string) {
  for (const [name, value] of new URLSearchParams(body)) {
    request.query.push({
      id: `${requestId}-curl-query-${request.query.length}`,
      enabled: true,
      name,
      value,
      sensitivity: httpHeaderSensitivity(name),
    })
  }
  request.method = "GET"
}

function applyCurlRawBody(request: HttpRequestDefinition, body: string, requestId: string) {
  const contentType = request.headers.find(
    (header) => header.name.toLowerCase() === "content-type",
  )?.value
  if (contentType?.toLowerCase().includes("x-www-form-urlencoded")) {
    request.body = {
      kind: "form",
      text: body,
      form: [...new URLSearchParams(body)].map(([name, value], index) => ({
        id: `${requestId}-curl-form-${index}`,
        enabled: true,
        name,
        value,
        sensitivity: httpHeaderSensitivity(name),
      })),
    }
    return
  }
  request.body = {
    kind: contentType?.toLowerCase().includes("json") ? "json" : "text",
    text: body,
    form: [],
  }
}

function applyCurlBody(request: HttpRequestDefinition, draft: CurlDraft, requestId: string) {
  const bodyModes =
    Number(draft.body !== undefined) +
    Number(Boolean(draft.filePath)) +
    Number(Boolean(draft.multipart.length))
  if (bodyModes > 1) {
    throw new HttpCurlImportError("O comando cURL mistura formatos de body incompatíveis.")
  }
  if (draft.useGet && draft.body !== undefined) {
    applyCurlGetData(request, draft.body, requestId)
    return
  }
  if (draft.multipart.length) {
    if (!draft.explicitMethod) request.method = "POST"
    request.body = { kind: "multipart", text: "", form: [], multipart: draft.multipart }
    return
  }
  if (draft.filePath) {
    if (!draft.explicitMethod) request.method = "POST"
    request.body = { kind: "file", text: "", form: [], filePath: draft.filePath }
    return
  }
  if (draft.body !== undefined) {
    if (!draft.explicitMethod) request.method = "POST"
    applyCurlRawBody(request, draft.body, requestId)
  }
}

export function importCurl(command: string, requestId = `http-curl-${Date.now()}`) {
  const tokens = tokenizeCurl(command)
  if (tokens[0]?.toLowerCase() !== "curl") {
    throw new HttpCurlImportError("O comando precisa começar com curl.")
  }
  const request = createScratchRequest(requestId)
  request.name = "Imported cURL"
  request.headers = []
  request.options.followRedirects = false
  request.options.followRedirectsExplicit = true
  const draft: CurlDraft = { url: "", multipart: [], explicitMethod: false, useGet: false }

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token) continue
    index = applyCurlOption(token, index, tokens, request, draft)
  }

  if (!draft.url) throw new HttpCurlImportError("O comando cURL não contém uma URL.")
  const parsedUrl = new URL(
    /^[a-z][\w+.-]*:\/\//i.test(draft.url) ? draft.url : `http://${draft.url}`,
  )
  request.query = [...parsedUrl.searchParams].map(([name, value], index) => ({
    id: `${requestId}-curl-query-${index}`,
    enabled: true,
    name,
    value,
    sensitivity: httpHeaderSensitivity(name),
  }))
  parsedUrl.search = ""
  request.url = parsedUrl.toString()
  applyCurlBody(request, draft, requestId)
  return request satisfies HttpRequestDefinition
}
