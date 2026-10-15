import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { loadLinkedPostmanCollections, type LinkedPostmanCollection } from "./collection-catalog"
import { pullPostmanCollection } from "./pull"
import { repairDuplicatePostmanRequestIds } from "./repair-ids"

type WorkspaceApi = Parameters<typeof pullPostmanCollection>[1]

function onceByKey<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>) {
  const pending = cache.get(key) ?? load()
  cache.set(key, pending)
  return pending
}

export type WorkspaceSyncResult = {
  collections: number
  imported: number
  requests: number
  environmentName?: string
  errors: string[]
}

async function repairLinkedCollections(
  root: string,
  linked: LinkedPostmanCollection[],
  workspaceId: string,
) {
  const errors: string[] = []
  for (const entry of linked.filter((item) => item.workspaceId === workspaceId)) {
    try {
      await repairDuplicatePostmanRequestIds(root, entry.filePath)
    } catch (error) {
      errors.push(`${entry.filePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return errors
}

export async function syncPostmanWorkspace(
  root: string,
  api: WorkspaceApi,
  workspaceId: string,
  onProgress?: (done: number, total: number) => void,
  environmentId?: string,
): Promise<WorkspaceSyncResult> {
  const collections = await api.collections(workspaceId)
  const globals = new Map<string, ReturnType<WorkspaceApi["globals"]>>()
  const environments = new Map<string, ReturnType<WorkspaceApi["environments"]>>()
  const environment = new Map<string, ReturnType<WorkspaceApi["environment"]>>()
  const cachedApi: WorkspaceApi = {
    collections: (id) => api.collections(id),
    collection: (id) => api.collection(id),
    globals: (id) => onceByKey(globals, id, () => api.globals(id)),
    environments: (id) => onceByKey(environments, id, () => api.environments(id)),
    environment: (id) => onceByKey(environment, id, () => api.environment(id)),
  }
  const names = await readdir(resolve(root, "postman")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  const linked = await loadLinkedPostmanCollections(
    root,
    names.filter((name) => name.endsWith(".http")).map((name) => `postman/${name}`),
  )
  const present = new Set(
    linked.filter((entry) => entry.workspaceId === workspaceId).map((entry) => entry.collectionId),
  )
  const result: WorkspaceSyncResult = {
    collections: collections.length,
    imported: 0,
    requests: 0,
    errors: [],
  }
  result.errors.push(...(await repairLinkedCollections(root, linked, workspaceId)))
  let done = 0
  for (const collection of collections) {
    if (!present.has(collection.id)) {
      try {
        const imported = await pullPostmanCollection(root, cachedApi, {
          workspaceId,
          collectionId: collection.uid ?? collection.id,
          collections,
          ...(environmentId ? { environmentId } : {}),
        })
        result.imported += 1
        result.requests += imported.imported
        if (imported.environmentName) result.environmentName = imported.environmentName
        present.add(collection.id)
      } catch (error) {
        result.errors.push(
          `${collection.name}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    onProgress?.(++done, collections.length)
  }
  return result
}
