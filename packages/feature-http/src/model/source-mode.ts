import type { HttpDocumentState, HttpProjectRequestItem } from "./types"

export type HttpSourceMode = "local" | "postman"

export function belongsToHttpSource(path: string, mode: HttpSourceMode) {
  const linked = path === "postman" || path.startsWith("postman/")
  return mode === "postman" ? linked : !linked
}

export function requestsForHttpSource(requests: HttpProjectRequestItem[], mode: HttpSourceMode) {
  return requests.filter((item) => belongsToHttpSource(item.filePath, mode))
}

export function pathsForHttpSource(paths: string[], mode: HttpSourceMode) {
  return paths.filter((path) => belongsToHttpSource(path, mode))
}

export function httpSourceSwitchBlocker(documents: HttpDocumentState[]) {
  if (documents.some((document) => document.revision !== document.savedRevision)) {
    return "Salve ou feche os requests alterados antes de trocar a origem HTTP."
  }
  if (documents.some((document) => document.execution.status === "running")) {
    return "Aguarde ou cancele o request em execução antes de trocar a origem HTTP."
  }
  return null
}
