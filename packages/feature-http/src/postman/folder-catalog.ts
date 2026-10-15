import { resolve } from "node:path"
import { readPostmanProvenance, type PostmanCollectionFolder } from "./sync"

export async function loadPostmanFolderCatalog(root: string, paths: string[]) {
  const groups = await Promise.all(
    paths
      .filter((path) => path.startsWith("postman/") && path.endsWith(".http"))
      .map(async (filePath): Promise<PostmanCollectionFolder[]> => {
        try {
          const sidecar = await readPostmanProvenance(resolve(root, `${filePath}.postman.json`))
          return (sidecar.folders ?? []).map((folder) => ({ ...folder, filePath }))
        } catch {
          return []
        }
      }),
  )
  return groups.flat()
}
