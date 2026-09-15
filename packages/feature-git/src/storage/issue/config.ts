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
  DEFAULT_ISSUE_CONFIG,
  type IssueConfig,
  type IssueProfile,
  issueProfileForRoot,
  parseIssueConfig,
} from "../../model/issue/config"
import { validateIssueRepositoryName } from "../../model/issue/query"

const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const ISSUE_CONFIG_PATH = join(configRoot, "tuiminal", "git-issues.yaml")

export type IssueConfigLoadResult = { config: IssueConfig; error: string | null }

export function resolveIssueProfileRoot(directory: string) {
  const absolute = resolve(directory)
  return existsSync(absolute) ? realpathSync(absolute) : absolute
}

export function loadIssueConfig(path = ISSUE_CONFIG_PATH): IssueConfigLoadResult {
  if (!existsSync(path)) return { config: structuredClone(DEFAULT_ISSUE_CONFIG), error: null }
  try {
    return { config: parseIssueConfig(parseYaml(readFileSync(path, "utf8"))), error: null }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown YAML error"
    return {
      config: structuredClone(DEFAULT_ISSUE_CONFIG),
      error: `Could not read ${path}: ${detail}`,
    }
  }
}

export function saveIssueConfig(config: IssueConfig, path = ISSUE_CONFIG_PATH) {
  const normalized = parseIssueConfig(config)
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

export function updateIssueProfile({
  root,
  update,
  fallbackProfile,
  path = ISSUE_CONFIG_PATH,
}: {
  root: string
  update: (profile: IssueProfile) => IssueProfile
  fallbackProfile?: IssueProfile
  path?: string
}) {
  const loaded = loadIssueConfig(path)
  if (loaded.error) throw new Error(loaded.error)
  const profileRoot = resolveIssueProfileRoot(root)
  loaded.config.profiles[profileRoot] = update(
    structuredClone(fallbackProfile ?? issueProfileForRoot(loaded.config, profileRoot)),
  )
  return saveIssueConfig(loaded.config, path)
}

export function addIssueProfileRepository({
  root,
  host,
  repository,
  path = ISSUE_CONFIG_PATH,
}: {
  root: string
  host: string
  repository: string
  path?: string
}) {
  if (!validateIssueRepositoryName(repository)) throw new Error("Use o formato owner/repo")
  return updateIssueProfile({
    root,
    path,
    update: (profile) => ({
      ...profile,
      host,
      repositories: [...new Set([...profile.repositories, repository])],
    }),
  })
}

export function addIssueClonePath({
  host,
  repository,
  clonePath,
  path = ISSUE_CONFIG_PATH,
}: {
  host: string
  repository: string
  clonePath: string
  path?: string
}) {
  if (!validateIssueRepositoryName(repository)) throw new Error("Use o formato owner/repo")
  const loaded = loadIssueConfig(path)
  if (loaded.error) throw new Error(loaded.error)
  const canonicalPath = resolveIssueProfileRoot(clonePath)
  const key = `${host.toLowerCase()}/${repository}`
  loaded.config.repoPaths[key] = [
    ...new Set([...(loaded.config.repoPaths[key] ?? []), canonicalPath]),
  ]
  return saveIssueConfig(loaded.config, path)
}
