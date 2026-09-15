import { serializeHttpRequestBody } from "./http-file-body"
import type { HttpKeyValue, HttpRequestDefinition } from "./types"

function safeRequestName(name: string) {
  return name.replace(/[\r\n]+/g, " ").trim() || "Request"
}

function stableRequestName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "request"
}

function serializedUrl(request: HttpRequestDefinition) {
  const query = request.query
    .filter((entry) => entry.enabled && entry.name.trim())
    .map((entry) => {
      const value = /\{\{[^{}]+\}\}/.test(entry.value)
        ? entry.value
        : encodeURIComponent(entry.value)
      return `${encodeURIComponent(entry.name)}=${value}`
    })
    .join("&")
  return query ? `${request.url}${request.url.includes("?") ? "&" : "?"}${query}` : request.url
}

function keyValueDirectives(name: "query" | "path", entries: HttpKeyValue[]) {
  return entries.map(
    (entry) =>
      `# @${name} ${JSON.stringify({
        enabled: entry.enabled,
        name: entry.name,
        value: entry.value,
        sensitivity: entry.sensitivity,
      })}`,
  )
}

function optionDirectives(request: HttpRequestDefinition) {
  const lines: string[] = []
  const timeoutExplicit = request.options.timeoutExplicit ?? request.options.timeoutMs !== 30_000
  const redirectsExplicit =
    request.options.followRedirectsExplicit ?? !request.options.followRedirects
  if (timeoutExplicit) lines.push(`# @timeout ${request.options.timeoutMs} ms`)
  if (redirectsExplicit) {
    lines.push(request.options.followRedirects ? "# @follow-redirects" : "# @no-redirect")
  }
  if (request.options.noLog) lines.push("# @no-log")
  if (request.options.cookieJar === false) lines.push("# @no-cookie-jar")
  if (request.options.proxy?.trim()) lines.push(`# @proxy ${request.options.proxy.trim()}`)
  if (request.options.tlsVerification === "insecure") lines.push("# @insecure-tls")
  return lines
}

function chainDirectives(request: HttpRequestDefinition) {
  const lines: string[] = []
  if (request.chain?.dependsOn) lines.push(`# @depends ${request.chain.dependsOn}`)
  for (const extraction of request.chain?.extract ?? []) {
    lines.push(
      `# @extract${extraction.secret ? "-secret" : ""} ${extraction.name} = ${extraction.jsonPath}`,
    )
  }
  return lines
}

function requestDirectives(request: HttpRequestDefinition) {
  const auth = request.auth.kind === "none" ? [] : [`# @auth ${JSON.stringify(request.auth)}`]
  const assertions = (request.assertions ?? []).map(
    (assertion) => `# @assert ${assertion.expression}`,
  )
  const chain = chainDirectives(request)
  return [
    ...chain.slice(0, request.chain?.dependsOn ? 1 : 0),
    ...auth,
    ...keyValueDirectives("query", request.query),
    ...keyValueDirectives("path", request.path),
    ...optionDirectives(request),
    ...chain.slice(request.chain?.dependsOn ? 1 : 0),
    ...assertions,
  ]
}

export function serializeHttpRequestBlock(request: HttpRequestDefinition, eol = "\n") {
  const safeName = safeRequestName(request.name)
  const lines = [
    `### ${safeName}`,
    `# @name ${stableRequestName(safeName)}`,
    ...requestDirectives(request),
    `${request.method} ${serializedUrl(request)}`,
  ]
  const serialized = serializeHttpRequestBody(request, eol)
  for (const header of serialized.headers) {
    if (header.enabled && header.name.trim()) lines.push(`${header.name.trim()}: ${header.value}`)
  }
  if (serialized.body) lines.push("", serialized.body)
  return `${lines.join(eol)}${eol}`
}
