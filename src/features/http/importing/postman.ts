import type {
  HttpAuth,
  HttpKeyValue,
  HttpMultipartPart,
  HttpRequestDefinition,
} from "../model/types"
import { httpHeaderSensitivity } from "../model/key-value"
import { importId, importedHttpRequest, record, text, type HttpImportReport } from "./shared"

function postmanValues(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const entry = record(item)
        const key = text(entry?.key)
        return key ? [[key, text(entry?.value)] as [string, string]] : []
      })
    : []
}

function postmanUrl(value: unknown) {
  if (typeof value === "string") return value
  const url = record(value)
  if (typeof url?.raw === "string") return url.raw
  const protocol = text(url?.protocol, "http")
  const host = Array.isArray(url?.host) ? url.host.join(".") : text(url?.host)
  const path = Array.isArray(url?.path) ? url.path.join("/") : text(url?.path)
  const result = `${protocol}://${host}/${path}`
  const query = new URLSearchParams(postmanValues(url?.query))
  return query.size ? `${result}?${query}` : result
}

function authValue(source: Record<string, unknown>, kind: string, key: string) {
  const values = Array.isArray(source[kind]) ? source[kind] : []
  return values.map(record).find((entry) => entry?.key === key)?.value
}

function postmanAuth(value: unknown): HttpAuth {
  const auth = record(value)
  const kind = text(auth?.type).toLowerCase()
  if (!auth || !kind || kind === "noauth") return { kind: "none" }
  if (kind === "bearer") return { kind: "bearer", token: text(authValue(auth, kind, "token")) }
  if (kind === "basic") {
    return {
      kind: "basic",
      username: text(authValue(auth, kind, "username")),
      password: text(authValue(auth, kind, "password")),
    }
  }
  if (kind === "apikey") {
    return {
      kind: "api-key",
      placement: text(authValue(auth, kind, "in")) === "query" ? "query" : "header",
      name: text(authValue(auth, kind, "key"), "X-API-Key"),
      value: text(authValue(auth, kind, "value")),
    }
  }
  return { kind: "none" }
}

function postmanHeaders(value: unknown, id: string): HttpKeyValue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const header = record(item)
    const name = text(header?.key)
    if (!name) return []
    return [
      {
        id: `${id}-header-${index}`,
        enabled: header?.disabled !== true,
        name,
        value: text(header?.value),
        sensitivity: httpHeaderSensitivity(name),
      },
    ]
  })
}

function postmanBody(value: unknown, id: string) {
  const body = record(value)
  const mode = text(body?.mode)
  if (mode === "raw") {
    const language = text(
      record(body?.options)?.raw && record(record(body?.options)?.raw)?.language,
    )
    return {
      kind: language === "json" ? ("json" as const) : ("text" as const),
      text: text(body?.raw),
      form: [],
    }
  }
  if (mode === "urlencoded") {
    const form = postmanValues(body?.urlencoded).map(([name, value], index) => ({
      id: `${id}-form-${index}`,
      enabled: true,
      name,
      value,
      sensitivity: "normal" as const,
    }))
    return { kind: "form" as const, text: "", form }
  }
  if (mode === "formdata" && Array.isArray(body?.formdata)) {
    const multipart = body.formdata.flatMap((item, index): HttpMultipartPart[] => {
      const part = record(item)
      const name = text(part?.key)
      if (!name) return []
      const file = part?.type === "file"
      const source = Array.isArray(part?.src) ? part.src[0] : part?.src
      return [
        {
          id: `${id}-multipart-${index}`,
          enabled: part?.disabled !== true,
          name,
          value: file ? text(source) : text(part?.value),
          kind: file ? "file" : "text",
          sensitivity: "normal",
        },
      ]
    })
    return { kind: "multipart" as const, text: "", form: [], multipart }
  }
  if (mode === "file")
    return { kind: "file" as const, text: "", form: [], filePath: text(record(body?.file)?.src) }
  return { kind: "none" as const, text: "", form: [] }
}

const SECRET_REFERENCE = /^\s*\{\{[^{}]+\}\}\s*$/

function sanitizeImportedSecrets(request: HttpRequestDefinition, warnings: string[]) {
  request.headers = request.headers.map((header, index) => {
    if (header.sensitivity !== "literal-secret" || SECRET_REFERENCE.test(header.value))
      return header
    warnings.push(`${request.name}: header ${header.name} substituído por variável privada.`)
    return { ...header, value: `{{postman_secret_${index + 1}}}`, sensitivity: "secret-ref" }
  })
  if (request.auth.kind === "bearer" && !SECRET_REFERENCE.test(request.auth.token)) {
    request.auth = { kind: "bearer", token: "{{postman_bearer_token}}" }
    warnings.push(`${request.name}: bearer token substituído por variável privada.`)
  } else if (request.auth.kind === "basic" && !SECRET_REFERENCE.test(request.auth.password)) {
    request.auth = { ...request.auth, password: "{{postman_basic_password}}" }
    warnings.push(`${request.name}: senha Basic substituída por variável privada.`)
  } else if (request.auth.kind === "api-key" && !SECRET_REFERENCE.test(request.auth.value)) {
    request.auth = { ...request.auth, value: "{{postman_api_key}}" }
    warnings.push(`${request.name}: API key substituída por variável privada.`)
  }
}

type PostmanImportContext = Pick<HttpImportReport, "requests" | "ignored" | "warnings">

function convertPostmanRequest(
  item: Record<string, unknown>,
  source: Record<string, unknown>,
  inheritedAuth: unknown,
  path: string[],
  context: PostmanImportContext,
) {
  const name = text(item.name, "Request")
  const fullName = [...path, name].join(" / ")
  const id = importId("postman", context.requests.length, fullName)
  const request = importedHttpRequest(
    id,
    fullName,
    text(source.method, "GET"),
    postmanUrl(source.url),
  )
  request.headers = postmanHeaders(source.header, id)
  request.auth = postmanAuth(source.auth ?? item.auth ?? inheritedAuth)
  sanitizeImportedSecrets(request, context.warnings)
  request.body = postmanBody(source.body, id)
  if (Array.isArray(item.event) || Array.isArray(source.event)) {
    context.warnings.push(`${request.name}: scripts ignorados.`)
  }
  return request
}

function collectPostmanItems(
  items: unknown[],
  inheritedAuth: unknown,
  path: string[],
  context: PostmanImportContext,
) {
  for (const rawItem of items) {
    const item = record(rawItem)
    if (!item) continue
    const name = text(item.name, "Request")
    if (Array.isArray(item.item)) {
      collectPostmanItems(item.item, item.auth ?? inheritedAuth, [...path, name], context)
      continue
    }
    const source = record(item.request)
    if (source)
      context.requests.push(convertPostmanRequest(item, source, inheritedAuth, path, context))
    else context.ignored.push([...path, name].join(" / "))
  }
}

export function importPostmanCollection(value: unknown): HttpImportReport {
  const collection = record(value)
  if (!collection || !Array.isArray(collection.item)) throw new Error("Coleção Postman inválida.")
  const requests: HttpImportReport["requests"] = []
  const ignored: string[] = []
  const warnings: string[] = []
  collectPostmanItems(collection.item, collection.auth, [], { requests, ignored, warnings })
  if (!requests.length) throw new Error("A coleção Postman não contém requests suportados.")
  return { format: "postman", requests, ignored, warnings }
}
