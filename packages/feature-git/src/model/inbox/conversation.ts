import type { IssueAuthContext, IssueDetails, IssueSummary } from "../issue/types"
import type { PullRequestDetails, PullRequestSummary } from "../pr/types"
import type { InboxSubject } from "./subject"
import type { InboxNotification } from "./types"
import { issueCommentThread } from "../issue/activity"
import { pullRequestActivity } from "../pr/activity"
import { nextPullRequestDetailConnection } from "../pr/detail-pagination"

export type InboxConversationTarget = { notification: InboxNotification; subject: InboxSubject }
export type InboxConversation =
  | { kind: "issue"; item: IssueSummary; details: IssueDetails; auth: IssueAuthContext }
  | { kind: "pr"; item: PullRequestSummary; details: PullRequestDetails; auth: IssueAuthContext }

export function matchingInboxConversation(
  candidate: InboxConversation | null,
  target: InboxConversationTarget | null,
) {
  if (!candidate || !target) return null
  const { identity } = candidate.item
  const { subject } = target
  return candidate.kind === subject.kind &&
    identity.host === subject.host &&
    identity.owner === subject.owner &&
    identity.repository === subject.repository &&
    identity.number === subject.number
    ? candidate
    : null
}

export function inboxConversationEntries(data: InboxConversation | null) {
  if (!data) return []
  return data.kind === "issue"
    ? issueCommentThread(data.details.comments, data.details.identity)
    : pullRequestActivity(data.details)
}

export function inboxConversationPageKey(
  data: InboxConversation | null,
  identity: string | undefined,
) {
  if (!data) return null
  if (data.kind === "issue") {
    const page = data.details.commentPage
    return page.hasNextPage ? `${identity}:comments:${page.endCursor}` : null
  }
  const connection = nextPullRequestDetailConnection(data.details, "activity")
  return connection ? `${identity}:${connection}:${data.details.pages[connection].endCursor}` : null
}
