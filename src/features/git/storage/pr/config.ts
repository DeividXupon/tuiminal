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
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import {
  DEFAULT_PULL_REQUEST_CONFIG,
  type PullRequestConfig,
  type PullRequestProfile,
  parsePullRequestConfig,
  pullRequestProfileForRoot,
} from "../../model/pr/config"
import { validateRepositoryName } from "../../model/pr/query"

const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const PULL_REQUEST_CONFIG_PATH = join(configRoot, "tuiminal", "git-pr.yaml")

export type PullRequestConfigLoadResult = {
  config: PullRequestConfig
  error: string | null
}

export function resolvePullRequestProfileRoot(directory: string) {
  const absolute = resolve(directory)
  return existsSync(absolute) ? realpathSync(absolute) : absolute
}

export function loadPullRequestConfig(
  path = PULL_REQUEST_CONFIG_PATH,
): PullRequestConfigLoadResult {
  if (!existsSync(path))
    return { config: structuredClone(DEFAULT_PULL_REQUEST_CONFIG), error: null }
  try {
    return { config: parsePullRequestConfig(parseYaml(readFileSync(path, "utf8"))), error: null }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown YAML error"
    return {
      config: structuredClone(DEFAULT_PULL_REQUEST_CONFIG),
      error: `Could not read ${path}: ${detail}`,
    }
  }
}

export function savePullRequestConfig(config: PullRequestConfig, path = PULL_REQUEST_CONFIG_PATH) {
  const normalized = parsePullRequestConfig(config)
  const directory = dirname(path)
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  try {
    writeFileSync(temporary, stringifyYaml(normalized), {
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

export function addPullRequestProfileRepository({
  root,
  host,
  repository,
  path = PULL_REQUEST_CONFIG_PATH,
}: {
  root: string
  host: string
  repository: string
  path?: string
}) {
  if (!validateRepositoryName(repository)) throw new Error("Use o formato owner/repo")
  const loaded = loadPullRequestConfig(path)
  if (loaded.error) throw new Error(loaded.error)
  const profileRoot = resolvePullRequestProfileRoot(root)
  const current = pullRequestProfileForRoot(loaded.config, profileRoot)
  loaded.config.profiles[profileRoot] = {
    ...current,
    host,
    repositories: [...new Set([...current.repositories, repository])],
  }
  return savePullRequestConfig(loaded.config, path)
}

export function updatePullRequestProfile({
  root,
  update,
  path = PULL_REQUEST_CONFIG_PATH,
}: {
  root: string
  update: (profile: PullRequestProfile) => PullRequestProfile
  path?: string
}) {
  const loaded = loadPullRequestConfig(path)
  if (loaded.error) throw new Error(loaded.error)
  const profileRoot = resolvePullRequestProfileRoot(root)
  loaded.config.profiles[profileRoot] = update(
    structuredClone(pullRequestProfileForRoot(loaded.config, profileRoot)),
  )
  return savePullRequestConfig(loaded.config, path)
}

export function removePullRequestProfileRepository({
  root,
  repository,
  path = PULL_REQUEST_CONFIG_PATH,
}: {
  root: string
  repository: string
  path?: string
}) {
  return updatePullRequestProfile({
    root,
    path,
    update: (profile) => ({
      ...profile,
      repositories: profile.repositories.filter((candidate) => candidate !== repository),
    }),
  })
}

export function addPullRequestClonePath({
  host,
  repository,
  clonePath,
  path = PULL_REQUEST_CONFIG_PATH,
}: {
  host: string
  repository: string
  clonePath: string
  path?: string
}) {
  if (!validateRepositoryName(repository)) throw new Error("Use o formato owner/repo")
  const loaded = loadPullRequestConfig(path)
  if (loaded.error) throw new Error(loaded.error)
  const canonicalPath = resolvePullRequestProfileRoot(clonePath)
  const key = `${host.toLowerCase()}/${repository}`
  loaded.config.repoPaths[key] = [
    ...new Set([...(loaded.config.repoPaths[key] ?? []), canonicalPath]),
  ]
  return savePullRequestConfig(loaded.config, path)
}
