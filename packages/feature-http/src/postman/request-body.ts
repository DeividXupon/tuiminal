import type { HttpRequestDefinition } from "../model/types"

type Body = HttpRequestDefinition["body"]

export function postmanRequestBody(body: Body): Record<string, unknown> {
  // These are request-item API fields, not Collection v2.1 body fields.
  // File values are references only; saving a request never uploads file bytes.
  const reset = { data: [], rawModeData: "", dataOptions: null }
  switch (body.kind) {
    case "none":
      return { ...reset, dataMode: "none" }
    case "form":
      return {
        ...reset,
        dataMode: "urlencoded",
        data: body.form.map((entry) => ({
          key: entry.name,
          value: entry.value,
          enabled: entry.enabled,
          type: "text",
        })),
      }
    case "multipart":
      return {
        ...reset,
        dataMode: "formdata",
        data: (body.multipart ?? []).map((part) => ({
          key: part.name,
          value: part.value,
          enabled: part.enabled,
          type: part.kind,
        })),
      }
    case "file":
      return { ...reset, dataMode: "binary", rawModeData: body.filePath ?? "" }
    default:
      return {
        ...reset,
        dataMode: "raw",
        rawModeData: body.text,
        dataOptions: { raw: { language: body.kind } },
      }
  }
}

export function postmanBodyHeaders<T extends { key: string; value: string }>(
  headers: T[],
  body: Body,
) {
  if (body.kind !== "multipart") return headers
  // Postman must generate a boundary matching its own multipart encoding.
  return headers.filter(
    (header) =>
      !(
        header.key.toLowerCase() === "content-type" &&
        /^multipart\/form-data(?:\s*;|$)/i.test(header.value.trim())
      ),
  )
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function postmanMultipartHeaders(remoteRequest: unknown) {
  const headers = record(remoteRequest).header
  if (!Array.isArray(headers)) return []
  return headers.flatMap((value) => {
    const { disabled, ...header } = record(value)
    if (typeof header.key !== "string" || typeof header.value !== "string") return []
    return postmanBodyHeaders(
      [{ ...header, key: header.key, value: header.value, enabled: disabled !== true }],
      { kind: "multipart", text: "", form: [] },
    )
  })
}

function remoteFields(value: unknown, multipart: boolean) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  return value.flatMap((entry) => {
    const part = record(entry)
    const type = multipart && part.type === "file" ? "file" : "text"
    const source = type === "file" ? part.src : part.value
    const sources = Array.isArray(source) ? source : [source ?? ""]
    return sources.map((value) => ({
      key: part.key ?? "",
      value,
      enabled: part.disabled !== true,
      type,
    }))
  })
}

export function confirmPostmanRequestBody(body: Body, remoteRequest: unknown) {
  if (!["form", "multipart", "file"].includes(body.kind)) return
  const remote = record(record(remoteRequest).body)
  const expected = postmanRequestBody(body)
  const actual =
    body.kind === "file"
      ? { mode: remote.mode, value: record(remote.file).src ?? "" }
      : {
          mode: remote.mode,
          value: remoteFields(
            remote[body.kind === "form" ? "urlencoded" : "formdata"],
            body.kind === "multipart",
          ),
        }
  const target = {
    mode: body.kind === "file" ? "file" : expected.dataMode,
    value: body.kind === "file" ? expected.rawModeData : expected.data,
  }
  if (JSON.stringify(actual) !== JSON.stringify(target)) {
    throw new Error("Request enviada, mas a confirmação remota falhou. Reimporte a coleção.")
  }
}
