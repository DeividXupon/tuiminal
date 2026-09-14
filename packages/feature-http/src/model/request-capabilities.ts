import type { HttpRequestDefinition } from "./types"

export function isOpaqueHttpRequest(request?: HttpRequestDefinition) {
  return request?.source.kind === "file" && request.source.supported === false
}

export function httpRequestFilePath(request?: HttpRequestDefinition) {
  return request?.source.kind === "file" ? request.source.path : null
}
