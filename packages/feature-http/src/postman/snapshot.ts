import type { HttpAuth, HttpRequestDefinition } from "../model/types"
import { urlQueryEntryPrefix } from "../model/url-query"

export type Snapshot = {
  scripts?: HttpRequestDefinition["scripts"]
  description?: string
  name: string
  method: string
  url: string
  headers: Array<{ key: string; value: string; enabled: boolean }>
  path: Array<{ key: string; value: string; enabled: boolean }>
  auth: HttpAuth
  body: HttpRequestDefinition["body"]
}

function requestUrl(request: HttpRequestDefinition) {
  const query = request.query
    .filter((entry) => !entry.id.startsWith(urlQueryEntryPrefix(request.id)))
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

export function postmanRequestSnapshot(request: HttpRequestDefinition): Snapshot {
  return {
    scripts: request.scripts ?? { preRequest: "", postResponse: "" },
    name: request.name,
    method: request.method,
    url: requestUrl(request),
    headers: request.headers.map((entry) => ({
      key: entry.name,
      value: entry.value,
      enabled: entry.enabled,
    })),
    path: request.path.map((entry) => ({
      key: entry.name,
      value: entry.value,
      enabled: entry.enabled,
    })),
    auth: request.auth,
    body: request.body,
    ...(request.description !== undefined ? { description: request.description } : {}),
  }
}
