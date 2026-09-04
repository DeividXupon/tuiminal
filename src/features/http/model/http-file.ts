import { createHash } from "node:crypto"
import type { HttpKeyValue, HttpRequestDefinition } from "./types"
import { httpHeaderSensitivity } from "./key-value"

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
}

export type ParsedHttpFile = {
  path: string
  source: string
  sourceHash: string
  variables: Record<string, string>
  requests: HttpFileRequestBlock[]
}

type SourceLine = { start: number; end: number; text: string }

const REQUEST_LINE = /^([!#$%&'*+.^_`|~\dA-Z-]+)\s+(\S+)(?:\s+HTTP\/\S+)?\s*$/i
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
    const directive = line.text.match(/^\s*#\s*@name\s+(.+?)\s*$/i)
    if (directive?.[1]) return directive[1]
  }
  return fallback
}

function parseHeaders(lines: SourceLine[], requestIndex: number) {
  const headers: Array<[string, string]> = []
  let bodyStart = -1
  let editable = true
  for (let index = requestIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
    if (!line.text.trim()) {
      bodyStart = line.end
      break
    }
    if (/^\s*#/.test(line.text)) continue
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
  const requestIndex = lines.findIndex((line) => REQUEST_LINE.test(line.text.trim()))
  if (requestIndex < 0) return null
  const requestLine = lines[requestIndex]
  const request = requestLine?.text.trim().match(REQUEST_LINE)
  if (!request?.[1] || !request[2] || !requestLine) return null
  const name = requestName(lines, `${request[1].toUpperCase()} ${request[2]}`)
  const directive = lines
    .map((line) => line.text.match(/^\s*#\s*@name\s+(.+?)\s*$/i)?.[1])
    .find(Boolean)
  const blockId = directive || `${index + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  const parsedHeaders = parseHeaders(lines, requestIndex)
  const startsWithSeparator = /^\s*###/.test(lines[0]?.text ?? "")
  const start = startsWithSeparator ? (lines[0]?.start ?? requestLine.start) : requestLine.start
  const end = lines.at(-1)?.end ?? requestLine.end
  const body =
    parsedHeaders.bodyStart >= 0 ? source.slice(parsedHeaders.bodyStart, end).trimEnd() : ""
  return {
    blockId: `${path}#${blockId}`,
    name,
    method: request[1].toUpperCase(),
    url: request[2],
    headers: parsedHeaders.headers,
    body,
    start,
    end,
    editable: parsedHeaders.editable,
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

function parsedBody(block: HttpFileRequestBlock): HttpRequestDefinition["body"] {
  if (!block.body) return { kind: "none", text: "", form: [] }
  const contentType = block.headers.find(([name]) => name.toLowerCase() === "content-type")?.[1]
  if (contentType?.toLowerCase().includes("json")) {
    return { kind: "json", text: block.body, form: [] }
  }
  if (contentType?.toLowerCase().includes("x-www-form-urlencoded")) {
    const form = [...new URLSearchParams(block.body)].map(([name, value], index) => ({
      id: `${block.blockId}-form-${index}`,
      enabled: true,
      name,
      value,
      sensitivity: "normal" as const,
    }))
    return { kind: "form", text: block.body, form }
  }
  return { kind: "text", text: block.body, form: [] }
}

export function requestFromHttpFile(
  file: ParsedHttpFile,
  block: HttpFileRequestBlock,
): HttpRequestDefinition {
  return {
    id: block.blockId,
    source: { kind: "file", path: file.path, blockId: block.blockId, sourceHash: file.sourceHash },
    name: block.name,
    method: block.method,
    url: block.url,
    query: [],
    path: [],
    headers: block.headers.map((header, index) => keyValue(block.blockId, index, header)),
    auth: { kind: "none" },
    body: parsedBody(block),
    options: { timeoutMs: 30_000, followRedirects: true },
  }
}

export function serializeHttpRequestBlock(request: HttpRequestDefinition, eol = "\n") {
  const safeName = request.name.replace(/[\r\n]+/g, " ").trim() || "Request"
  const stableName = safeName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "request"
  const lines = [`### ${safeName}`, `# @name ${stableName}`, `${request.method} ${request.url}`]
  for (const header of request.headers) {
    if (header.enabled && header.name.trim()) lines.push(`${header.name.trim()}: ${header.value}`)
  }
  if (request.body.kind !== "none") lines.push("", request.body.text)
  return `${lines.join(eol)}${eol}`
}

export function replaceHttpRequestBlock(
  file: ParsedHttpFile,
  block: HttpFileRequestBlock,
  request: HttpRequestDefinition,
) {
  const eol = file.source.includes("\r\n") ? "\r\n" : "\n"
  return `${file.source.slice(0, block.start)}${serializeHttpRequestBlock(request, eol)}${file.source.slice(block.end)}`
}
