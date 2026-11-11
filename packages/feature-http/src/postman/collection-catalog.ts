import { resolve } from "node:path"
import { postmanSidecar, readPostmanProvenance, replacePostmanProvenance } from "./sync"

export type LinkedPostmanCollection = {
  filePath: string
  workspaceId: string
  collectionId: string
  name?: string
}

export async function loadLinkedPostmanCollections(root: string, paths: readonly string[]) {
  const entries = await Promise.all(
    paths
      .filter((path) => path.startsWith("postman/") && path.endsWith(".http"))
      .map(async (filePath): Promise<LinkedPostmanCollection | null> => {
        try {
          const sidecar = await readPostmanProvenance(resolve(root, `${filePath}.postman.json`))
          return sidecar.workspaceId
            ? {
                filePath,
                workspaceId: sidecar.workspaceId,
                collectionId: sidecar.collectionId,
                ...(sidecar.collectionName !== undefined ? { name: sidecar.collectionName } : {}),
              }
            : null
        } catch {
          return null
        }
      }),
  )
  return entries.filter((entry): entry is LinkedPostmanCollection => entry !== null)
}

export async function refreshLinkedPostmanCollectionName(
  root: string,
  entry: LinkedPostmanCollection,
  name: string,
) {
  if (entry.name === name) return
  const path = await postmanSidecar(root, entry.filePath)
  const metadata = await readPostmanProvenance(path)
  if (metadata.collectionId !== entry.collectionId || metadata.workspaceId !== entry.workspaceId)
    throw new Error("Associação Postman inválida. Importe a coleção novamente.")
  await replacePostmanProvenance(path, { ...metadata, collectionName: name })
}
