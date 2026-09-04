import type { HttpAuth, HttpKeyValue, HttpRequestDefinition } from "../model/types"
import { importId, importedHttpRequest, record, text, type HttpImportReport } from "./shared"

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"]

function exampleFromSchema(value: unknown, depth = 0): unknown {
  const schema = record(value)
  if (!schema || depth > 6) return null
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  if (schema.type === "object" || record(schema.properties)) {
    return Object.fromEntries(
      Object.entries(record(schema.properties) ?? {}).map(([name, property]) => [
        name,
        exampleFromSchema(property, depth + 1),
      ]),
    )
  }
  if (schema.type === "array") return [exampleFromSchema(schema.items, depth + 1)]
  if (schema.type === "integer" || schema.type === "number") return 0
  if (schema.type === "boolean") return false
  return "string"
}

function parameterValue(parameter: Record<string, unknown>) {
  if (parameter.example !== undefined) return String(parameter.example)
  const schema = record(parameter.schema)
  if (schema?.default !== undefined) return String(schema.default)
  if (schema?.example !== undefined) return String(schema.example)
  return `{{${text(parameter.name)}}}`
}

function parameterEntries(parameters: unknown[], location: string, id: string): HttpKeyValue[] {
  return parameters.flatMap((value, index) => {
    const parameter = record(value)
    const name = text(parameter?.name)
    if (!parameter || parameter.in !== location || !name) return []
    return [
      {
        id: `${id}-${location}-${index}`,
        enabled: true,
        name,
        value: parameterValue(parameter),
        sensitivity: "normal",
      },
    ]
  })
}

function resolveServerUrl(document: Record<string, unknown>, operation: Record<string, unknown>) {
  const servers = Array.isArray(operation.servers)
    ? operation.servers
    : Array.isArray(document.servers)
      ? document.servers
      : []
  const server = record(servers[0])
  let url = text(server?.url, "http://localhost")
  const variables = record(server?.variables)
  url = url.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const variable = record(variables?.[name])
    return encodeURIComponent(text(variable?.default, `{{${name}}}`))
  })
  return url.replace(/\/$/, "")
}

function openApiBody(request: HttpRequestDefinition, operation: Record<string, unknown>) {
  const content = record(record(operation.requestBody)?.content)
  if (!content) return
  const contentType =
    ["application/json", "application/x-www-form-urlencoded", "multipart/form-data"].find(
      (candidate) => candidate in content,
    ) ?? Object.keys(content)[0]
  if (!contentType) return
  const media = record(content[contentType])
  const example = media?.example ?? exampleFromSchema(media?.schema)
  if (contentType.includes("json")) {
    request.body = { kind: "json", text: JSON.stringify(example, null, 2), form: [] }
  } else if (contentType.includes("x-www-form-urlencoded")) {
    const fields = record(example) ?? {}
    request.body = {
      kind: "form",
      text: "",
      form: Object.entries(fields).map(([name, value], index) => ({
        id: `${request.id}-form-${index}`,
        enabled: true,
        name,
        value: String(value),
        sensitivity: "normal",
      })),
    }
  } else if (contentType.includes("multipart/form-data")) {
    const fields = record(example) ?? {}
    request.body = {
      kind: "multipart",
      text: "",
      form: [],
      multipart: Object.entries(fields).map(([name, value], index) => ({
        id: `${request.id}-multipart-${index}`,
        enabled: true,
        name,
        value: String(value),
        kind: "text",
        sensitivity: "normal",
      })),
    }
  } else {
    request.body = {
      kind: "text",
      text: typeof example === "string" ? example : JSON.stringify(example),
      form: [],
    }
  }
  request.headers.push({
    id: `${request.id}-content-type`,
    enabled: true,
    name: "Content-Type",
    value: contentType,
    sensitivity: "normal",
  })
}

function openApiAuth(
  document: Record<string, unknown>,
  operation: Record<string, unknown>,
  warnings: string[],
  name: string,
): HttpAuth {
  const security = Array.isArray(operation.security)
    ? operation.security
    : Array.isArray(document.security)
      ? document.security
      : []
  const requirement = record(security[0])
  const schemeName = requirement ? Object.keys(requirement)[0] : undefined
  const schemes = record(record(document.components)?.securitySchemes)
  const scheme = schemeName ? record(schemes?.[schemeName]) : null
  if (!scheme || !schemeName) return { kind: "none" }
  warnings.push(`${name}: credencial ${schemeName} importada como variável.`)
  if (scheme.type === "apiKey") {
    return {
      kind: "api-key",
      placement: scheme.in === "query" ? "query" : "header",
      name: text(scheme.name, "X-API-Key"),
      value: `{{${schemeName}}}`,
    }
  }
  if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "basic") {
    return {
      kind: "basic",
      username: `{{${schemeName}_username}}`,
      password: `{{${schemeName}_password}}`,
    }
  }
  if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") {
    return { kind: "bearer", token: `{{${schemeName}}}` }
  }
  warnings.push(`${name}: esquema de autenticação ${schemeName} não suportado.`)
  return { kind: "none" }
}

function importOpenApiOperation({
  document,
  path,
  pathItem,
  method,
  operation,
  index,
  warnings,
  ignored,
}: {
  document: Record<string, unknown>
  path: string
  pathItem: Record<string, unknown>
  method: string
  operation: Record<string, unknown>
  index: number
  warnings: string[]
  ignored: string[]
}) {
  const name = text(
    operation.summary,
    text(operation.operationId, `${method.toUpperCase()} ${path}`),
  )
  const id = importId("openapi", index, text(operation.operationId, name))
  const request = importedHttpRequest(
    id,
    name,
    method,
    `${resolveServerUrl(document, operation)}${path}`,
  )
  const parameters = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ]
  request.path = parameterEntries(parameters, "path", id)
  request.query = parameterEntries(parameters, "query", id)
  request.headers = parameterEntries(parameters, "header", id)
  request.auth = openApiAuth(document, operation, warnings, name)
  openApiBody(request, operation)
  const responses = record(operation.responses)
  const success = Object.keys(responses ?? {}).find((status) => /^2\d\d$/.test(status))
  if (success) request.assertions = [{ id: `${id}-status`, expression: `status == ${success}` }]
  if (operation.callbacks) ignored.push(`${name}: callbacks`)
  return request
}

export function importOpenApiDocument(value: unknown): HttpImportReport {
  const document = record(value)
  const paths = record(document?.paths)
  if (!document || !paths || !String(document.openapi ?? "").startsWith("3.")) {
    throw new Error("Documento OpenAPI 3.x inválido.")
  }
  const requests: HttpRequestDefinition[] = []
  const ignored: string[] = []
  const warnings: string[] = []
  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = record(rawPathItem)
    if (!pathItem) continue
    for (const method of METHODS) {
      const operation = record(pathItem[method])
      if (!operation) continue
      requests.push(
        importOpenApiOperation({
          document,
          path,
          pathItem,
          method,
          operation,
          index: requests.length,
          warnings,
          ignored,
        }),
      )
    }
  }
  if (document.webhooks) ignored.push("webhooks")
  if (!requests.length) throw new Error("O documento OpenAPI não contém operações suportadas.")
  return { format: "openapi", requests, ignored, warnings }
}
