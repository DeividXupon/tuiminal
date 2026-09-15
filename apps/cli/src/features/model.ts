export const FEATURE_IDS = ["database", "git", "runner", "http", "terminal"] as const
export type FeatureId = (typeof FEATURE_IDS)[number]
export const FEATURE_SCHEMA = 1
export const MAX_FEATURE_DOWNLOAD = 32 * 1024 * 1024
export const MAX_FEATURE_EXPANDED = 64 * 1024 * 1024

export type FeatureFile = { name: string; size: number; sha256: string }
export type FeatureArtifact = {
  id: FeatureId
  version: string
  filename: string
  size: number
  sha256: string
  files: FeatureFile[]
}
export type FeatureCatalog = {
  schema: 1
  version: string
  artifacts: FeatureArtifact[]
}
export type FeaturePayload = {
  schema: 1
  id: FeatureId
  version: string
  files: Record<string, string>
}

const FEATURE_FILES: Record<FeatureId, readonly string[]> = {
  database: ["index.mjs", "sqlite-worker.mjs"],
  git: ["index.mjs"],
  runner: ["index.mjs"],
  http: ["index.mjs", "http-run.mjs", "http-import.mjs"],
  terminal: ["index.mjs"],
}

export class FeatureInstallError extends Error {
  constructor(
    readonly kind: "catalog" | "integrity" | "network" | "storage" | "cancelled" | "missing",
    message: string,
  ) {
    super(message)
    this.name = "FeatureInstallError"
  }
}

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === "string" && FEATURE_IDS.some((id) => id === value)
}

export function featureFileNames(id: FeatureId) {
  return [...FEATURE_FILES[id], "LICENSE", "THIRD_PARTY_NOTICES.md"]
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

export function parseFeatureCatalog(value: unknown, version: string): FeatureCatalog {
  const catalog = value as Partial<FeatureCatalog> | null
  if (
    !catalog ||
    catalog.schema !== FEATURE_SCHEMA ||
    catalog.version !== version ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(version) ||
    !Array.isArray(catalog.artifacts) ||
    catalog.artifacts.length !== FEATURE_IDS.length
  )
    throw new FeatureInstallError("catalog", "Invalid official feature catalog")
  const ids = new Set<FeatureId>()
  for (const artifact of catalog.artifacts) {
    if (
      !artifact ||
      !isFeatureId(artifact.id) ||
      ids.has(artifact.id) ||
      artifact.version !== version ||
      artifact.filename !== `tuiminal-${version}-${artifact.id}.json.gz` ||
      !validHash(artifact.sha256) ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size <= 0 ||
      artifact.size > MAX_FEATURE_DOWNLOAD ||
      !Array.isArray(artifact.files)
    )
      throw new FeatureInstallError("catalog", "Invalid official feature artifact")
    const expected = featureFileNames(artifact.id)
    const names = new Set<string>()
    let expanded = 0
    for (const file of artifact.files) {
      if (
        !file ||
        !expected.includes(file.name) ||
        names.has(file.name) ||
        !Number.isSafeInteger(file.size) ||
        file.size <= 0 ||
        !validHash(file.sha256)
      )
        throw new FeatureInstallError("catalog", "Invalid official feature file")
      names.add(file.name)
      expanded += file.size
    }
    if (names.size !== expected.length || expanded > MAX_FEATURE_EXPANDED / 2) {
      throw new FeatureInstallError("catalog", "Incomplete official feature artifact")
    }
    ids.add(artifact.id)
  }
  return catalog as FeatureCatalog
}

export function preferredInstalledFeature(installed: readonly FeatureId[], requested?: FeatureId) {
  if (requested && installed.includes(requested)) return requested
  if (installed.includes("runner")) return "runner"
  return FEATURE_IDS.find((id) => installed.includes(id)) ?? null
}
