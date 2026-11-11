import {
  Request,
  QueryParam,
  type RequestDefinition,
  type RequestBodyDefinition,
} from "postman-collection"
import type { HttpRequestDefinition } from "../model/types"
import { syncHttpUrlQuery, urlQueryEntryPrefix } from "../model/url-query"

function scriptBody(body: HttpRequestDefinition["body"]): RequestBodyDefinition {
  if (body.kind === "form")
    return {
      mode: "urlencoded",
      urlencoded: body.form
        .filter((entry) => entry.enabled)
        .map((entry) => ({ key: entry.name, value: entry.value })),
    }
  if (body.kind === "multipart")
    return {
      mode: "formdata",
      formdata: (body.multipart ?? [])
        .filter((entry) => entry.enabled)
        .map((entry) => ({
          key: entry.name,
          type: entry.kind,
          ...(entry.kind === "file" ? { src: entry.value } : { value: entry.value }),
        })),
    }
  if (body.kind === "file") return { mode: "file", file: { src: body.filePath ?? "" } }
  return { mode: "raw", raw: body.text }
}
export function httpScriptRequest(request: HttpRequestDefinition) {
  const sdk = new Request({
    url: request.url,
    method: request.method,
    header: request.headers.filter((h) => h.enabled).map((h) => ({ key: h.name, value: h.value })),
    body: scriptBody(request.body),
  })
  for (const entry of request.query)
    if (entry.enabled && !entry.id.startsWith(urlQueryEntryPrefix(request.id)))
      sdk.url.query.add(new QueryParam({ key: entry.name, value: entry.value }))
  return sdk
}
export function applyHttpScriptRequest(
  request: HttpRequestDefinition,
  initial: Request,
  data?: RequestDefinition,
) {
  const updated = new Request(data ?? initial.toJSON())
  const url = updated.url.toString()
  const body =
    JSON.stringify(updated.body?.toJSON()) === JSON.stringify(initial.body?.toJSON())
      ? request.body
      : changedBody(request.body, updated)
  return {
    ...request,
    url,
    method: updated.method,
    query: syncHttpUrlQuery(url, [], request.id),
    body,
    headers: updated.headers.all().map(
      (h, index) =>
        request.headers.find(
          (entry) => entry.enabled && entry.name === h.key && entry.value === h.value,
        ) ?? {
          id: `script-header-${index}`,
          name: h.key,
          value: h.value,
          enabled: true,
          sensitivity: "literal-secret" as const,
        },
    ),
  }
}
function changedBody(
  original: HttpRequestDefinition["body"],
  request: Request,
): HttpRequestDefinition["body"] {
  if (request.body?.mode === "raw")
    return {
      ...original,
      kind: original.kind === "json" || original.kind === "xml" ? original.kind : "text",
      text: request.body.raw ?? "",
    }
  if (request.body?.mode === "urlencoded")
    return {
      ...original,
      kind: "form",
      form: (request.body.urlencoded?.all() ?? []).map((entry, index) => ({
        id: `script-form-${index}`,
        name: entry.key ?? "",
        value: entry.value ?? "",
        enabled: !entry.disabled,
        sensitivity: "literal-secret",
      })),
    }
  throw new Error("Scripts can update raw or URL-encoded request bodies")
}
