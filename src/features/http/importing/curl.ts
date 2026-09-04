import { createScratchRequest } from "../model/workspace"
import type { HttpKeyValue, HttpRequestDefinition } from "../model/types"
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

type CurlDraft = { url: string; body?: string; explicitMethod: boolean }

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
    case "--data-binary": {
      const body = takeValue(tokens, index, token)
      if (body.startsWith("@")) {
        throw new HttpCurlImportError("Body cURL por arquivo exige seleção explícita na TUI.")
      }
      draft.body = body
      return index + 1
    }
    case "-L":
    case "--location":
      request.options.followRedirects = true
      return index
    case "--max-time": {
      const seconds = Number(takeValue(tokens, index, token))
      if (Number.isFinite(seconds) && seconds > 0) request.options.timeoutMs = seconds * 1_000
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

export function importCurl(command: string, requestId = `http-curl-${Date.now()}`) {
  const tokens = tokenizeCurl(command)
  if (tokens[0]?.toLowerCase() !== "curl") {
    throw new HttpCurlImportError("O comando precisa começar com curl.")
  }
  const request = createScratchRequest(requestId)
  request.name = "Imported cURL"
  request.headers = []
  const draft: CurlDraft = { url: "", explicitMethod: false }

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
  if (draft.body !== undefined) {
    if (!draft.explicitMethod) request.method = "POST"
    const contentType = request.headers.find(
      (header) => header.name.toLowerCase() === "content-type",
    )?.value
    request.body = {
      kind: contentType?.toLowerCase().includes("json") ? "json" : "text",
      text: draft.body,
      form: [],
    }
  }
  return request satisfies HttpRequestDefinition
}
