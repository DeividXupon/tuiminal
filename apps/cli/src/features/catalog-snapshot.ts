import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { featureDigest } from "./download"
import { parseFeatureCatalog, type FeatureCatalog } from "./model"

export function catalogSnapshotDirectory(catalog: FeatureCatalog) {
  return join("snapshots", featureDigest(Buffer.from(JSON.stringify(catalog))))
}

export async function localFeatureCatalog(directory: string, version: string) {
  const catalog = parseFeatureCatalog(
    JSON.parse(await readFile(join(directory, "catalog.json"), "utf8")),
    version,
  )
  const snapshot = join(directory, catalogSnapshotDirectory(catalog))
  let base = snapshot
  try {
    await access(snapshot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    // Accept catalogs produced before development builds retained snapshots.
    base = directory
  }
  return { catalog, baseUrl: pathToFileURL(`${base}/`) }
}
