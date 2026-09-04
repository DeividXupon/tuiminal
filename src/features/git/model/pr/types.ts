export type PullRequestState = "open" | "draft" | "merged" | "closed"
export type PullRequestReviewState =
  | "approved"
  | "changes-requested"
  | "review-required"
  | "unknown"
export type PullRequestCheckState =
  | "success"
  | "failure"
  | "pending"
  | "cancelled"
  | "skipped"
  | "none"
  | "unknown"

export type PullRequestIdentity = {
  host: string
  nodeId: string
  owner: string
  repository: string
  number: number
  url: string
}

export type PullRequestActor = {
  login: string
  displayName?: string
}

export type PullRequestLabel = {
  name: string
  color?: string
}

export type PullRequestSummary = {
  identity: PullRequestIdentity
  title: string
  state: PullRequestState
  author: PullRequestActor
  assignees: PullRequestActor[]
  baseBranch: string
  headBranch: string
  headSha: string
  commentCount: number
  reviewState: PullRequestReviewState
  checkState: PullRequestCheckState
  labels: PullRequestLabel[]
  additions: number
  deletions: number
  changedFiles: number
  updatedAt: string
  isFork: boolean
}

export type PullRequestSection = {
  id: string
  title: string
  query: string
  columns?: PullRequestColumn[]
  sort?: PullRequestSort
  limit?: number
}

export type PullRequestColumn =
  | "repository"
  | "state"
  | "title"
  | "author"
  | "assignees"
  | "base"
  | "comments"
  | "review"
  | "ci"
  | "labels"
  | "changes"

export type PullRequestSort = "updated-desc" | "updated-asc" | "number-desc" | "number-asc"

export type PullRequestAuthContext = {
  host: string
  viewerId: string
  viewerLogin: string
  generation: number
}

export type PullRequestPreviewTab = "overview" | "checks" | "activity" | "commits" | "files"

export type PullRequestPageInfo = {
  totalCount: number | null
  hasNextPage: boolean
  endCursor: string | null
  partial: boolean
}

export type PullRequestReviewRequest = {
  login: string
  kind: "user" | "team"
  asCodeOwner: boolean
}

export type PullRequestReview = {
  id: string
  author: PullRequestActor
  state: "approved" | "changes-requested" | "commented" | "dismissed" | "pending" | "unknown"
  body: string
  submittedAt: string
  commitSha: string
}

export type PullRequestCommit = {
  sha: string
  headline: string
  authoredAt: string
  author: PullRequestActor
}

export type PullRequestFile = {
  path: string
  additions: number
  deletions: number
  changeType: string
}

export type PullRequestComment = {
  id: string
  author: PullRequestActor
  body: string
  createdAt: string
  url: string
}

export type PullRequestCheck = {
  id: string
  attempt?: number
  name: string
  state: PullRequestCheckState
  detailsUrl: string
  provider: string
}

export type PullRequestTimelineEvent = {
  id: string
  kind:
    | "comment"
    | "review"
    | "closed"
    | "reopened"
    | "merged"
    | "ready"
    | "draft"
    | "review-requested"
    | "assigned"
    | "unknown"
  actor: PullRequestActor
  body: string
  createdAt: string
  state: string
}

export type PullRequestPermissions = {
  canUpdateBranch: boolean
  canClose: boolean
  canReopen: boolean
  canMerge: boolean
  canMarkReady: boolean
  repositoryPermission: "admin" | "maintain" | "write" | "triage" | "read" | "none" | "unknown"
  mergeMethods: PullRequestMergeMethod[]
}

export type PullRequestMergeMethod = "merge" | "squash" | "rebase"

export type PullRequestDetails = {
  identity: PullRequestIdentity
  body: string
  baseSha: string
  headSha: string
  remoteState: "open" | "closed" | "merged" | "unknown"
  isDraft: boolean
  mergedAt: string
  mergeable: "mergeable" | "conflicting" | "unknown"
  mergeState: string
  mergeQueueConfigured: boolean
  mergeQueueEntry: { position: number; state: string; enqueuedAt: string } | null
  autoMergeRequest: { method: string; enabledAt: string; enabledBy: string } | null
  assignees: PullRequestActor[]
  reviewRequests: PullRequestReviewRequest[]
  reviews: PullRequestReview[]
  commits: PullRequestCommit[]
  files: PullRequestFile[]
  comments: PullRequestComment[]
  timeline: PullRequestTimelineEvent[]
  checks: PullRequestCheck[]
  pages: {
    reviewRequests: PullRequestPageInfo
    reviews: PullRequestPageInfo
    commits: PullRequestPageInfo
    files: PullRequestPageInfo
    comments: PullRequestPageInfo
    timeline: PullRequestPageInfo
    checks: PullRequestPageInfo
  }
  permissions: PullRequestPermissions
  partial: boolean
}
