import type { HttpResponseSnapshot } from "../model/types"

export function formatHttpDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))} ms`
  return `${(milliseconds / 1_000).toFixed(2)} s`
}

export function formatHttpBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

export function responseFiletype(response: HttpResponseSnapshot) {
  switch (response.bodyKind) {
    case "json":
      return "json"
    case "html":
      return "html"
    case "xml":
      return "xml"
    default:
      return "text"
  }
}
