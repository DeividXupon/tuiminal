import {
  isGitHubDiscussionCommentUrl,
  isGitHubReactionContent,
  type GitHubDiscussionIdentity,
} from "../../model/reactions"

type DiscussionMutation = {
  kind: string
  target: GitHubDiscussionIdentity & { nodeId: string }
  payload: Readonly<Record<string, unknown>>
}

function textPayload(action: DiscussionMutation, key: string) {
  const value = action.payload[key]
  return typeof value === "string" ? value : ""
}

function validateReaction(action: DiscussionMutation) {
  const subjectId = textPayload(action, "subjectId")
  const subjectKind = textPayload(action, "subjectKind")
  if (!isGitHubReactionContent(action.payload.reaction)) return "invalid-reaction"
  if (subjectKind === "item") {
    return subjectId === action.target.nodeId ? null : "invalid-reaction-target"
  }
  if (subjectKind !== "comment" || !subjectId) return "invalid-reaction-target"
  return isGitHubDiscussionCommentUrl(textPayload(action, "commentUrl"), action.target)
    ? null
    : "invalid-reaction-target"
}

export function validateDiscussionMutation(action: DiscussionMutation) {
  if (["comment", "reply"].includes(action.kind) && !textPayload(action, "body").trim()) {
    return "empty-body"
  }
  if (action.kind === "reply") {
    if (!textPayload(action, "commentId")) return "comment-required"
    return isGitHubDiscussionCommentUrl(textPayload(action, "commentUrl"), action.target)
      ? null
      : "invalid-comment-target"
  }
  return action.kind === "reaction" ? validateReaction(action) : null
}
