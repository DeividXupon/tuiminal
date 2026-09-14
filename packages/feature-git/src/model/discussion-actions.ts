import {
  githubDiscussionReplyBody,
  isGitHubReactionContent,
  viewerHasGitHubReaction,
  type GitHubReactionGroup,
} from "./reactions"

type DiscussionAction = {
  kind: string
  payload: Readonly<Record<string, unknown>>
}

type DiscussionDetails = {
  identity: { nodeId: string }
  reactionGroups?: GitHubReactionGroup[]
  comments: Array<{
    id: string
    body: string
    author: { login: string }
    reactionGroups?: GitHubReactionGroup[]
  }>
}

export function discussionActionTargetPayload(
  kind: string,
  target: { nodeId: string },
  comment: { id: string; url: string; author: { login: string } } | null,
): Readonly<Record<string, unknown>> {
  if (kind === "reaction") {
    return {
      subjectId: comment?.id ?? target.nodeId,
      subjectKind: comment ? "comment" : "item",
      ...(comment ? { commentUrl: comment.url } : {}),
    }
  }
  if (kind !== "reply" || !comment) return {}
  return {
    commentId: comment.id,
    commentUrl: comment.url,
    commentAuthor: comment.author.login,
  }
}

function textPayload(action: DiscussionAction, key: string) {
  const value = action.payload[key]
  return typeof value === "string" ? value : ""
}

export function discussionMutationWasReconciled({
  action,
  after,
  viewerLogin,
}: {
  action: DiscussionAction
  after: DiscussionDetails
  viewerLogin: string
}): boolean | null {
  if (action.kind === "comment") {
    const body = textPayload(action, "body").trim()
    return after.comments.some(
      (comment) => comment.author.login === viewerLogin && comment.body.trim() === body,
    )
  }
  if (action.kind === "reply") {
    const body = githubDiscussionReplyBody({
      author: textPayload(action, "commentAuthor"),
      url: textPayload(action, "commentUrl"),
      body: textPayload(action, "body"),
    })
    return after.comments.some(
      (comment) => comment.author.login === viewerLogin && comment.body.trim() === body,
    )
  }
  if (action.kind !== "reaction") return null
  const content = action.payload.reaction
  const subjectId = textPayload(action, "subjectId")
  if (!isGitHubReactionContent(content)) return false
  const groups =
    subjectId === after.identity.nodeId
      ? after.reactionGroups
      : after.comments.find((comment) => comment.id === subjectId)?.reactionGroups
  return viewerHasGitHubReaction(groups, content)
}
