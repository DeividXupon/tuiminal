import type { HttpMultipartPart, HttpRequestDefinition } from "./types"

type ParsedBodyBlock = {
  blockId: string
  body: string
  headers: Array<[string, string]>
}

function multipartBoundary(contentType: string | undefined) {
  return contentType
    ?.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)
    ?.slice(1)
    .find(Boolean)
}

function parsedMultipartPart(
  rawPart: string,
  index: number,
  blockId: string,
): HttpMultipartPart | null {
  const part = rawPart.replace(/^\r?\n|\r?\n$/g, "")
  if (!part || part === "--") return null
  const split = part.search(/\r?\n\r?\n/)
  if (split < 0) return null

  const head = part.slice(0, split)
  const value = part
    .slice(split)
    .replace(/^\r?\n\r?\n/, "")
    .replace(/\r?\n--$/, "")
  const disposition = head.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] ?? ""
  const name = disposition.match(/name="([^"]*)"/i)?.[1]
  if (!name) return null

  const filePath = value.match(/^<\s+(.+?)\s*$/)?.[1]
  return {
    id: `${blockId}-multipart-${index}`,
    enabled: true,
    name,
    value: filePath ?? value,
    kind: filePath ? "file" : "text",
    sensitivity: "normal",
  }
}

function parsedMultipartBody(
  block: ParsedBodyBlock,
  contentType: string | undefined,
): HttpRequestDefinition["body"] | null {
  const boundary = multipartBoundary(contentType)
  if (!boundary) return null
  const multipart = block.body
    .split(`--${boundary}`)
    .map((part, index) => parsedMultipartPart(part, index, block.blockId))
    .filter((part): part is HttpMultipartPart => part !== null)
  return multipart.length ? { kind: "multipart", text: "", form: [], multipart } : null
}

export function parseHttpRequestBody(block: ParsedBodyBlock): HttpRequestDefinition["body"] {
  if (!block.body) return { kind: "none", text: "", form: [] }
  const fileBody = block.body.match(/^<\s+(.+?)\s*$/)
  if (fileBody?.[1]) return { kind: "file", text: "", form: [], filePath: fileBody[1] }

  const contentType = block.headers.find(([name]) => name.toLowerCase() === "content-type")?.[1]
  const multipart = parsedMultipartBody(block, contentType)
  if (multipart) return multipart
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

function serializedMultipartBody(request: HttpRequestDefinition, eol: string) {
  const boundary = `TuiminalBoundary${request.id.replace(/[^a-z0-9]/gi, "").slice(-12)}`
  const parts = (request.body.multipart ?? []).filter((part) => part.enabled && part.name.trim())
  const body = parts
    .flatMap((part) => [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${part.name.replaceAll('"', "")}"${
        part.kind === "file" ? `; filename="${part.value.split(/[\\/]/).at(-1) ?? "file"}"` : ""
      }`,
      "",
      part.kind === "file" ? `< ${part.value}` : part.value,
    ])
    .concat(`--${boundary}--`)
    .join(eol)
  const hasContentType = request.headers.some(
    (header) => header.name.toLowerCase() === "content-type",
  )
  const headers = hasContentType
    ? request.headers
    : [
        ...request.headers,
        {
          id: `${request.id}-multipart-content-type`,
          enabled: true,
          name: "Content-Type",
          value: `multipart/form-data; boundary=${boundary}`,
          sensitivity: "normal" as const,
        },
      ]
  return { headers, body }
}

export function serializeHttpRequestBody(request: HttpRequestDefinition, eol: string) {
  if (request.body.kind === "none") return { headers: request.headers, body: "" }
  if (request.body.kind === "form") {
    const params = new URLSearchParams()
    for (const entry of request.body.form) {
      if (entry.enabled && entry.name.trim()) params.append(entry.name, entry.value)
    }
    return { headers: request.headers, body: params.toString() }
  }
  if (request.body.kind === "file") {
    return { headers: request.headers, body: `< ${request.body.filePath ?? ""}` }
  }
  if (request.body.kind === "multipart") return serializedMultipartBody(request, eol)
  return { headers: request.headers, body: request.body.text }
}
