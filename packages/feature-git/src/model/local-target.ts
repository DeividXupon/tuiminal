import { resolve } from "node:path"

export const GIT_DIFFS_CONFIG_VERSION = 1 as const

export type GitDiffsProfile = {
  repositoryRoot: string
}

export type GitDiffsConfig = {
  version: typeof GIT_DIFFS_CONFIG_VERSION
  profiles: Record<string, GitDiffsProfile>
}

export const DEFAULT_GIT_DIFFS_CONFIG: GitDiffsConfig = {
  version: GIT_DIFFS_CONFIG_VERSION,
  profiles: {},
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function parseGitDiffsConfig(value: unknown): GitDiffsConfig {
  const record = recordValue(value)
  const profiles = recordValue(record?.profiles)
  const parsed: Record<string, GitDiffsProfile> = {}
  for (const [scope, candidate] of Object.entries(profiles ?? {})) {
    const profile = recordValue(candidate)
    if (typeof profile?.repositoryRoot !== "string" || !profile.repositoryRoot.trim()) continue
    parsed[resolve(scope)] = { repositoryRoot: resolve(profile.repositoryRoot) }
  }
  return { version: GIT_DIFFS_CONFIG_VERSION, profiles: parsed }
}

export function gitDiffsTargetForScope(config: GitDiffsConfig, scope: string, fallback: string) {
  return config.profiles[resolve(scope)]?.repositoryRoot ?? resolve(fallback)
}
