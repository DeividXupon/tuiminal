import { validateRepositoryName } from "./query"
import type { PullRequestColumn, PullRequestSection, PullRequestSort } from "./types"

export const PULL_REQUEST_COLUMNS: readonly PullRequestColumn[] = [
  "repository",
  "state",
  "title",
  "author",
  "assignees",
  "base",
  "comments",
  "review",
  "ci",
  "labels",
  "changes",
]

export const PULL_REQUEST_SORTS: readonly PullRequestSort[] = [
  "updated-desc",
  "updated-asc",
  "number-desc",
  "number-asc",
]

export type PullRequestPreviewConfig = {
  open: boolean
  position: "auto" | "right" | "bottom"
  widthRatio: number
  heightRatio: number
}

export type PullRequestProfile = {
  host: string
  repositories: string[]
  sections: PullRequestSection[]
  previewPosition?: PullRequestPreviewConfig["position"]
}

export type PullRequestConfig = {
  version: 1
  defaults: {
    host: string
    pageSize: number
    refreshSeconds: number
    preview: PullRequestPreviewConfig
    approveComment: string
    notifications: { desktop: boolean; discreet: boolean }
  }
  profiles: Record<string, PullRequestProfile>
  repoPaths: Record<string, string[]>
}

export const DEFAULT_PULL_REQUEST_SECTIONS: readonly PullRequestSection[] = [
  { id: "mine", title: "My PRs", query: "is:open author:@me" },
  { id: "review", title: "Review requested", query: "is:open review-requested:@me" },
  { id: "all", title: "All", query: "archived:false" },
  { id: "open", title: "Open", query: "is:open" },
  { id: "closed", title: "Closed", query: "is:closed" },
]

const PREVIOUS_DEFAULT_PULL_REQUEST_SECTION_SETS: readonly (readonly PullRequestSection[])[] = [
  [
    { id: "mine", title: "My PRs", query: "is:open author:@me" },
    { id: "review", title: "Review requested", query: "is:open review-requested:@me" },
  ],
  [
    { id: "mine", title: "Meus PRs", query: "is:open author:@me" },
    { id: "review", title: "Aguardando minha revisão", query: "is:open review-requested:@me" },
    { id: "assigned", title: "Atribuídos a mim", query: "is:open assignee:@me" },
    { id: "failing", title: "CI falhando", query: "is:open status:failure" },
  ],
]

export const DEFAULT_PULL_REQUEST_CONFIG: PullRequestConfig = {
  version: 1,
  defaults: {
    host: "github.com",
    pageSize: 20,
    refreshSeconds: 300,
    preview: { open: true, position: "auto", widthRatio: 0.45, heightRatio: 0.5 },
    approveComment: "",
    notifications: { desktop: false, discreet: true },
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
        (column): column is PullRequestColumn =>
          typeof column === "string" && PULL_REQUEST_COLUMNS.includes(column as PullRequestColumn),
      )
    : []
  const sort =
    typeof section.sort === "string" && PULL_REQUEST_SORTS.includes(section.sort as PullRequestSort)
      ? (section.sort as PullRequestSort)
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

function sectionsValue(value: unknown): PullRequestSection[] {
  if (!Array.isArray(value)) return DEFAULT_PULL_REQUEST_SECTIONS.map((section) => ({ ...section }))
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
  const isPreviousDefault = PREVIOUS_DEFAULT_PULL_REQUEST_SECTION_SETS.some(
    (defaults) =>
      sections.length === defaults.length &&
      sections.every((section, index) => {
        const previous = defaults[index]
        return (
          previous?.id === section.id &&
          previous.title === section.title &&
          previous.query === section.query &&
          section.columns === undefined &&
          section.sort === undefined &&
          section.limit === undefined
        )
      }),
  )
  return isPreviousDefault
    ? DEFAULT_PULL_REQUEST_SECTIONS.map((section) => ({ ...section }))
    : sections
}

function profileValue(value: unknown, defaultHost: string): PullRequestProfile | null {
  const profile = objectValue(value)
  if (!profile) return null
  const repositories = Array.isArray(profile.repositories)
    ? profile.repositories.filter(
        (repository): repository is string =>
          typeof repository === "string" && validateRepositoryName(repository),
      )
    : []
  const sections = sectionsValue(profile.sections)
  return {
    host:
      typeof profile.host === "string" && profile.host.trim() ? profile.host.trim() : defaultHost,
    repositories: [...new Set(repositories)],
    sections: sections.length
      ? sections
      : DEFAULT_PULL_REQUEST_SECTIONS.map((section) => ({ ...section })),
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

export function parsePullRequestConfig(value: unknown): PullRequestConfig {
  const root = objectValue(value)
  if (root?.version !== 1) return structuredClone(DEFAULT_PULL_REQUEST_CONFIG)
  const defaults = objectValue(root.defaults) ?? {}
  const preview = objectValue(defaults.preview) ?? {}
  const notifications = objectValue(defaults.notifications) ?? {}
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
      approveComment: typeof defaults.approveComment === "string" ? defaults.approveComment : "",
      notifications: {
        desktop: notifications.desktop === true,
        discreet: notifications.discreet !== false,
      },
    },
    profiles: profilesValue(root.profiles, host),
    repoPaths: repoPathsValue(root.repoPaths),
  }
}

export function pullRequestProfileForRoot(
  config: PullRequestConfig,
  root: string,
  fallback?: { host: string; repository: string } | null,
) {
  return (
    config.profiles[root] ?? {
      host: fallback?.host ?? config.defaults.host,
      repositories: fallback ? [fallback.repository] : [],
      sections: DEFAULT_PULL_REQUEST_SECTIONS.map((section) => ({ ...section })),
      previewPosition: config.defaults.preview.position,
    }
  )
}
