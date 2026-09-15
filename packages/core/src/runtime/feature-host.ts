// Private, version-matched contract between the CLI and official feature payloads.
// Payloads receive the host's actual module instances so React/OpenTUI stay unique.
export const FEATURE_HOST_KEY = "tuiminal.official-features.host.v1"

type FeatureHost = {
  version: string
  modules: Record<string, unknown>
  sqliteWorkerCommand?: () => string[]
}

const registry = globalThis as typeof globalThis & {
  [FEATURE_HOST_KEY]?: FeatureHost
}

export function registerFeatureHost(host: FeatureHost) {
  const current = registry[FEATURE_HOST_KEY]
  if (current && current.version !== host.version) {
    throw new Error("The official feature host version changed within this process")
  }
  registry[FEATURE_HOST_KEY] = host
}

export function installedSqliteWorkerCommand() {
  return registry[FEATURE_HOST_KEY]?.sqliteWorkerCommand?.() ?? null
}
