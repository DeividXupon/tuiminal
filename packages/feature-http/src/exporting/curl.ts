import type { HttpPreparedRequest } from "../model/types"
import { httpHeaderSensitivity } from "../model/key-value"
import { redactHttpUrlSecrets, redactKnownHttpSecrets } from "../model/secrets"

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function multipartValue(
  value: string,
  secret: boolean,
  revealSecrets: boolean,
  secretValues: readonly string[],
) {
  if (revealSecrets) return value
  return secret ? "<redacted>" : redactKnownHttpSecrets(value, secretValues)
}

function appendMultipartBody(
  parts: string[],
  descriptor: Extract<NonNullable<HttpPreparedRequest["bodyDescriptor"]>, { kind: "multipart" }>,
  revealSecrets: boolean,
  secretValues: readonly string[],
) {
  for (const part of descriptor.parts) {
    const secret = part.sensitivity !== "normal" || httpHeaderSensitivity(part.name) !== "normal"
    const value = multipartValue(part.value, secret, revealSecrets, secretValues)
    if (part.kind === "file") parts.push("--form", shellQuote(`${part.name}=@${value}`))
    else parts.push("--form-string", shellQuote(`${part.name}=${value}`))
  }
}

function appendPreparedBody(
  parts: string[],
  request: HttpPreparedRequest,
  revealSecrets: boolean,
  secretValues: readonly string[],
) {
  const descriptor = request.bodyDescriptor
  if (descriptor?.kind === "file") {
    const path = revealSecrets
      ? descriptor.path
      : redactKnownHttpSecrets(descriptor.path, secretValues)
    parts.push("--data-binary", shellQuote(`@${path}`))
    return
  }
  if (descriptor?.kind === "multipart") {
    appendMultipartBody(parts, descriptor, revealSecrets, secretValues)
    return
  }
  if (typeof request.body === "string") {
    const body = revealSecrets ? request.body : redactKnownHttpSecrets(request.body, secretValues)
    parts.push("--data-raw", shellQuote(body))
  } else if (request.body !== undefined) parts.push("--data-binary", shellQuote("<binary body>"))
}

export function exportPreparedRequestAsCurl(
  request: HttpPreparedRequest,
  {
    revealSecrets = false,
    secretValues = [],
  }: { revealSecrets?: boolean; secretValues?: readonly string[] } = {},
) {
  const url = revealSecrets ? request.url : redactHttpUrlSecrets(request.url, secretValues)
  const parts = ["curl", "--request", shellQuote(request.method), "--url", shellQuote(url)]
  for (const [name, rawValue] of request.headers) {
    const value = revealSecrets
      ? rawValue
      : httpHeaderSensitivity(name) !== "normal"
        ? "<redacted>"
        : redactKnownHttpSecrets(rawValue, secretValues)
    parts.push("--header", shellQuote(`${name}: ${value}`))
  }
  appendPreparedBody(parts, request, revealSecrets, secretValues)
  if (request.proxyUrl) {
    const proxy = revealSecrets
      ? request.proxyUrl
      : redactHttpUrlSecrets(request.proxyUrl, secretValues)
    parts.push("--proxy", shellQuote(proxy))
  }
  if (request.tlsVerification === "insecure") parts.push("--insecure")
  if (request.followRedirects) parts.push("--location")
  return parts.join(" ")
}
