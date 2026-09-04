import type {
  PullRequestActor,
  PullRequestCheckState,
  PullRequestLabel,
  PullRequestReviewState,
  PullRequestState,
  PullRequestSummary,
} from "../../model/pr/types"
import { sanitizeGitHubText } from "../../model/pr/content"
import { type GhTransportOptions, runGhJson } from "./transport"

const SEARCH_QUERY = `
query TuiminalPullRequests($searchQuery: String!, $first: Int!, $after: String) {
  search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    issueCount
    nodes {
      ... on PullRequest {
        id number url title state isDraft updatedAt isCrossRepository
        baseRefName headRefName headRefOid additions deletions changedFiles
        author { login }
        repository { name owner { login } }
        assignees(first: 10) { nodes { login } }
        labels(first: 10) { nodes { name color } }
        comments { totalCount }
        reviewDecision
        statusCheckRollup { state }
      }
    }
  }
}`

type RawSearchPage = {
  data?: {
    search?: {
      issueCount?: number
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
      nodes?: unknown[]
    }
  }
  errors?: unknown[]
}

export type PullRequestSearchPage = {
  items: PullRequestSummary[]
  totalCount: number | null
  hasNextPage: boolean
  endCursor: string | null
  partial: boolean
}

function stringValue(value: unknown) {
  return typeof value === "string" ? sanitizeGitHubText(value) : ""
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function actorNodes(value: unknown): PullRequestActor[] {
  if (!value || typeof value !== "object") return []
  const nodes = (value as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    const login =
      node && typeof node === "object" ? stringValue((node as { login?: unknown }).login) : ""
    return login ? [{ login }] : []
  })
}

function labelNodes(value: unknown): PullRequestLabel[] {
  if (!value || typeof value !== "object") return []
  const nodes = (value as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    if (!node || typeof node !== "object") return []
    const label = node as { name?: unknown; color?: unknown }
    const name = stringValue(label.name)
    const color = stringValue(label.color)
    return name ? [{ name, ...(color ? { color } : {}) }] : []
  })
}

function pullRequestState(state: string, draft: boolean): PullRequestState {
  if (state === "MERGED") return "merged"
  if (state === "CLOSED") return "closed"
  return draft ? "draft" : "open"
}

function reviewState(value: string): PullRequestReviewState {
  if (value === "APPROVED") return "approved"
  if (value === "CHANGES_REQUESTED") return "changes-requested"
  if (value === "REVIEW_REQUIRED") return "review-required"
  return "unknown"
}

function checkState(value: string): PullRequestCheckState {
  if (value === "SUCCESS") return "success"
  if (value === "FAILURE" || value === "ERROR") return "failure"
  if (value === "PENDING" || value === "EXPECTED") return "pending"
  if (!value) return "none"
  return "unknown"
}

function normalizeNode(node: unknown, host: string): PullRequestSummary | null {
  if (!node || typeof node !== "object") return null
  const raw = node as Record<string, unknown>
  const repository = raw.repository as { name?: unknown; owner?: { login?: unknown } } | undefined
  const owner = stringValue(repository?.owner?.login)
  const repositoryName = stringValue(repository?.name)
  const nodeId = stringValue(raw.id)
  const number = numberValue(raw.number)
  const url = stringValue(raw.url)
  if (!owner || !repositoryName || !nodeId || !number || !url) return null
  return {
    identity: { host, nodeId, owner, repository: repositoryName, number, url },
    title: stringValue(raw.title),
    state: pullRequestState(stringValue(raw.state), raw.isDraft === true),
    author: {
      login: stringValue((raw.author as { login?: unknown } | undefined)?.login) || "ghost",
    },
    assignees: actorNodes(raw.assignees),
    baseBranch: stringValue(raw.baseRefName),
    headBranch: stringValue(raw.headRefName),
    headSha: stringValue(raw.headRefOid),
    commentCount: numberValue((raw.comments as { totalCount?: unknown } | undefined)?.totalCount),
    reviewState: reviewState(stringValue(raw.reviewDecision)),
    checkState: checkState(
      stringValue((raw.statusCheckRollup as { state?: unknown } | undefined)?.state),
    ),
    labels: labelNodes(raw.labels),
    additions: numberValue(raw.additions),
    deletions: numberValue(raw.deletions),
    changedFiles: numberValue(raw.changedFiles),
    updatedAt: stringValue(raw.updatedAt),
    isFork: raw.isCrossRepository === true,
  }
}

export function normalizePullRequestSearchPage(
  raw: RawSearchPage,
  host: string,
): PullRequestSearchPage {
  const search = raw.data?.search
  const nodes = Array.isArray(search?.nodes) ? search.nodes : []
  const items = nodes.flatMap((node) => {
    const item = normalizeNode(node, host)
    return item ? [item] : []
  })
  return {
    items,
    totalCount: typeof search?.issueCount === "number" ? search.issueCount : null,
    hasNextPage: search?.pageInfo?.hasNextPage === true,
    endCursor: stringValue(search?.pageInfo?.endCursor) || null,
    partial: Boolean(raw.errors?.length) || items.length !== nodes.length,
  }
}

export async function searchPullRequestsPage({
  host,
  query,
  first = 20,
  after = null,
  options = {},
}: {
  host: string
  query: string
  first?: number
  after?: string | null
  options?: GhTransportOptions
}) {
  const body = JSON.stringify({
    query: SEARCH_QUERY,
    variables: { searchQuery: query, first, after },
  })
  const raw = await runGhJson<RawSearchPage>(
    { args: ["api", "graphql", "--hostname", host, "--input", "-"], stdin: body },
    { ...options, host },
  )
  return normalizePullRequestSearchPage(raw, host)
}
