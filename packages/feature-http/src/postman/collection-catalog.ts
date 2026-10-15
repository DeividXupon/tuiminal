import { resolve } from "node:path"
import { readPostmanProvenance } from "./sync"

export type LinkedPostmanCollection = {
  filePath: string
  workspaceId: string
  collectionId: string
}

export async function loadLinkedPostmanCollections(root: string, paths: readonly string[]) {
  const entries = await Promise.all(
    paths
      .filter((path) => path.startsWith("postman/") && path.endsWith(".http"))
      .map(async (filePath): Promise<LinkedPostmanCollection | null> => {
        try {
          const sidecar = await readPostmanProvenance(resolve(root, `${filePath}.postman.json`))
          return sidecar.workspaceId
            ? { filePath, workspaceId: sidecar.workspaceId, collectionId: sidecar.collectionId }
            : null
        } catch {
          return null
        }
      }),
  )
  return entries.filter((entry): entry is LinkedPostmanCollection => entry !== null)
}
