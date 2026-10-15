import { validateRepositoryName } from "./query"
import type { PullRequestColumn, PullRequestSection, PullRequestSort } from "./types"
import { configObject, parseRemoteConfigBase } from "../remote-config"

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

export function parsePullRequestConfig(value: unknown): PullRequestConfig {
  const root = configObject(value)
  if (root?.version !== 1) return structuredClone(DEFAULT_PULL_REQUEST_CONFIG)
  const defaults = configObject(root.defaults) ?? {}
  const notifications = configObject(defaults.notifications) ?? {}
  const base = parseRemoteConfigBase(root, {
    defaultSections: DEFAULT_PULL_REQUEST_SECTIONS,
    previousDefaultSets: PREVIOUS_DEFAULT_PULL_REQUEST_SECTION_SETS,
    columns: PULL_REQUEST_COLUMNS,
    sorts: PULL_REQUEST_SORTS,
    validRepository: validateRepositoryName,
  })
  return {
    version: 1,
    defaults: {
      ...base.defaults,
      approveComment: typeof defaults.approveComment === "string" ? defaults.approveComment : "",
      notifications: {
        desktop: notifications.desktop === true,
        discreet: notifications.discreet !== false,
      },
    },
    profiles: base.profiles,
    repoPaths: base.repoPaths,
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
