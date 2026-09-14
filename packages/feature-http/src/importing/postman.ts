import type {
  HttpAuth,
  HttpKeyValue,
  HttpMultipartPart,
  HttpRequestDefinition,
} from "../model/types"
import { httpHeaderSensitivity } from "../model/key-value"
import { importId, importedHttpRequest, record, text, type HttpImportReport } from "./shared"

function postmanEntries(value: unknown, id: string, kind: "query" | "path") {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index): HttpKeyValue[] => {
    const entry = record(item)
    const name = text(entry?.key, text(entry?.id))
    if (!name) return []
    return [
      {
        id: `${id}-${kind}-${index}`,
        enabled: entry?.disabled !== true,
        name,
        value: text(entry?.value),
        sensitivity: "normal",
      },
    ]
  })
}

function postmanUrl(value: unknown, id: string) {
  if (typeof value === "string") return { url: value, query: [], path: [] }
  const url = record(value)
  const query = postmanEntries(url?.query, id, "query")
  const pathVariables = postmanEntries(url?.variable, id, "path")
  if (typeof url?.raw === "string") {
    const raw = url.raw.split("#", 1)[0] ?? url.raw
    const base = Array.isArray(url.query) ? (raw.split("?", 1)[0] ?? raw) : raw
    return { url: base, query, path: pathVariables }
  }
  const protocol = text(url?.protocol, "http")
  const host = Array.isArray(url?.host) ? url.host.join(".") : text(url?.host)
  const port = text(url?.port)
  const path = Array.isArray(url?.path)
    ? url.path.map((part) => text(record(part)?.value, text(part))).join("/")
    : text(url?.path)
  return {
    url: `${protocol}://${host}${port ? `:${port}` : ""}/${path}`,
    query,
    path: pathVariables,
  }
}

function authValue(source: Record<string, unknown>, kind: string, key: string) {
  const values = Array.isArray(source[kind]) ? source[kind] : []
  return values.map(record).find((entry) => entry?.key === key)?.value
}

function postmanAuth(value: unknown, warnings: string[], name: string): HttpAuth {
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
  warnings.push(`${name}: autenticação ${kind} não suportada.`)
  return { kind: "none" }
}

function postmanHeaders(value: unknown, id: string): HttpKeyValue[] {
  if (typeof value === "string") {
    return value.split(/\r?\n/).flatMap((line, index) => {
      const separator = line.indexOf(":")
      const name = separator >= 0 ? line.slice(0, separator).trim() : ""
      if (!name) return []
      return [
        {
          id: `${id}-header-${index}`,
          enabled: true,
          name,
          value: line.slice(separator + 1).trim(),
          sensitivity: httpHeaderSensitivity(name),
        },
      ]
    })
  }
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

function postmanBody(value: unknown, id: string, name: string, warnings: string[]) {
  const body = record(value)
  const mode = text(body?.mode)
  if (body?.disabled === true) {
    warnings.push(`${name}: body desabilitado ignorado.`)
    return { kind: "none" as const, text: "", form: [] }
  }
  if (mode === "raw") {
    const language = text(
      record(body?.options)?.raw && record(record(body?.options)?.raw)?.language,
    )
    return {
      kind:
        language.toLowerCase() === "json"
          ? ("json" as const)
          : language.toLowerCase() === "xml"
            ? ("xml" as const)
            : ("text" as const),
      text: text(body?.raw),
      form: [],
    }
  }
  if (mode === "urlencoded") {
    const form = Array.isArray(body?.urlencoded)
      ? body.urlencoded.flatMap((item, index): HttpKeyValue[] => {
          const entry = record(item)
          const field = text(entry?.key)
          if (!field) return []
          return [
            {
              id: `${id}-form-${index}`,
              enabled: entry?.disabled !== true,
              name: field,
              value: text(entry?.value),
              sensitivity: "normal",
            },
          ]
        })
      : []
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
  if (mode === "graphql") {
    const graphql = record(body?.graphql)
    const variables = text(graphql?.variables)
    let parsedVariables: unknown = variables
    try {
      parsedVariables = variables ? JSON.parse(variables) : {}
    } catch {
      warnings.push(`${name}: variáveis GraphQL preservadas como texto.`)
    }
    return {
      kind: "json" as const,
      text: JSON.stringify({ query: text(graphql?.query), variables: parsedVariables }, null, 2),
      form: [],
    }
  }
  if (mode) warnings.push(`${name}: body ${mode} não suportado.`)
  return { kind: "none" as const, text: "", form: [] }
}

const SECRET_REFERENCE = /^\s*\{\{[^{}]+\}\}\s*$/

function importedSecretName(request: HttpRequestDefinition, suffix: string) {
  const requestName = request.id
    .replace(/^http-import-postman-/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
  return `{{postman_${requestName}_${suffix}}}`
}

function sanitizeImportedSecrets(request: HttpRequestDefinition, warnings: string[]) {
  request.headers = request.headers.map((header, index) => {
    if (header.sensitivity !== "literal-secret" || SECRET_REFERENCE.test(header.value))
      return header
    warnings.push(`${request.name}: header ${header.name} substituído por variável privada.`)
    return {
      ...header,
      value: importedSecretName(request, `header_${index + 1}`),
      sensitivity: "secret-ref",
    }
  })
  if (request.auth.kind === "bearer" && !SECRET_REFERENCE.test(request.auth.token)) {
    request.auth = { kind: "bearer", token: importedSecretName(request, "bearer_token") }
    warnings.push(`${request.name}: bearer token substituído por variável privada.`)
  } else if (request.auth.kind === "basic" && !SECRET_REFERENCE.test(request.auth.password)) {
    request.auth = {
      ...request.auth,
      password: importedSecretName(request, "basic_password"),
    }
    warnings.push(`${request.name}: senha Basic substituída por variável privada.`)
  } else if (request.auth.kind === "api-key" && !SECRET_REFERENCE.test(request.auth.value)) {
    request.auth = { ...request.auth, value: importedSecretName(request, "api_key") }
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
  const url = postmanUrl(source.url, id)
  const request = importedHttpRequest(id, fullName, text(source.method, "GET"), url.url)
  request.query = url.query
  request.path = url.path
  request.headers = postmanHeaders(source.header, id)
  request.auth = postmanAuth(
    source.auth ?? item.auth ?? inheritedAuth,
    context.warnings,
    request.name,
  )
  sanitizeImportedSecrets(request, context.warnings)
  request.body = postmanBody(source.body, id, request.name, context.warnings)
  if (Array.isArray(item.event) || Array.isArray(source.event)) {
    context.warnings.push(`${request.name}: scripts ignorados.`)
  }
  if (Array.isArray(item.response) && item.response.length) {
    context.ignored.push(`${request.name}: respostas salvas`)
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
      if (Array.isArray(item.event) && item.event.length) {
        context.warnings.push(`${[...path, name].join(" / ")}: scripts ignorados.`)
      }
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
  const schema = text(record(collection.info)?.schema)
  if (schema && !schema.includes("/v2.1.0/")) throw new Error("Coleção Postman v2.1 inválida.")
  const requests: HttpImportReport["requests"] = []
  const ignored: string[] = []
  const warnings: string[] = []
  if (Array.isArray(collection.event) && collection.event.length) {
    warnings.push("Coleção: scripts ignorados.")
  }
  if (Array.isArray(collection.variable) && collection.variable.length) {
    ignored.push("Coleção: variáveis")
  }
  collectPostmanItems(collection.item, collection.auth, [], { requests, ignored, warnings })
  if (!requests.length) throw new Error("A coleção Postman não contém requests suportados.")
  return { format: "postman", requests, ignored, warnings }
}
