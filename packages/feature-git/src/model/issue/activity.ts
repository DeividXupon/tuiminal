import { threadGitHubDiscussionComments, type GitHubDiscussionIdentity } from "../reactions"
import type { IssueComment } from "./types"

export function issueCommentThread(
  comments: readonly IssueComment[],
  identity: GitHubDiscussionIdentity,
) {
  return threadGitHubDiscussionComments(comments, identity)
}

export function sortedIssueComments(
  comments: readonly IssueComment[],
  identity: GitHubDiscussionIdentity,
) {
  return issueCommentThread(comments, identity).map((entry) => entry.comment)
}
