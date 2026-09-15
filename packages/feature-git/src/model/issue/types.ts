import type { GitHubReactionGroup } from "../reactions"

export type IssueState = "open" | "closed"

export type IssueIdentity = {
  host: string
  nodeId: string
  owner: string
  repository: string
  number: number
  url: string
}

export type IssueActor = {
  login: string
  displayName?: string
}

export type IssueLabel = {
  name: string
  color?: string
}

export type IssueSummary = {
  identity: IssueIdentity
  title: string
  state: IssueState
  author: IssueActor
  assignees: IssueActor[]
  labels: IssueLabel[]
  commentCount: number
  reactionCount: number
  createdAt: string
  updatedAt: string
}

export type IssueColumn =
  | "updated"
  | "state"
  | "repository"
  | "title"
  | "author"
  | "assignees"
  | "comments"
  | "reactions"
  | "labels"

export type IssueSort = "updated-desc" | "updated-asc" | "number-desc" | "number-asc"

export type IssueSection = {
  id: string
  title: string
  query: string
  columns?: IssueColumn[]
  sort?: IssueSort
  limit?: number
}

export type IssueAuthContext = {
  host: string
  viewerId: string
  viewerLogin: string
  generation: number
}

export type IssuePreviewTab = "overview" | "activity"

export type IssuePageInfo = {
  totalCount: number | null
  hasNextPage: boolean
  endCursor: string | null
  partial: boolean
}

export type IssueComment = {
  id: string
  author: IssueActor
  body: string
  createdAt: string
  updatedAt: string
  url: string
  reactionCount: number
  reactionGroups?: GitHubReactionGroup[]
}

export type IssuePermissions = {
  canClose: boolean
  canReopen: boolean
  canUpdate: boolean
  repositoryPermission: "admin" | "maintain" | "write" | "triage" | "read" | "none" | "unknown"
}

export type IssueDetails = {
  identity: IssueIdentity
  title: string
  body: string
  state: IssueState
  author: IssueActor
  assignees: IssueActor[]
  labels: IssueLabel[]
  comments: IssueComment[]
  commentPage: IssuePageInfo
  reactionCount: number
  reactionGroups?: GitHubReactionGroup[]
  createdAt: string
  updatedAt: string
  closedAt: string
  permissions: IssuePermissions
  metadataComplete: boolean
  partial: boolean
}
