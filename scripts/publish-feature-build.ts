import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { catalogSnapshotDirectory } from "../apps/cli/src/features/catalog-snapshot"
import { decodeFeaturePayload } from "../apps/cli/src/features/download"
import { parseFeatureCatalog, type FeatureCatalog } from "../apps/cli/src/features/model"

function writeAtomic(path: string, content: string | Buffer) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, content)
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export function publishFeatureBuild(
  destination: string,
  catalog: FeatureCatalog,
  archives: ReadonlyMap<string, Buffer>,
) {
  parseFeatureCatalog(catalog, catalog.version)
  const verified = catalog.artifacts.map((artifact) => {
    const archive = archives.get(artifact.filename)
    if (!archive) throw new Error(`Missing official feature archive: ${artifact.filename}`)
    decodeFeaturePayload(archive, artifact)
    return { artifact, archive }
  })
  const snapshot = join(destination, catalogSnapshotDirectory(catalog))
  mkdirSync(dirname(snapshot), { recursive: true })
  const temporary = join(destination, `.build-${randomUUID()}`)
  mkdirSync(temporary)
  const metadata = `${JSON.stringify(catalog, null, 2)}\n`
  try {
    for (const { artifact, archive } of verified)
      writeFileSync(join(temporary, artifact.filename), archive)
    writeFileSync(join(temporary, "catalog.json"), metadata)
    try {
      renameSync(temporary, snapshot)
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? ""))
        throw error
      for (const artifact of catalog.artifacts)
        decodeFeaturePayload(readFileSync(join(snapshot, artifact.filename)), artifact)
    }
    // Keep the canonical flat release layout. Dev sessions use the immutable snapshot.
    for (const { artifact, archive } of verified)
      writeAtomic(join(destination, artifact.filename), archive)
    writeAtomic(join(destination, "catalog.json"), metadata)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
