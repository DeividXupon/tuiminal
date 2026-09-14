import type { PullRequestDetails, PullRequestPreviewTab } from "./types"

export type PullRequestDetailConnection = keyof PullRequestDetails["pages"]

const TAB_CONNECTIONS: Record<PullRequestPreviewTab, readonly PullRequestDetailConnection[]> = {
  overview: ["reviewRequests", "reviews"],
  checks: ["checks"],
  activity: ["timeline", "comments", "reviews"],
  commits: ["commits"],
  files: ["files"],
}

export function nextPullRequestDetailConnection(
  details: PullRequestDetails,
  tab: PullRequestPreviewTab,
) {
  return TAB_CONNECTIONS[tab].find((connection) => details.pages[connection].hasNextPage) ?? null
}

function mergeUnique<T>(current: readonly T[], additions: readonly T[], key: (value: T) => string) {
  const values = new Map(current.map((value) => [key(value), value]))
  for (const value of additions) values.set(key(value), value)
  return [...values.values()]
}

export function mergePullRequestDetailPage(
  current: PullRequestDetails,
  page: PullRequestDetails,
  connection: PullRequestDetailConnection,
): PullRequestDetails {
  const next = { ...current, pages: { ...current.pages, [connection]: page.pages[connection] } }
  if (connection === "reviewRequests") {
    next.reviewRequests = mergeUnique(
      current.reviewRequests,
      page.reviewRequests,
      (value) => `${value.kind}:${value.login}`,
    )
  } else if (connection === "reviews") {
    next.reviews = mergeUnique(current.reviews, page.reviews, (value) => value.id)
  } else if (connection === "commits") {
    next.commits = mergeUnique(current.commits, page.commits, (value) => value.sha)
  } else if (connection === "files") {
    next.files = mergeUnique(current.files, page.files, (value) => value.path)
  } else if (connection === "comments") {
    next.comments = mergeUnique(current.comments, page.comments, (value) => value.id)
  } else if (connection === "timeline") {
    next.timeline = mergeUnique(current.timeline, page.timeline, (value) => value.id)
  } else {
    next.checks = mergeUnique(current.checks, page.checks, (value) => value.id)
  }
  next.partial = Object.values(next.pages).some((info) => info.partial || info.hasNextPage)
  return next
}
