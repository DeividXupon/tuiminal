import { threadGitHubDiscussionComments, type GitHubDiscussionIdentity } from "../reactions"
import type { PullRequestComment } from "./types"

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
