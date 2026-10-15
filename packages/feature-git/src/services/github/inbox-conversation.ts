import type { InboxConversation } from "../../model/inbox/conversation"
import type { InboxSubject } from "../../model/inbox/subject"
import { normalizeIssueSummary } from "./issue-search"
import { normalizePullRequestSummary } from "./search"
import { type GhTransportOptions, runGhJson } from "./transport"

const COMMON_FIELDS = `
  id number url title state updatedAt
  author { login }
  repository { name owner { login } }
  assignees(first: 10) { nodes { login } }
  labels(first: 10) { nodes { name color } }
  comments { totalCount }
`
const QUERY = `
query TuiminalInboxConversation($owner: String!, $name: String!, $number: Int!) {
  viewer { id login }
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue {
        ${COMMON_FIELDS}
        createdAt reactionGroups { users { totalCount } }
      }
      ... on PullRequest {
        ${COMMON_FIELDS}
        isDraft isCrossRepository baseRefName headRefName headRefOid
        additions deletions changedFiles reviewDecision statusCheckRollup { state }
      }
    }
  }
}`

type RawTarget = {
  data?: {
    viewer?: { id?: string; login?: string }
    repository?: { issueOrPullRequest?: { __typename?: string } | null } | null
  }
}
type ConversationHeader =
  | Omit<Extract<InboxConversation, { kind: "issue" }>, "details">
  | Omit<Extract<InboxConversation, { kind: "pr" }>, "details">

export function normalizeInboxConversationTarget(
  raw: RawTarget,
  subject: InboxSubject,
): ConversationHeader | null {
  const viewer = raw.data?.viewer
  const node = raw.data?.repository?.issueOrPullRequest
  if (
    typeof viewer?.id !== "string" ||
    !viewer.id ||
    typeof viewer.login !== "string" ||
    !viewer.login ||
    !node
  )
    return null
  const auth = { host: subject.host, viewerId: viewer.id, viewerLogin: viewer.login, generation: 0 }
  let result: ConversationHeader | null = null
  if (subject.kind === "issue" && node.__typename === "Issue") {
    const item = normalizeIssueSummary(node, subject.host)
    if (item) result = { kind: "issue", item, auth }
  } else if (subject.kind === "pr" && node.__typename === "PullRequest") {
    const item = normalizePullRequestSummary(node, subject.host)
    if (item) result = { kind: "pr", item, auth }
  }
  if (!result) return null
  const identity = result.item.identity
  const path = subject.kind === "issue" ? "issues" : "pull"
  if (
    identity.owner !== subject.owner ||
    identity.repository !== subject.repository ||
    identity.number !== subject.number ||
    identity.url !==
      `https://${subject.host}/${subject.owner}/${subject.repository}/${path}/${subject.number}`
  )
    return null
  return result
}

export async function loadInboxConversationTarget(
  subject: InboxSubject,
  options: GhTransportOptions,
) {
  const raw = await runGhJson<RawTarget>(
    {
      args: ["api", "graphql", "--hostname", subject.host, "--input", "-"],
      stdin: JSON.stringify({
        query: QUERY,
        variables: {
          owner: subject.owner,
          name: subject.repository,
          number: subject.number,
        },
      }),
    },
    { ...options, host: subject.host },
  )
  return normalizeInboxConversationTarget(raw, subject)
}
