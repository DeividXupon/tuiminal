import { threadGitHubDiscussionComments, type GitHubDiscussionIdentity } from "../reactions"
import type { PullRequestComment, PullRequestDetails } from "./types"

export function pullRequestCommentThread(
  comments: readonly PullRequestComment[],
  identity: GitHubDiscussionIdentity,
) {
  return threadGitHubDiscussionComments(comments, identity)
}

export function sortedPullRequestComments(
  comments: readonly PullRequestComment[],
  identity: GitHubDiscussionIdentity,
) {
  return pullRequestCommentThread(comments, identity).map((entry) => entry.comment)
}

export type PullRequestActivityEntry = {
  id: string
  at: string
  author: string
  label: string
  comment: PullRequestComment | null
  body: string
  depth: number
  isReply: boolean
}

/** Keep replies beside their parent and use the same order for paint and navigation. */
export function pullRequestActivity(details: PullRequestDetails): PullRequestActivityEntry[] {
  const comments = pullRequestCommentThread(details.comments, details.identity)
  const knownIds = new Set(comments.map(({ comment }) => comment.id))
  const groups: Array<{ at: string; entries: PullRequestActivityEntry[] }> = []
  for (const entry of comments) {
    if (entry.depth === 0 || !groups.length) {
      groups.push({ at: entry.comment.createdAt, entries: [] })
    }
    groups.at(-1)?.entries.push({
      ...entry,
      id: entry.comment.id,
      at: entry.comment.createdAt,
      author: entry.comment.author.login,
      label: "",
    })
  }
  const otherEntries = [
    ...details.reviews.map((review) => ({
      id: review.id,
      at: review.submittedAt,
      author: review.author.login,
      label: review.state,
      body: review.body,
    })),
    ...details.timeline.map((event) => ({
      id: event.id,
      at: event.createdAt,
      author: event.actor.login,
      label:
        event.kind === "review" && event.state
          ? event.state.toLowerCase().replaceAll("_", "-")
          : event.kind,
      body: event.body,
    })),
  ]
  for (const entry of otherEntries) {
    if (knownIds.has(entry.id)) continue
    knownIds.add(entry.id)
    groups.push({
      at: entry.at,
      entries: [{ ...entry, comment: null, depth: 0, isReply: false }],
    })
  }
  return groups
    .sort((left, right) => right.at.localeCompare(left.at))
    .flatMap((group) => group.entries)
}
