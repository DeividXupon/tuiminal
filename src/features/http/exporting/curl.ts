import type { HttpPreparedRequest } from "../model/types"
import { httpHeaderSensitivity } from "../model/key-value"

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function redactSensitiveQuery(urlSource: string) {
  const url = new URL(urlSource)
  for (const name of [...url.searchParams.keys()]) {
    if (httpHeaderSensitivity(name) !== "normal") url.searchParams.set(name, "<redacted>")
  }
  return url.toString()
}

export function exportPreparedRequestAsCurl(
  request: HttpPreparedRequest,
  { revealSecrets = false }: { revealSecrets?: boolean } = {},
) {
  const url = revealSecrets ? request.url : redactSensitiveQuery(request.url)
  const parts = ["curl", "--request", shellQuote(request.method), "--url", shellQuote(url)]
  for (const [name, rawValue] of request.headers) {
    const value =
      !revealSecrets && httpHeaderSensitivity(name) !== "normal" ? "<redacted>" : rawValue
    parts.push("--header", shellQuote(`${name}: ${value}`))
  }
  if (request.body !== undefined) parts.push("--data-raw", shellQuote(request.body))
  if (request.followRedirects) parts.push("--location")
  return parts.join(" ")
}
