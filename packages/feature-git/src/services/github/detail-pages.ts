import type { PullRequestDetailConnection } from "../../model/pr/detail-pagination"
import type { PullRequestIdentity } from "../../model/pr/types"
import { normalizePullRequestDetails } from "./details"
import { type GhTransportOptions, runGhJson } from "./transport"

const CONNECTION_FIELDS: Record<PullRequestDetailConnection, string> = {
  reviewRequests: `reviewRequests(first: 50, after: $after) {
    totalCount pageInfo { hasNextPage endCursor }
    nodes { asCodeOwner requestedReviewer { __typename ... on User { login } ... on Team { slug name } } }
  }`,
  reviews: `reviews(first: 50, after: $after) {
    totalCount pageInfo { hasNextPage endCursor }
    nodes { id state body submittedAt author { login } commit { oid } }
  }`,
  commits: `commits(first: 50, after: $after) {
    totalCount pageInfo { hasNextPage endCursor }
    nodes { commit { oid messageHeadline authoredDate author { name user { login } } } }
  }`,
  files: `files(first: 100, after: $after) {
    totalCount pageInfo { hasNextPage endCursor }
    nodes { path additions deletions changeType }
  }`,
  comments: `comments(first: 50, after: $after) {
    totalCount pageInfo { hasNextPage endCursor }
    nodes { id body createdAt url author { login } reactionGroups { content viewerHasReacted users { totalCount } } }
  }`,
  timeline: `timelineItems(first: 50, after: $after) {
    totalCount pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on IssueComment { id body createdAt author { login } }
      ... on PullRequestReview { id body submittedAt state author { login } }
      ... on ClosedEvent { id createdAt actor { login } }
      ... on ReopenedEvent { id createdAt actor { login } }
      ... on MergedEvent { id createdAt actor { login } commit { oid } }
      ... on ReadyForReviewEvent { id createdAt actor { login } }
      ... on ConvertToDraftEvent { id createdAt actor { login } }
      ... on ReviewRequestedEvent { id createdAt actor { login } requestedReviewer { ... on User { login } ... on Team { slug } } }
      ... on AssignedEvent { id createdAt actor { login } assignee { ... on User { login } } }
    }
  }`,
  checks: `statusCheckRollup { contexts(first: 50, after: $after) {
    totalCount pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on CheckRun { databaseId name status conclusion detailsUrl checkSuite { app { name } } }
      ... on StatusContext { id context state targetUrl creator { login } }
    }
  } }`,
}

type RawDetailPage = {
  data?: { repository?: { pullRequest?: Record<string, unknown> | null } | null }
  errors?: unknown[]
}

export async function loadPullRequestDetailPage({
  identity,
  connection,
  after,
  options = {},
}: {
  identity: PullRequestIdentity
  connection: PullRequestDetailConnection
  after: string
  options?: GhTransportOptions
}) {
  const query = `query TuiminalPullRequestDetailPage($owner: String!, $name: String!, $number: Int!, $after: String!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) { ${CONNECTION_FIELDS[connection]} }
    }
  }`
  const body = JSON.stringify({
    query,
    variables: {
      owner: identity.owner,
      name: identity.repository,
      number: identity.number,
      after,
    },
  })
  const raw = await runGhJson<RawDetailPage>(
    { args: ["api", "graphql", "--hostname", identity.host, "--input", "-"], stdin: body },
    { ...options, host: identity.host },
  )
  return normalizePullRequestDetails(raw, identity)
}
