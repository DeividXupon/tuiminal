import type {
  IssueActor,
  IssueComment,
  IssueDetails,
  IssueIdentity,
  IssueLabel,
  IssuePermissions,
  IssueState,
} from "../../model/issue/types"
import { sanitizeGitHubText } from "../../model/pr/content"
import { type GhTransportOptions, runGhJson } from "./transport"

const ISSUE_DETAILS_QUERY = `
query TuiminalIssueDetails(
  $owner: String!
  $name: String!
  $number: Int!
  $commentCount: Int!
  $before: String
) {
  repository(owner: $owner, name: $name) {
    viewerPermission
    issue(number: $number) {
      id number url title body state createdAt updatedAt closedAt
      viewerCanClose viewerCanReopen viewerCanUpdate
      author { login }
      assignees(first: 100) { totalCount nodes { login } }
      labels(first: 100) { totalCount nodes { name color } }
      reactionGroups { users { totalCount } }
      comments(last: $commentCount, before: $before) {
        totalCount
        pageInfo { hasPreviousPage startCursor }
        nodes {
          id body createdAt updatedAt url
          author { login }
          reactionGroups { users { totalCount } }
        }
      }
    }
  }
}`

type RawIssueDetails = {
  data?: {
    repository?: {
      viewerPermission?: unknown
      issue?: Record<string, unknown> | null
    } | null
  }
  errors?: unknown[]
}

function stringValue(value: unknown) {
  return typeof value === "string" ? sanitizeGitHubText(value) : ""
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function actor(value: unknown): IssueActor {
  const login =
    value && typeof value === "object" ? stringValue((value as { login?: unknown }).login) : ""
  return { login: login || "ghost" }
}

function actorNodes(value: unknown) {
  const nodes = value && typeof value === "object" ? (value as { nodes?: unknown }).nodes : null
  return Array.isArray(nodes) ? nodes.map(actor) : []
}

function labelNodes(value: unknown): IssueLabel[] {
  const nodes = value && typeof value === "object" ? (value as { nodes?: unknown }).nodes : null
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    if (!node || typeof node !== "object") return []
    const raw = node as { name?: unknown; color?: unknown }
    const name = stringValue(raw.name)
    const color = stringValue(raw.color)
    return name ? [{ name, ...(color ? { color } : {}) }] : []
  })
}

function connectionIsComplete(value: unknown, loadedCount: number) {
  if (!value || typeof value !== "object") return false
  const totalCount = (value as { totalCount?: unknown }).totalCount
  return typeof totalCount !== "number" || loadedCount >= totalCount
}

function reactionCount(value: unknown) {
  if (!Array.isArray(value)) return 0
  return value.reduce((total, group) => {
    if (!group || typeof group !== "object") return total
    return total + numberValue((group as { users?: { totalCount?: unknown } }).users?.totalCount)
  }, 0)
}

function commentNodes(value: unknown): IssueComment[] {
  const nodes = value && typeof value === "object" ? (value as { nodes?: unknown }).nodes : null
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    if (!node || typeof node !== "object") return []
    const raw = node as Record<string, unknown>
    const id = stringValue(raw.id)
    if (!id) return []
    return [
      {
        id,
        author: actor(raw.author),
        body: stringValue(raw.body),
        createdAt: stringValue(raw.createdAt),
        updatedAt: stringValue(raw.updatedAt),
        url: stringValue(raw.url),
        reactionCount: reactionCount(raw.reactionGroups),
      },
    ]
  })
}

function issueState(value: unknown): IssueState {
  return value === "CLOSED" ? "closed" : "open"
}

function repositoryPermission(value: unknown): IssuePermissions["repositoryPermission"] {
  const normalized = stringValue(value).toLowerCase()
  return ["admin", "maintain", "write", "triage", "read", "none"].includes(normalized)
    ? (normalized as IssuePermissions["repositoryPermission"])
    : "unknown"
}

export function normalizeIssueDetails(
  raw: RawIssueDetails,
  identity: IssueIdentity,
): IssueDetails | null {
  const repository = raw.data?.repository
  const issue = repository?.issue
  if (!issue || stringValue(issue.id) !== identity.nodeId) return null
  const commentsConnection = issue.comments as
    | {
        totalCount?: unknown
        pageInfo?: { hasPreviousPage?: unknown; startCursor?: unknown }
        nodes?: unknown
      }
    | undefined
  const comments = commentNodes(commentsConnection)
  const assignees = actorNodes(issue.assignees)
  const labels = labelNodes(issue.labels)
  return {
    identity,
    title: stringValue(issue.title),
    body: stringValue(issue.body),
    state: issueState(issue.state),
    author: actor(issue.author),
    assignees,
    labels,
    comments,
    commentPage: {
      totalCount:
        typeof commentsConnection?.totalCount === "number" ? commentsConnection.totalCount : null,
      hasNextPage: commentsConnection?.pageInfo?.hasPreviousPage === true,
      endCursor: stringValue(commentsConnection?.pageInfo?.startCursor) || null,
      partial: Boolean(raw.errors?.length),
    },
    reactionCount: reactionCount(issue.reactionGroups),
    createdAt: stringValue(issue.createdAt),
    updatedAt: stringValue(issue.updatedAt),
    closedAt: stringValue(issue.closedAt),
    permissions: {
      canClose: issue.viewerCanClose === true,
      canReopen: issue.viewerCanReopen === true,
      canUpdate: issue.viewerCanUpdate === true,
      repositoryPermission: repositoryPermission(repository?.viewerPermission),
    },
    metadataComplete:
      !raw.errors?.length &&
      connectionIsComplete(issue.assignees, assignees.length) &&
      connectionIsComplete(issue.labels, labels.length),
    partial: Boolean(raw.errors?.length),
  }
}

export async function loadIssueDetails({
  identity,
  before = null,
  options = {},
}: {
  identity: IssueIdentity
  before?: string | null
  options?: GhTransportOptions
}) {
  const raw = await runGhJson<RawIssueDetails>(
    {
      args: ["api", "graphql", "--hostname", identity.host, "--input", "-"],
      stdin: JSON.stringify({
        query: ISSUE_DETAILS_QUERY,
        variables: {
          owner: identity.owner,
          name: identity.repository,
          number: identity.number,
          commentCount: 50,
          before,
        },
      }),
    },
    { ...options, host: identity.host },
  )
  return normalizeIssueDetails(raw, identity)
}
