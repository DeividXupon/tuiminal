import type { HttpAuth, HttpKeyValue, HttpRequestDefinition } from "../model/types"
import { importId, importedHttpRequest, record, text, type HttpImportReport } from "./shared"
import { createOpenApiRecordResolver, type OpenApiRecordResolver } from "./openapi-references"

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"]

function directSchemaExample(schema: Record<string, unknown>) {
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (schema.const !== undefined) return schema.const
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0]
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  return undefined
}

function alternativeSchema(schema: Record<string, unknown>) {
  if (Array.isArray(schema.oneOf)) return schema.oneOf[0]
  if (Array.isArray(schema.anyOf)) return schema.anyOf[0]
  return undefined
}

function exampleFromSchema(
  value: unknown,
  resolveRecord: OpenApiRecordResolver,
  label: string,
  depth = 0,
): unknown {
  const schema = resolveRecord(value, label)
  if (!schema || depth > 6) return null
  const directExample = directSchemaExample(schema)
  if (directExample !== undefined) return directExample
  const alternative = alternativeSchema(schema)
  if (alternative !== undefined) {
    return exampleFromSchema(alternative, resolveRecord, label, depth + 1)
  }
  if (Array.isArray(schema.allOf)) {
    const values = schema.allOf.map((part) =>
      exampleFromSchema(part, resolveRecord, label, depth + 1),
    )
    return values.every((part) => record(part))
      ? Object.assign({}, ...(values as Record<string, unknown>[]))
      : values[0]
  }
  if (schema.type === "object" || record(schema.properties)) {
    return Object.fromEntries(
      Object.entries(record(schema.properties) ?? {}).map(([name, property]) => [
        name,
        exampleFromSchema(property, resolveRecord, `${label}.${name}`, depth + 1),
      ]),
    )
  }
  if (schema.type === "array") {
    return [exampleFromSchema(schema.items, resolveRecord, `${label}[]`, depth + 1)]
  }
  if (schema.type === "integer" || schema.type === "number") return 0
  if (schema.type === "boolean") return false
  return "string"
}

function printableValue(value: unknown) {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  return typeof value === "object" ? JSON.stringify(value) : String(value)
}

function parameterValue(
  parameter: Record<string, unknown>,
  resolveRecord: OpenApiRecordResolver,
  label: string,
) {
  if (parameter.example !== undefined) return printableValue(parameter.example)
  const examples = record(parameter.examples)
  const firstExample = examples ? resolveRecord(Object.values(examples)[0], label) : null
  if (firstExample?.value !== undefined) return printableValue(firstExample.value)
  const schema = resolveRecord(parameter.schema, label)
  if (schema?.default !== undefined) return printableValue(schema.default)
  if (schema?.example !== undefined) return printableValue(schema.example)
  if (schema?.const !== undefined) return printableValue(schema.const)
  return `{{${text(parameter.name)}}}`
}

function parameterEntries(
  parameters: Record<string, unknown>[],
  location: string,
  id: string,
  resolveRecord: OpenApiRecordResolver,
  label: string,
): HttpKeyValue[] {
  return parameters.flatMap((value, index) => {
    const name = text(value.name)
    if (value.in !== location || !name) return []
    if (location === "header" && /^(accept|content-type|authorization)$/i.test(name)) return []
    return [
      {
        id: `${id}-${location}-${index}`,
        enabled: true,
        name,
        value: parameterValue(value, resolveRecord, `${label}: parâmetro ${name}`),
        sensitivity: "normal",
      },
    ]
  })
}

function resolveServerUrl(
  document: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  operation: Record<string, unknown>,
) {
  const servers = Array.isArray(operation.servers)
    ? operation.servers
    : Array.isArray(pathItem.servers)
      ? pathItem.servers
      : Array.isArray(document.servers)
        ? document.servers
        : []
  const server = record(servers[0])
  let url = text(server?.url, "http://localhost")
  const variables = record(server?.variables)
  url = url.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const variable = record(variables?.[name])
    const value = text(variable?.default)
    return value ? encodeURIComponent(value) : `{{${name}}}`
  })
  const expanded = url.replace(/\/$/, "")
  if (/^https?:\/\//i.test(expanded)) return expanded
  return expanded.startsWith("/") ? `http://localhost${expanded}` : `http://localhost/${expanded}`
}

function mediaExample(
  media: Record<string, unknown>,
  resolveRecord: OpenApiRecordResolver,
  label: string,
) {
  if (media.example !== undefined) return media.example
  const examples = record(media.examples)
  const first = examples ? resolveRecord(Object.values(examples)[0], label) : null
  if (first?.value !== undefined) return first.value
  return exampleFromSchema(media.schema, resolveRecord, label)
}

function openApiBody(
  request: HttpRequestDefinition,
  operation: Record<string, unknown>,
  resolveRecord: OpenApiRecordResolver,
) {
  const requestBody = resolveRecord(operation.requestBody, `${request.name}: request body`)
  const content = record(requestBody?.content)
  if (!content) return
  const contentType =
    ["application/json", "application/x-www-form-urlencoded", "multipart/form-data"].find(
      (candidate) => candidate in content,
    ) ?? Object.keys(content)[0]
  if (!contentType) return
  const media = record(content[contentType])
  const example = media
    ? mediaExample(media, resolveRecord, `${request.name}: schema do body`)
    : null
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
    const schema = resolveRecord(media?.schema, `${request.name}: schema multipart`)
    const properties = record(schema?.properties)
    request.body = {
      kind: "multipart",
      text: "",
      form: [],
      multipart: Object.entries(fields).map(([name, value], index) => {
        const property = resolveRecord(
          properties?.[name],
          `${request.name}: campo multipart ${name}`,
        )
        const file = property?.format === "binary"
        return {
          id: `${request.id}-multipart-${index}`,
          enabled: true,
          name,
          value: file ? `{{${name}_file}}` : printableValue(value),
          kind: file ? ("file" as const) : ("text" as const),
          sensitivity: "normal" as const,
        }
      }),
    }
  } else {
    request.body = {
      kind: contentType.includes("xml") ? "xml" : "text",
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
  resolveRecord: OpenApiRecordResolver,
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
  const scheme = schemeName
    ? resolveRecord(schemes?.[schemeName], `${name}: autenticação ${schemeName}`)
    : null
  if (!scheme || !schemeName) return { kind: "none" }
  if (scheme.type === "apiKey") {
    if (scheme.in === "cookie") {
      warnings.push(`${name}: esquema de autenticação ${schemeName} não suportado.`)
      return { kind: "none" }
    }
    warnings.push(`${name}: credencial ${schemeName} importada como variável.`)
    return {
      kind: "api-key",
      placement: scheme.in === "query" ? "query" : "header",
      name: text(scheme.name, "X-API-Key"),
      value: `{{${schemeName}}}`,
    }
  }
  if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "basic") {
    warnings.push(`${name}: credencial ${schemeName} importada como variável.`)
    return {
      kind: "basic",
      username: `{{${schemeName}_username}}`,
      password: `{{${schemeName}_password}}`,
    }
  }
  if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") {
    warnings.push(`${name}: credencial ${schemeName} importada como variável.`)
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
  resolveRecord,
}: {
  document: Record<string, unknown>
  path: string
  pathItem: Record<string, unknown>
  method: string
  operation: Record<string, unknown>
  index: number
  warnings: string[]
  ignored: string[]
  resolveRecord: OpenApiRecordResolver
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
    `${resolveServerUrl(document, pathItem, operation)}${path}`,
  )
  const parameters = resolvedParameters(pathItem, operation, resolveRecord, name)
  request.path = parameterEntries(parameters, "path", id, resolveRecord, name)
  request.query = parameterEntries(parameters, "query", id, resolveRecord, name)
  request.headers = parameterEntries(parameters, "header", id, resolveRecord, name)
  const cookieParameters = parameters.filter((parameter) => parameter.in === "cookie")
  if (cookieParameters.length) ignored.push(`${name}: parâmetros cookie`)
  request.auth = openApiAuth(document, operation, resolveRecord, warnings, name)
  openApiBody(request, operation, resolveRecord)
  const responses = record(operation.responses)
  const success = Object.keys(responses ?? {}).find((status) => /^2\d\d$/.test(status))
  if (success) request.assertions = [{ id: `${id}-status`, expression: `status == ${success}` }]
  if (operation.callbacks) ignored.push(`${name}: callbacks`)
  return request
}

function resolvedParameters(
  pathItem: Record<string, unknown>,
  operation: Record<string, unknown>,
  resolveRecord: OpenApiRecordResolver,
  name: string,
) {
  const entries = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ]
  const result = new Map<string, Record<string, unknown>>()
  for (const entry of entries) {
    const parameter = resolveRecord(entry, `${name}: parâmetro`)
    if (!parameter) continue
    const parameterName = text(parameter.name)
    const location = text(parameter.in)
    if (!parameterName || !location) continue
    result.set(`${location}\0${parameterName}`, parameter)
  }
  return [...result.values()]
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
  const resolveRecord = createOpenApiRecordResolver(document, warnings)
  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = resolveRecord(rawPathItem, `${path}: path item`)
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
          resolveRecord,
        }),
      )
    }
  }
  if (document.webhooks) ignored.push("webhooks")
  if (!requests.length) throw new Error("O documento OpenAPI não contém operações suportadas.")
  return { format: "openapi", requests, ignored, warnings }
}
