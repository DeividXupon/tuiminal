import { validateIssueRepositoryName } from "./query"
import type { IssueColumn, IssueSection, IssueSort } from "./types"

export const ISSUE_COLUMNS: readonly IssueColumn[] = [
  "updated",
  "state",
  "repository",
  "title",
  "author",
  "assignees",
  "comments",
  "reactions",
  "labels",
]

export const ISSUE_SORTS: readonly IssueSort[] = [
  "updated-desc",
  "updated-asc",
  "number-desc",
  "number-asc",
]

export type IssuePreviewConfig = {
  open: boolean
  position: "auto" | "right" | "bottom"
  widthRatio: number
  heightRatio: number
}

export type IssueProfile = {
  host: string
  repositories: string[]
  sections: IssueSection[]
  previewPosition?: IssuePreviewConfig["position"]
}

export type IssueConfig = {
  version: 1
  defaults: {
    host: string
    pageSize: number
    refreshSeconds: number
    preview: IssuePreviewConfig
  }
  profiles: Record<string, IssueProfile>
  repoPaths: Record<string, string[]>
}

export const DEFAULT_ISSUE_SECTIONS: readonly IssueSection[] = [
  { id: "mine", title: "My Issues", query: "is:open author:@me" },
]

const LEGACY_DEFAULT_ISSUE_SECTIONS: readonly IssueSection[] = [
  { id: "created", title: "Criadas por mim", query: "is:open author:@me" },
  { id: "assigned", title: "Atribuídas a mim", query: "is:open assignee:@me" },
  { id: "involved", title: "Estou envolvido", query: "is:open involves:@me" },
  { id: "mentioned", title: "Mencionaram-me", query: "is:open mentions:@me" },
]

export const DEFAULT_ISSUE_CONFIG: IssueConfig = {
  version: 1,
  defaults: {
    host: "github.com",
    pageSize: 20,
    refreshSeconds: 300,
    preview: { open: true, position: "auto", widthRatio: 0.45, heightRatio: 0.5 },
  },
  profiles: {},
  repoPaths: {},
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}

function parsedSectionOptions(section: Record<string, unknown>) {
  const columns = Array.isArray(section.columns)
    ? section.columns.filter(
        (column): column is IssueColumn =>
          typeof column === "string" && ISSUE_COLUMNS.includes(column as IssueColumn),
      )
    : []
  const sort =
    typeof section.sort === "string" && ISSUE_SORTS.includes(section.sort as IssueSort)
      ? (section.sort as IssueSort)
      : undefined
  const limit =
    typeof section.limit === "number" && Number.isFinite(section.limit)
      ? Math.floor(Math.min(100, Math.max(1, section.limit)))
      : undefined
  return {
    ...(columns.length ? { columns: [...new Set(columns)] } : {}),
    ...(sort ? { sort } : {}),
    ...(limit ? { limit } : {}),
  }
}

function sectionsValue(value: unknown): IssueSection[] {
  if (!Array.isArray(value)) return DEFAULT_ISSUE_SECTIONS.map((section) => ({ ...section }))
  const identifiers = new Set<string>()
  const sections = value.flatMap((entry) => {
    const section = objectValue(entry)
    const id = typeof section?.id === "string" ? section.id.trim() : ""
    const title = typeof section?.title === "string" ? section.title.trim() : ""
    const query = typeof section?.query === "string" ? section.query.trim() : ""
    if (!section || !id || !title || !query || identifiers.has(id)) return []
    identifiers.add(id)
    return [{ id, title, query, ...parsedSectionOptions(section) }]
  })
  const isLegacyDefault =
    sections.length === LEGACY_DEFAULT_ISSUE_SECTIONS.length &&
    sections.every((section, index) => {
      const legacy = LEGACY_DEFAULT_ISSUE_SECTIONS[index]
      return (
        legacy?.id === section.id &&
        legacy.title === section.title &&
        legacy.query === section.query &&
        section.columns === undefined &&
        section.sort === undefined &&
        section.limit === undefined
      )
    })
  return isLegacyDefault ? DEFAULT_ISSUE_SECTIONS.map((section) => ({ ...section })) : sections
}

function profileValue(value: unknown, defaultHost: string): IssueProfile | null {
  const profile = objectValue(value)
  if (!profile) return null
  const repositories = Array.isArray(profile.repositories)
    ? profile.repositories.filter(
        (repository): repository is string =>
          typeof repository === "string" && validateIssueRepositoryName(repository),
      )
    : []
  const sections = sectionsValue(profile.sections)
  return {
    host:
      typeof profile.host === "string" && profile.host.trim() ? profile.host.trim() : defaultHost,
    repositories: [...new Set(repositories)],
    sections: sections.length
      ? sections
      : DEFAULT_ISSUE_SECTIONS.map((section) => ({ ...section })),
    ...(profile.previewPosition === "right" || profile.previewPosition === "bottom"
      ? { previewPosition: profile.previewPosition }
      : profile.previewPosition === "auto"
        ? { previewPosition: "auto" as const }
        : {}),
  }
}

function profilesValue(value: unknown, defaultHost: string) {
  const profiles = objectValue(value) ?? {}
  return Object.fromEntries(
    Object.entries(profiles).flatMap(([path, rawProfile]) => {
      const profile = profileValue(rawProfile, defaultHost)
      return path.trim() && profile ? [[path, profile]] : []
    }),
  )
}

function repoPathsValue(value: unknown) {
  const mappings = objectValue(value) ?? {}
  return Object.fromEntries(
    Object.entries(mappings).flatMap(([repository, paths]) => {
      if (!repository.includes("/") || !Array.isArray(paths)) return []
      const validPaths = paths.filter(
        (path): path is string => typeof path === "string" && Boolean(path.trim()),
      )
      return validPaths.length ? [[repository, [...new Set(validPaths)]]] : []
    }),
  )
}

export function parseIssueConfig(value: unknown): IssueConfig {
  const root = objectValue(value)
  if (root?.version !== 1) return structuredClone(DEFAULT_ISSUE_CONFIG)
  const defaults = objectValue(root.defaults) ?? {}
  const preview = objectValue(defaults.preview) ?? {}
  const host =
    typeof defaults.host === "string" && defaults.host.trim() ? defaults.host.trim() : "github.com"
  return {
    version: 1,
    defaults: {
      host,
      pageSize: Math.floor(boundedNumber(defaults.pageSize, 20, 1, 100)),
      refreshSeconds: Math.floor(boundedNumber(defaults.refreshSeconds, 300, 30, 3_600)),
      preview: {
        open: preview.open !== false,
        position:
          preview.position === "right" || preview.position === "bottom" ? preview.position : "auto",
        widthRatio: boundedNumber(preview.widthRatio, 0.45, 0.25, 0.7),
        heightRatio: boundedNumber(preview.heightRatio, 0.5, 0.3, 0.7),
      },
    },
    profiles: profilesValue(root.profiles, host),
    repoPaths: repoPathsValue(root.repoPaths),
  }
}

export function issueProfileForRoot(
  config: IssueConfig,
  root: string,
  fallback?: { host: string; repository: string } | null,
): IssueProfile {
  return (
    config.profiles[root] ?? {
      host: fallback?.host ?? config.defaults.host,
      repositories: fallback ? [fallback.repository] : [],
      sections: DEFAULT_ISSUE_SECTIONS.map((section) => ({ ...section })),
      previewPosition: config.defaults.preview.position,
    }
  )
}
