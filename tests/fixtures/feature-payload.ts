import { gzipSync } from "node:zlib"
import {
  FEATURE_IDS,
  featureFileNames,
  type FeatureCatalog,
} from "../../apps/cli/src/features/model"
import { featureDigest } from "../../apps/cli/src/features/download"
export function featureFixture(version = "1.2.3") {
  const archives = new Map<string, Buffer>()
  const contents = new Map<string, Map<string, Buffer>>()
  const catalog: FeatureCatalog = { schema: 1, version, artifacts: [] }
  for (const id of FEATURE_IDS) {
    const files = new Map(
      featureFileNames(id).map((name) => [
        name,
        Buffer.from(`export const identity = ${JSON.stringify(`${version}/${id}/${name}/✓`)};`),
      ]),
    )
    const archive = gzipSync(
      JSON.stringify({
        schema: 1,
        id,
        version,
        files: Object.fromEntries(
          [...files].map(([name, bytes]) => [name, bytes.toString("base64")]),
        ),
      }),
    )
    const filename = `tuiminal-${version}-${id}.json.gz`
    catalog.artifacts.push({
      id,
      version,
      filename,
      size: archive.length,
      sha256: featureDigest(archive),
      files: [...files].map(([name, bytes]) => ({
        name,
        size: bytes.length,
        sha256: featureDigest(bytes),
      })),
    })
    archives.set(filename, archive)
    contents.set(id, files)
  }
  return { catalog, archives, contents }
}
