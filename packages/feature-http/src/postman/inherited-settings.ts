import { record } from "../importing/shared"
import { postmanScripts } from "../importing/postman-scripts"
import type { HttpRequestDefinition } from "../model/types"

/** Collection and folder scripts stay separate from the editable request scripts. */
export function postmanInheritedScripts(collection: Record<string, unknown>) {
  const result = new Map<string, NonNullable<HttpRequestDefinition["scripts"]>[]>()
  const visit = (
    node: Record<string, unknown>,
    inherited: NonNullable<HttpRequestDefinition["scripts"]>[],
  ) => {
    const scripts = postmanScripts(node, {})
    const scopes = scripts.preRequest || scripts.postResponse ? [...inherited, scripts] : inherited
    if (!Array.isArray(node.item)) return
    for (const raw of node.item) {
      const item = record(raw)
      if (!item) continue
      if (Array.isArray(item.item)) visit(item, scopes)
      else if (typeof item.id === "string") result.set(item.id, scopes)
    }
  }
  visit(collection, [])
  return result
}

export function refreshInheritedRequest(
  request: HttpRequestDefinition,
  latest: HttpRequestDefinition | undefined,
) {
  if (!latest || request.source.kind !== "file" || !request.source.postman) return request
  const baseline = JSON.parse(request.source.postman.baseline) as {
    snapshot: { auth: HttpRequestDefinition["auth"] }
  }
  return {
    ...request,
    ...(JSON.stringify(request.auth) === JSON.stringify(baseline.snapshot.auth)
      ? { auth: latest.auth }
      : {}),
    inheritedScripts: latest.inheritedScripts ?? [],
  }
}
