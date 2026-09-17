import { cpSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseFeatureCatalog } from "../apps/cli/src/features/model"
import { decodeFeaturePayload } from "../apps/cli/src/features/download"
import { buildFeaturePayloads } from "./build-features"
import { workspaceRoot } from "./workspace-model"

// All platform builds must embed the same catalog from one canonical payload build.
export async function releaseFeatures(version: string) {
  const supplied = process.env.TUIMINAL_RELEASE_FEATURES_DIR
  if (!supplied) return buildFeaturePayloads()
  const source = resolve(supplied)
  const catalog = parseFeatureCatalog(
    JSON.parse(readFileSync(join(source, "catalog.json"), "utf8")),
    version,
  )
  for (const artifact of catalog.artifacts)
    decodeFeaturePayload(readFileSync(join(source, artifact.filename)), artifact)
  const destination = join(workspaceRoot, "dist", "features", version)
  if (source !== destination) cpSync(source, destination, { recursive: true })
  return { catalog, destination }
}
