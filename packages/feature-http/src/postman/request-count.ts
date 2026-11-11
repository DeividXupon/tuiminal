import type { PostmanApi } from "./api"

/** Count request entries, including unsupported methods, without importing or retaining bodies. */
export function countPostmanRequests(collection: Record<string, unknown>): number {
  const pending: unknown[] = Array.isArray(collection.item) ? [...collection.item] : []
  let total = 0
  while (pending.length) {
    const item = pending.pop()
    if (!item || typeof item !== "object") continue
    const entry = item as Record<string, unknown>
    if (entry.request && (typeof entry.request === "object" || typeof entry.request === "string"))
      total++
    if (Array.isArray(entry.item)) for (const child of entry.item) pending.push(child)
  }
  return total
}

export async function countPostmanWorkspaceRequests(
  api: Pick<PostmanApi, "collections" | "collection">,
  workspaceId: string,
  cancelled: () => boolean,
): Promise<number | undefined> {
  const collections = await api.collections(workspaceId)
  let total = 0
  for (const collection of collections) {
    if (cancelled()) return undefined
    total += countPostmanRequests(await api.collection(collection.uid ?? collection.id))
  }
  return cancelled() ? undefined : total
}
