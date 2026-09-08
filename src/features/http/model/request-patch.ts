import type { HttpRequestDefinition } from "./types"

export function requestPatchIsUnchanged(
  request: HttpRequestDefinition,
  patch: Partial<Omit<HttpRequestDefinition, "id">>,
) {
  return Object.entries(patch).every(([key, value]) => {
    const current = request[key as keyof typeof patch]
    return Object.is(current, value) || JSON.stringify(current) === JSON.stringify(value)
  })
}
