import {
  isGitHubReactionContent,
  normalizeGitHubReactionGroups,
  type GitHubReactionGroup,
} from "../../model/reactions"
import { type GhTransportOptions, runGhJson } from "./transport"

const REACTION_TARGET_QUERY = `
query TuiminalReactionTarget($id: ID!) {
  node(id: $id) {
    __typename
    ... on Issue { id url reactionGroups { content viewerHasReacted users { totalCount } } }
    ... on PullRequest { id url reactionGroups { content viewerHasReacted users { totalCount } } }
    ... on IssueComment { id url reactionGroups { content viewerHasReacted users { totalCount } } }
  }
}`

export type GitHubReactionTarget = {
  id: string
  url: string
  type: "Issue" | "PullRequest" | "IssueComment"
  reactionGroups: GitHubReactionGroup[]
}

export async function loadGitHubReactionTarget({
  host,
  id,
  options = {},
}: {
  host: string
  id: string
  options?: GhTransportOptions
}): Promise<GitHubReactionTarget | null> {
  const raw = await runGhJson<{
    data?: { node?: Record<string, unknown> | null }
  }>(
    {
      args: ["api", "graphql", "--hostname", host, "--input", "-"],
      stdin: JSON.stringify({ query: REACTION_TARGET_QUERY, variables: { id } }),
    },
    { ...options, host },
  )
  const node = raw.data?.node
  if (!node) return null
  const type = node?.__typename
  const nodeId = node?.id
  const url = node?.url
  if (
    (type !== "Issue" && type !== "PullRequest" && type !== "IssueComment") ||
    typeof nodeId !== "string" ||
    typeof url !== "string"
  ) {
    return null
  }
  return {
    id: nodeId,
    url,
    type,
    reactionGroups: normalizeGitHubReactionGroups(node.reactionGroups),
  }
}

export type GitHubReactionWriteResult =
  | { status: "confirmed"; message: string }
  | { status: "rejected"; reason: string }
  | { status: "uncertain"; reason: string }

export async function executeGitHubReactionWrite({
  host,
  subjectId,
  expectedType,
  expectedUrl,
  content,
  write,
  options = {},
}: {
  host: string
  subjectId: string
  expectedType: GitHubReactionTarget["type"]
  expectedUrl: string
  content: unknown
  write: () => Promise<GitHubReactionWriteResult>
  options?: GhTransportOptions
}): Promise<GitHubReactionWriteResult> {
  if (!isGitHubReactionContent(content)) return { status: "rejected", reason: "invalid-reaction" }
  const before = await loadGitHubReactionTarget({ host, id: subjectId, options })
  if (!before || before.type !== expectedType || before.url !== expectedUrl) {
    return { status: "rejected", reason: "invalid-reaction-target" }
  }
  const result = await write()
  if (result.status !== "confirmed") return result
  try {
    const after = await loadGitHubReactionTarget({ host, id: subjectId, options })
    const reconciled = after?.reactionGroups.some(
      (group) => group.content === content && group.viewerHasReacted,
    )
    return reconciled
      ? { status: "confirmed", message: "reaction-reconciled" }
      : { status: "uncertain", reason: "accepted-awaiting-reconciliation" }
  } catch {
    return { status: "uncertain", reason: "accepted-reconciliation-failed" }
  }
}
