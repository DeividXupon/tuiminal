import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import {
  FEATURE_IDS,
  type FeatureCatalog,
  type FeatureId,
  type FeaturePayload,
  parseFeatureCatalog,
} from "../apps/cli/src/features/model"
import { bindFeatureImports, SHARED_FEATURE_IMPORTS } from "./feature-payload-model"
import { assertWorkspaceVersions, workspaceRoot } from "./workspace-model"

const extraEntrypoints: Partial<Record<FeatureId, Record<string, string>>> = {
  database: { "sqlite-worker.mjs": "drivers/sqlite-query-process.ts" },
  http: { "http-run.mjs": "cli/run.ts", "http-import.mjs": "cli/import.ts" },
}

export async function buildFeaturePayloads(outputDirectory?: string) {
  assertWorkspaceVersions()
  const { version } = JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8")) as {
    version: string
  }
  const destination = outputDirectory ?? join(workspaceRoot, "dist", "features", version)
  mkdirSync(destination, { recursive: true })
  const catalog: FeatureCatalog = { schema: 1, version, artifacts: [] }
  for (const id of FEATURE_IDS) {
    const payload: FeaturePayload = { schema: 1, id, version, files: {} }
    const files = []
    const entries = { "index.mjs": "index.ts", ...extraEntrypoints[id] }
    for (const [name, entry] of Object.entries(entries)) {
      const result = await Bun.build({
        entrypoints: [join(workspaceRoot, "packages", `feature-${id}`, "src", entry)],
        target: "bun",
        format: "esm",
        external: SHARED_FEATURE_IMPORTS,
        minify: false,
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
      })
      if (!result.success || result.outputs.length !== 1) {
        for (const log of result.logs) console.error(log)
        throw new Error(`Unable to build official feature ${id}/${name}`)
      }
      const source = await result.outputs[0]!.text()
      const content = Buffer.from(
        name === "sqlite-worker.mjs" ? source : bindFeatureImports(source, version),
      )
      files.push({
        name,
        size: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      })
      payload.files[name] = content.toString("base64")
    }
    for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
      const content = readFileSync(join(workspaceRoot, name))
      files.push({
        name,
        size: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      })
      payload.files[name] = content.toString("base64")
    }
    const archive = gzipSync(JSON.stringify(payload), { level: 9 })
    const filename = `tuiminal-${version}-${id}.json.gz`
    writeFileSync(join(destination, filename), archive)
    catalog.artifacts.push({
      id,
      version,
      filename,
      size: archive.length,
      sha256: createHash("sha256").update(archive).digest("hex"),
      files,
    })
  }
  parseFeatureCatalog(catalog, version)
  writeFileSync(join(destination, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`)
  console.log(`Built ${catalog.artifacts.length} official feature downloads in ${destination}`)
  return { catalog, destination }
}

if (import.meta.main) await buildFeaturePayloads()
