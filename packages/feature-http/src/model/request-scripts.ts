import type { HttpRequestDefinition } from "./types"
export function parseHttpScripts(raw: string): HttpRequestDefinition["scripts"] {
  try {
    const value = JSON.parse(raw)
    if (value && typeof value.preRequest === "string" && typeof value.postResponse === "string")
      return { preRequest: value.preRequest, postResponse: value.postResponse }
  } catch {}
  return undefined
}
