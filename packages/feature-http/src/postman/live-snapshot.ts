import type { HttpRequestDefinition } from "../model/types"
import { postmanRequestSnapshot, type Snapshot } from "./snapshot"
import { postmanRemoteHash } from "./sync"

export function liveSnapshotFields({ scripts, ...fields }: Snapshot) {
  return {
    ...fields,
    preRequest: scripts?.preRequest ?? "",
    postResponse: scripts?.postResponse ?? "",
  }
}

export function resolvePostmanSecrets<T>(value: T, secrets: Record<string, string>): T {
  if (typeof value === "string")
    return value.replace(
      /\{\{(postman_[^{}]+)\}\}/g,
      (match, key: string) => secrets[key] ?? match,
    ) as T
  if (Array.isArray(value)) return value.map((item) => resolvePostmanSecrets(item, secrets)) as T
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolvePostmanSecrets(item, secrets)]),
    ) as T
  return value
}

export function liveFieldHash(value: unknown, secrets: Record<string, string> = {}) {
  const normalized = JSON.parse(
    JSON.stringify(resolvePostmanSecrets(value ?? null, secrets), (key, item) =>
      ["id", "sensitivity", "origin"].includes(key) ? undefined : item,
    ),
  )
  return postmanRemoteHash(normalized)
}

export function liveSnapshotHashes(
  request: HttpRequestDefinition,
  secrets: Record<string, string>,
) {
  return Object.fromEntries(
    Object.entries(liveSnapshotFields(postmanRequestSnapshot(request))).map(([key, value]) => [
      key,
      liveFieldHash(value, secrets),
    ]),
  ) as Record<keyof ReturnType<typeof liveSnapshotFields>, string>
}
