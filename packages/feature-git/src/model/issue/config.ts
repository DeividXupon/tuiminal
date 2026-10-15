import { validateIssueRepositoryName } from "./query"
import type { IssueColumn, IssueSection, IssueSort } from "./types"
import { configObject, parseRemoteConfigBase } from "../remote-config"

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
  { id: "all", title: "All", query: "archived:false" },
  { id: "open", title: "Open", query: "is:open" },
  { id: "closed", title: "Closed", query: "is:closed" },
]

const PREVIOUS_DEFAULT_ISSUE_SECTION_SETS: readonly (readonly IssueSection[])[] = [
  [{ id: "mine", title: "My Issues", query: "is:open author:@me" }],
  [
    { id: "created", title: "Criadas por mim", query: "is:open author:@me" },
    { id: "assigned", title: "Atribuídas a mim", query: "is:open assignee:@me" },
    { id: "involved", title: "Estou envolvido", query: "is:open involves:@me" },
    { id: "mentioned", title: "Mencionaram-me", query: "is:open mentions:@me" },
  ],
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

export function parseIssueConfig(value: unknown): IssueConfig {
  const root = configObject(value)
  if (root?.version !== 1) return structuredClone(DEFAULT_ISSUE_CONFIG)
  const base = parseRemoteConfigBase(root, {
    defaultSections: DEFAULT_ISSUE_SECTIONS,
    previousDefaultSets: PREVIOUS_DEFAULT_ISSUE_SECTION_SETS,
    columns: ISSUE_COLUMNS,
    sorts: ISSUE_SORTS,
    validRepository: validateIssueRepositoryName,
  })
  return {
    version: 1,
    ...base,
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
