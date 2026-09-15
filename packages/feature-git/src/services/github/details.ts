import { boundedPullRequestDescription, sanitizeGitHubText } from "../../model/pr/content"
import { normalizeGitHubReactionGroups } from "../../model/reactions"
import type {
  PullRequestActor,
  PullRequestCheck,
  PullRequestCheckState,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetails,
  PullRequestFile,
  PullRequestIdentity,
  PullRequestPageInfo,
  PullRequestReview,
  PullRequestReviewRequest,
  PullRequestTimelineEvent,
} from "../../model/pr/types"
import { PULL_REQUEST_DETAILS_QUERY } from "./detail-query"
import { type GhTransportOptions, runGhJson } from "./transport"

type RawDetails = {
  data?: {
    repository?: {
      viewerPermission?: unknown
      mergeCommitAllowed?: unknown
      squashMergeAllowed?: unknown
      rebaseMergeAllowed?: unknown
      pullRequest?: Record<string, unknown> | null
    } | null
  }
  errors?: unknown[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown) {
  return typeof value === "string" ? sanitizeGitHubText(value) : ""
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function nodes(value: unknown) {
  const list = record(value)?.nodes
  return Array.isArray(list) ? list : []
}

function actor(value: unknown): PullRequestActor {
  const candidate = record(value)
  return { login: stringValue(candidate?.login) || "ghost" }
}

function pageInfo(value: unknown, parsedCount: number): PullRequestPageInfo {
  const connection = record(value)
  const page = record(connection?.pageInfo)
  return {
    totalCount: typeof connection?.totalCount === "number" ? connection.totalCount : parsedCount,
    hasNextPage: page?.hasNextPage === true,
    endCursor: stringValue(page?.endCursor) || null,
    partial: false,
  }
}

function normalizeReviewRequests(value: unknown): PullRequestReviewRequest[] {
  return nodes(value).flatMap((entry) => {
    const request = record(entry)
    const reviewer = record(request?.requestedReviewer)
    if (!reviewer) return []
    const team = stringValue(reviewer.slug) || stringValue(reviewer.name)
    const login = stringValue(reviewer.login) || team
    if (!login) return []
    return [
      {
        login,
        kind: reviewer.__typename === "Team" ? "team" : "user",
        asCodeOwner: request?.asCodeOwner === true,
      },
    ]
  })
}

function reviewState(value: string): PullRequestReview["state"] {
  if (value === "APPROVED") return "approved"
  if (value === "CHANGES_REQUESTED") return "changes-requested"
  if (value === "COMMENTED") return "commented"
  if (value === "DISMISSED") return "dismissed"
  if (value === "PENDING") return "pending"
  return "unknown"
}

function normalizeReviews(value: unknown): PullRequestReview[] {
  return nodes(value).flatMap((entry) => {
    const review = record(entry)
    const id = stringValue(review?.id)
    if (!review || !id) return []
    return [
      {
        id,
        author: actor(review.author),
        state: reviewState(stringValue(review.state)),
        body: stringValue(review.body),
        submittedAt: stringValue(review.submittedAt),
        commitSha: stringValue(record(review.commit)?.oid),
      },
    ]
  })
}

function normalizeCommits(value: unknown): PullRequestCommit[] {
  return nodes(value).flatMap((entry) => {
    const commit = record(record(entry)?.commit)
    const sha = stringValue(commit?.oid)
    if (!commit || !sha) return []
    const rawAuthor = record(commit.author)
    const user = record(rawAuthor?.user)
    return [
      {
        sha,
        headline: stringValue(commit.messageHeadline),
        authoredAt: stringValue(commit.authoredDate),
        author: { login: stringValue(user?.login) || stringValue(rawAuthor?.name) || "ghost" },
      },
    ]
  })
}

function normalizeFiles(value: unknown): PullRequestFile[] {
  return nodes(value).flatMap((entry) => {
    const file = record(entry)
    const path = stringValue(file?.path)
    return path
      ? [
          {
            path,
            additions: numberValue(file?.additions),
            deletions: numberValue(file?.deletions),
            changeType: stringValue(file?.changeType),
          },
        ]
      : []
  })
}

function normalizeComments(value: unknown): PullRequestComment[] {
  return nodes(value).flatMap((entry) => {
    const comment = record(entry)
    const id = stringValue(comment?.id)
    if (!comment || !id) return []
    return [
      {
        id,
        author: actor(comment.author),
        body: stringValue(comment.body),
        createdAt: stringValue(comment.createdAt),
        url: stringValue(comment.url),
        reactionGroups: normalizeGitHubReactionGroups(comment.reactionGroups),
      },
    ]
  })
}

function timelineKind(type: string): PullRequestTimelineEvent["kind"] {
  if (type === "IssueComment") return "comment"
  if (type === "PullRequestReview") return "review"
  if (type === "ClosedEvent") return "closed"
  if (type === "ReopenedEvent") return "reopened"
  if (type === "MergedEvent") return "merged"
  if (type === "ReadyForReviewEvent") return "ready"
  if (type === "ConvertToDraftEvent") return "draft"
  if (type === "ReviewRequestedEvent") return "review-requested"
  if (type === "AssignedEvent") return "assigned"
  return "unknown"
}

function normalizeTimeline(value: unknown): PullRequestTimelineEvent[] {
  return nodes(value).flatMap((entry) => {
    const event = record(entry)
    const id = stringValue(event?.id)
    if (!event || !id) return []
    const reviewer = record(event.requestedReviewer)
    const assignee = record(event.assignee)
    const related =
      stringValue(reviewer?.login) || stringValue(reviewer?.slug) || stringValue(assignee?.login)
    return [
      {
        id,
        kind: timelineKind(stringValue(event.__typename)),
        actor: actor(event.actor ?? event.author),
        body: stringValue(event.body) || related,
        createdAt: stringValue(event.createdAt) || stringValue(event.submittedAt),
        state: stringValue(event.state) || stringValue(record(event.commit)?.oid),
      },
    ]
  })
}

function repositoryPermission(
  value: unknown,
): PullRequestDetails["permissions"]["repositoryPermission"] {
  const permission = stringValue(value).toLowerCase()
  if (["admin", "maintain", "write", "triage", "read", "none"].includes(permission)) {
    return permission as PullRequestDetails["permissions"]["repositoryPermission"]
  }
  return "unknown"
}

function checkState(value: string): PullRequestCheckState {
  if (value === "SUCCESS") return "success"
  if (["FAILURE", "ERROR", "TIMED_OUT", "STARTUP_FAILURE"].includes(value)) return "failure"
  if (["QUEUED", "PENDING", "IN_PROGRESS", "WAITING", "REQUESTED"].includes(value)) return "pending"
  if (value === "CANCELLED") return "cancelled"
  if (["SKIPPED", "NEUTRAL", "STALE"].includes(value)) return "skipped"
  return value ? "unknown" : "none"
}

function normalizeChecks(value: unknown): PullRequestCheck[] {
  return nodes(value).flatMap((entry) => {
    const check = record(entry)
    if (!check) return []
    const checkRun = check.__typename === "CheckRun"
    const id = stringValue(check.id) || String(check.databaseId ?? "")
    const name = stringValue(checkRun ? check.name : check.context)
    const rawState =
      stringValue(check.conclusion) || stringValue(check.status) || stringValue(check.state)
    if (!id || !name) return []
    return [
      {
        id,
        name,
        state: checkState(rawState),
        detailsUrl: stringValue(checkRun ? check.detailsUrl : check.targetUrl),
        provider: checkRun
          ? stringValue(record(record(check.checkSuite)?.app)?.name) || "GitHub Actions"
          : stringValue(record(check.creator)?.login) || "GitHub",
      },
    ]
  })
}

function mergeable(value: string): PullRequestDetails["mergeable"] {
  if (value === "MERGEABLE") return "mergeable"
  if (value === "CONFLICTING") return "conflicting"
  return "unknown"
}

function remoteState(value: string, mergedAt: string): PullRequestDetails["remoteState"] {
  if (mergedAt) return "merged"
  if (value === "OPEN") return "open"
  if (value === "CLOSED") return "closed"
  if (value === "MERGED") return "merged"
  return "unknown"
}

function mergeQueueEntry(value: unknown): PullRequestDetails["mergeQueueEntry"] {
  const entry = record(value)
  if (!entry || typeof entry.position !== "number") return null
  return {
    position: entry.position,
    state: stringValue(entry.state),
    enqueuedAt: stringValue(entry.enqueuedAt),
  }
}

function autoMergeRequest(value: unknown): PullRequestDetails["autoMergeRequest"] {
  const request = record(value)
  if (!request) return null
  return {
    method: stringValue(request.mergeMethod),
    enabledAt: stringValue(request.enabledAt),
    enabledBy: stringValue(record(request.enabledBy)?.login),
  }
}

export function normalizePullRequestDetails(
  raw: RawDetails,
  identity: PullRequestIdentity,
): PullRequestDetails | null {
  const pullRequest = raw.data?.repository?.pullRequest
  if (!pullRequest) return null
  const reviewRequests = normalizeReviewRequests(pullRequest.reviewRequests)
  const assignees = nodes(pullRequest.assignees).map(actor)
  const reviews = normalizeReviews(pullRequest.reviews)
  const commits = normalizeCommits(pullRequest.commits)
  const files = normalizeFiles(pullRequest.files)
  const comments = normalizeComments(pullRequest.comments)
  const timeline = normalizeTimeline(pullRequest.timelineItems)
  const checkConnection = record(pullRequest.statusCheckRollup)?.contexts
  const checks = normalizeChecks(checkConnection)
  const description = boundedPullRequestDescription(stringValue(pullRequest.body))
  const partial = Boolean(raw.errors?.length) || description.truncated
  return {
    identity,
    body: description.body,
    baseSha: stringValue(pullRequest.baseRefOid),
    headSha: stringValue(pullRequest.headRefOid),
    remoteState: remoteState(stringValue(pullRequest.state), stringValue(pullRequest.mergedAt)),
    isDraft: pullRequest.isDraft === true,
    mergedAt: stringValue(pullRequest.mergedAt),
    mergeable: mergeable(stringValue(pullRequest.mergeable)),
    mergeState: stringValue(pullRequest.mergeStateStatus),
    mergeQueueConfigured: Boolean(record(pullRequest.mergeQueue)),
    mergeQueueEntry: mergeQueueEntry(pullRequest.mergeQueueEntry),
    autoMergeRequest: autoMergeRequest(pullRequest.autoMergeRequest),
    assignees,
    reviewRequests,
    reviews,
    commits,
    files,
    comments,
    reactionGroups: normalizeGitHubReactionGroups(pullRequest.reactionGroups),
    timeline,
    checks,
    pages: {
      reviewRequests: { ...pageInfo(pullRequest.reviewRequests, reviewRequests.length), partial },
      reviews: { ...pageInfo(pullRequest.reviews, reviews.length), partial },
      commits: { ...pageInfo(pullRequest.commits, commits.length), partial },
      files: { ...pageInfo(pullRequest.files, files.length), partial },
      comments: { ...pageInfo(pullRequest.comments, comments.length), partial },
      timeline: { ...pageInfo(pullRequest.timelineItems, timeline.length), partial },
      checks: { ...pageInfo(checkConnection, checks.length), partial },
    },
    permissions: {
      canUpdateBranch: pullRequest.viewerCanUpdateBranch === true,
      canClose: pullRequest.viewerCanClose === true,
      canReopen: pullRequest.viewerCanReopen === true,
      canMerge: ["ADMIN", "MAINTAIN", "WRITE"].includes(
        stringValue(raw.data?.repository?.viewerPermission),
      ),
      canMarkReady: pullRequest.viewerCanUpdate === true,
      repositoryPermission: repositoryPermission(raw.data?.repository?.viewerPermission),
      mergeMethods: [
        ...(raw.data?.repository?.mergeCommitAllowed === true ? (["merge"] as const) : []),
        ...(raw.data?.repository?.squashMergeAllowed === true ? (["squash"] as const) : []),
        ...(raw.data?.repository?.rebaseMergeAllowed === true ? (["rebase"] as const) : []),
      ],
    },
    partial,
  }
}

export async function loadPullRequestDetails({
  identity,
  options = {},
}: {
  identity: PullRequestIdentity
  options?: GhTransportOptions
}) {
  const body = JSON.stringify({
    query: PULL_REQUEST_DETAILS_QUERY,
    variables: {
      owner: identity.owner,
      name: identity.repository,
      number: identity.number,
    },
  })
  const raw = await runGhJson<RawDetails>(
    { args: ["api", "graphql", "--hostname", identity.host, "--input", "-"], stdin: body },
    { ...options, host: identity.host },
  )
  return normalizePullRequestDetails(raw, identity)
}
