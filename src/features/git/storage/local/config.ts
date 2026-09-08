import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import {
  DEFAULT_GIT_DIFFS_CONFIG,
  type GitDiffsConfig,
  parseGitDiffsConfig,
} from "../../model/local-target"

const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const GIT_DIFFS_CONFIG_PATH = join(configRoot, "tuiminal", "git-diffs.json")

export type GitDiffsConfigLoadResult = {
  config: GitDiffsConfig
  error: string | null
}

export function loadGitDiffsConfig(path = GIT_DIFFS_CONFIG_PATH): GitDiffsConfigLoadResult {
  if (!existsSync(path)) return { config: structuredClone(DEFAULT_GIT_DIFFS_CONFIG), error: null }
  try {
    return { config: parseGitDiffsConfig(JSON.parse(readFileSync(path, "utf8"))), error: null }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON"
    return {
      config: structuredClone(DEFAULT_GIT_DIFFS_CONFIG),
      error: `Could not read ${path}: ${detail}`,
    }
  }
}

export function saveGitDiffsConfig(config: GitDiffsConfig, path = GIT_DIFFS_CONFIG_PATH) {
  const normalized = parseGitDiffsConfig(config)
  const directory = dirname(path)
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  try {
    writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    })
    renameSync(temporary, path)
    chmodSync(path, 0o600)
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary)
    throw error
  }
  return normalized
}

export function updateGitDiffsTarget({
  scope,
  repositoryRoot,
  path = GIT_DIFFS_CONFIG_PATH,
}: {
  scope: string
  repositoryRoot: string
  path?: string
}) {
  const loaded = loadGitDiffsConfig(path)
  if (loaded.error) throw new Error(loaded.error)
  const absoluteRoot = resolve(repositoryRoot)
  loaded.config.profiles[resolve(scope)] = {
    repositoryRoot: existsSync(absoluteRoot) ? realpathSync(absoluteRoot) : absoluteRoot,
  }
  return saveGitDiffsConfig(loaded.config, path)
}
