import { createHash } from "node:crypto"
import type {
  HttpAssertionDefinition,
  HttpAuth,
  HttpChainExtraction,
  HttpKeyValue,
  HttpRequestDefinition,
} from "./types"
import { httpHeaderSensitivity } from "./key-value"
import { parseHttpRequestBody } from "./http-file-body"
import { serializeHttpRequestBlock } from "./http-file-serialization"
import {
  findHttpRequestStart,
  hasHttpDirective,
  httpDirectiveValue,
  parseHttpRedirectDirective,
  parseHttpTimeout,
  usesOpaqueHttpSyntax,
} from "./http-file-syntax"

export { serializeHttpRequestBlock } from "./http-file-serialization"

export type HttpFileRequestBlock = {
  blockId: string
  name: string
  method: string
  url: string
  headers: Array<[string, string]>
  body: string
  start: number
  end: number
  editable: boolean
  assertions: HttpAssertionDefinition[]
  chain: { dependsOn?: string; extract: HttpChainExtraction[] }
  auth?: HttpAuth
  options: {
    timeoutMs: number
    followRedirects: boolean
    timeoutExplicit?: boolean
    followRedirectsExplicit?: boolean
    noLog: boolean
  }
  query: HttpKeyValue[]
  path: HttpKeyValue[]
}

export type ParsedHttpFile = {
  path: string
  source: string
  sourceHash: string
  variables: Record<string, string>
  requests: HttpFileRequestBlock[]
}

type SourceLine = { start: number; end: number; text: string }

const HEADER_LINE = /^([^:\s]+)\s*:\s*(.*)$/
const VARIABLE_LINE = /^@([A-Za-z_$][\w$.-]*)\s*=\s*(.*)$/

export function hashHttpSource(source: string) {
  return createHash("sha256").update(source).digest("hex")
}

function sourceLines(source: string) {
  const lines: SourceLine[] = []
  let start = 0
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\n") continue
    const rawEnd = index > start && source[index - 1] === "\r" ? index - 1 : index
    lines.push({ start, end: index + 1, text: source.slice(start, rawEnd) })
    start = index + 1
  }
  if (start < source.length || source.length === 0) {
    lines.push({ start, end: source.length, text: source.slice(start) })
  }
  return lines
}

function requestName(lines: SourceLine[], fallback: string) {
  const separator = lines[0]?.text.match(/^\s*###\s*(.*?)\s*$/)
  if (separator?.[1]) return separator[1]
  for (const line of lines) {
    const directive = httpDirectiveValue(line.text, "name")
    if (directive) return directive
  }
  return fallback
}

function parsedAuth(lines: SourceLine[]): HttpAuth | undefined {
  const source = lines.map((line) => httpDirectiveValue(line.text, "auth")).find(Boolean)
  if (!source) return undefined
  try {
    const value = JSON.parse(source) as Record<string, unknown>
    if (value.kind === "none") return { kind: "none" }
    if (value.kind === "bearer" && typeof value.token === "string") {
      return { kind: "bearer", token: value.token }
    }
    if (
      value.kind === "basic" &&
      typeof value.username === "string" &&
      typeof value.password === "string"
    ) {
      return { kind: "basic", username: value.username, password: value.password }
    }
    if (
      value.kind === "api-key" &&
      (value.placement === "header" || value.placement === "query") &&
      typeof value.name === "string" &&
      typeof value.value === "string"
    ) {
      return { kind: "api-key", placement: value.placement, name: value.name, value: value.value }
    }
  } catch {
    return undefined
  }
  return undefined
}

function parsedKeyValueDirectives(lines: SourceLine[], name: "query" | "path", blockId: string) {
  return lines.flatMap((line, index): HttpKeyValue[] => {
    const source = httpDirectiveValue(line.text, name)
    if (!source) return []
    try {
      const value = JSON.parse(source) as Record<string, unknown>
      if (typeof value.name !== "string" || typeof value.value !== "string") return []
      return [
        {
          id: `${blockId}-${name}-${index}`,
          enabled: value.enabled !== false,
          name: value.name,
          value: value.value,
          sensitivity:
            value.sensitivity === "secret-ref" || value.sensitivity === "literal-secret"
              ? value.sensitivity
              : "normal",
        },
      ]
    } catch {
      return []
    }
  })
}

function urlParts(url: string, id: string) {
  const question = url.indexOf("?")
  if (question < 0) return { url, query: [] as HttpKeyValue[] }
  const query = url
    .slice(question + 1)
    .split("&")
    .flatMap((part, index): HttpKeyValue[] => {
      if (!part) return []
      const separator = part.indexOf("=")
      const decode = (value: string) => {
        try {
          return decodeURIComponent(value.replaceAll("+", " "))
        } catch {
          return value
        }
      }
      const name = decode(separator < 0 ? part : part.slice(0, separator))
      const value = decode(separator < 0 ? "" : part.slice(separator + 1))
      return [{ id: `${id}-query-${index}`, enabled: true, name, value, sensitivity: "normal" }]
    })
  return { url: url.slice(0, question), query }
}

function parseHeaders(lines: SourceLine[], lastUrlLine: number) {
  const headers: Array<[string, string]> = []
  let bodyStart = -1
  let editable = true
  for (let index = lastUrlLine + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
    if (!line.text.trim()) {
      bodyStart = line.end
      break
    }
    if (/^\s*(?:#|\/\/)/.test(line.text)) continue
    const header = line.text.match(HEADER_LINE)
    if (!header?.[1]) {
      editable = false
      bodyStart = line.start
      break
    }
    headers.push([header[1], header[2] ?? ""])
  }
  return { headers, bodyStart, editable }
}

function parseSection(
  source: string,
  lines: SourceLine[],
  path: string,
  index: number,
): HttpFileRequestBlock | null {
  const requestStart = findHttpRequestStart(lines.map((line) => line.text))
  if (!requestStart) return null
  const requestLine = lines[requestStart.index]
  if (!requestLine) return null
  const name = requestName(lines, `${requestStart.method} ${requestStart.url}`)
  const directive = lines.map((line) => httpDirectiveValue(line.text, "name")).find(Boolean)
  const blockId = directive || `${index + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  const stableBlockId = `${path}#${blockId}`
  const parsedHeaders = parseHeaders(lines, requestStart.lastUrlLine)
  const assertions = lines.flatMap((line, assertionIndex) => {
    const expression = httpDirectiveValue(line.text, "assert")
    return expression ? [{ id: `${path}#assert-${index}-${assertionIndex}`, expression }] : []
  })
  const dependsOn = lines.map((line) => httpDirectiveValue(line.text, "depends")).find(Boolean)
  const extract = lines.flatMap((line): HttpChainExtraction[] => {
    const secretSource = httpDirectiveValue(line.text, "extract-secret")
    const publicSource = httpDirectiveValue(line.text, "extract")
    const source = secretSource ?? publicSource
    const match = source?.match(/^([A-Za-z_$][\w$.-]*)\s*=\s*(\S+)\s*$/i)
    return match?.[1] && match[2]
      ? [{ name: match[1], jsonPath: match[2], secret: secretSource !== null }]
      : []
  })
  const auth = parsedAuth(lines)
  const lineSources = lines.map((line) => line.text)
  const timeout = parseHttpTimeout(lineSources)
  const redirectDirective = parseHttpRedirectDirective(lineSources)
  const startsWithSeparator = /^\s*###/.test(lines[0]?.text ?? "")
  const start = startsWithSeparator ? (lines[0]?.start ?? requestLine.start) : requestLine.start
  const end = lines.at(-1)?.end ?? requestLine.end
  const body =
    parsedHeaders.bodyStart >= 0 ? source.slice(parsedHeaders.bodyStart, end).trimEnd() : ""
  return {
    blockId: stableBlockId,
    name,
    method: requestStart.method,
    url: requestStart.url,
    headers: parsedHeaders.headers,
    body,
    start,
    end,
    editable: parsedHeaders.editable && !usesOpaqueHttpSyntax(lineSources),
    assertions,
    chain: { ...(dependsOn ? { dependsOn } : {}), extract },
    ...(auth ? { auth } : {}),
    options: {
      timeoutMs: timeout ?? 30_000,
      followRedirects: redirectDirective !== "manual",
      ...(timeout !== null ? { timeoutExplicit: true } : {}),
      ...(redirectDirective ? { followRedirectsExplicit: true } : {}),
      noLog: hasHttpDirective(lineSources, "no-log"),
    },
    query: parsedKeyValueDirectives(lines, "query", stableBlockId),
    path: parsedKeyValueDirectives(lines, "path", stableBlockId),
  }
}

export function parseHttpFile(source: string, path: string): ParsedHttpFile {
  const lines = sourceLines(source)
  const sourceHash = hashHttpSource(source)
  const variables: Record<string, string> = {}
  for (const line of lines) {
    const variable = line.text.trim().match(VARIABLE_LINE)
    if (variable?.[1]) variables[variable[1]] = variable[2] ?? ""
  }

  const boundaries = lines
    .map((line, index) => (/^\s*###(?:\s|$)/.test(line.text) ? index : -1))
    .filter((index) => index >= 0)
  const sections: SourceLine[][] = []
  if (boundaries.length === 0) sections.push(lines)
  else {
    if ((boundaries[0] ?? 0) > 0) sections.push(lines.slice(0, boundaries[0]))
    for (let index = 0; index < boundaries.length; index += 1) {
      sections.push(lines.slice(boundaries[index], boundaries[index + 1] ?? lines.length))
    }
  }

  const requests = sections
    .map((section, index) => parseSection(source, section, path, index))
    .filter((request): request is HttpFileRequestBlock => request !== null)
  return { path, source, sourceHash, variables, requests }
}

function keyValue(id: string, index: number, [name, value]: [string, string]): HttpKeyValue {
  return {
    id: `${id}-header-${index}`,
    enabled: true,
    name,
    value,
    sensitivity: httpHeaderSensitivity(name),
  }
}

export function requestFromHttpFile(
  file: ParsedHttpFile,
  block: HttpFileRequestBlock,
): HttpRequestDefinition {
  const parsedUrl = urlParts(block.url, block.blockId)
  return {
    id: block.blockId,
    source: {
      kind: "file",
      path: file.path,
      blockId: block.blockId,
      sourceHash: file.sourceHash,
      supported: block.editable,
    },
    name: block.name,
    method: block.method,
    url: parsedUrl.url,
    query: block.query.length ? block.query : parsedUrl.query,
    path: block.path,
    headers: block.headers.map((header, index) => keyValue(block.blockId, index, header)),
    auth: block.auth ?? { kind: "none" },
    body: parseHttpRequestBody(block),
    options: block.options,
    assertions: block.assertions,
    chain: block.chain,
  }
}

export function replaceHttpRequestBlock(
  file: ParsedHttpFile,
  block: HttpFileRequestBlock,
  request: HttpRequestDefinition,
) {
  const eol = file.source.includes("\r\n") ? "\r\n" : "\n"
  return `${file.source.slice(0, block.start)}${serializeHttpRequestBlock(request, eol)}${file.source.slice(block.end)}`
}
