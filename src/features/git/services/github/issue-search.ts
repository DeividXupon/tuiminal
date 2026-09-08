import { sanitizeGitHubText } from "../../model/pr/content"
import { validateIssueIdentity } from "../../model/issue/query"
import type { IssueActor, IssueLabel, IssueState, IssueSummary } from "../../model/issue/types"
import { type GhTransportOptions, runGhJson } from "./transport"

const ISSUE_SEARCH_QUERY = `
query TuiminalIssues($searchQuery: String!, $first: Int!, $after: String) {
  search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    issueCount
    nodes {
      ... on Issue {
        id number url title state createdAt updatedAt
        author { login }
        repository { name owner { login } }
        assignees(first: 10) { nodes { login } }
        labels(first: 10) { nodes { name color } }
        comments { totalCount }
        reactionGroups { users { totalCount } }
      }
    }
  }
}`

type RawIssueSearchPage = {
  data?: {
    search?: {
      issueCount?: number
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
      nodes?: unknown[]
    }
  }
  errors?: unknown[]
}

export type IssueSearchPage = {
  items: IssueSummary[]
  totalCount: number | null
  hasNextPage: boolean
  endCursor: string | null
  partial: boolean
}

function stringValue(value: unknown) {
  return typeof value === "string" ? sanitizeGitHubText(value) : ""
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function actorNodes(value: unknown): IssueActor[] {
  const nodes = value && typeof value === "object" ? (value as { nodes?: unknown }).nodes : null
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    const login =
      node && typeof node === "object" ? stringValue((node as { login?: unknown }).login) : ""
    return login ? [{ login }] : []
  })
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

function reactionCount(value: unknown) {
  if (!Array.isArray(value)) return 0
  return value.reduce((total, group) => {
    if (!group || typeof group !== "object") return total
    const users = (group as { users?: { totalCount?: unknown } }).users
    return total + numberValue(users?.totalCount)
  }, 0)
}

function issueState(value: string): IssueState {
  return value === "CLOSED" ? "closed" : "open"
}

function normalizeIssueNode(node: unknown, host: string): IssueSummary | null {
  if (!node || typeof node !== "object") return null
  const raw = node as Record<string, unknown>
  const repository = raw.repository as { name?: unknown; owner?: { login?: unknown } } | undefined
  const owner = stringValue(repository?.owner?.login)
  const repositoryName = stringValue(repository?.name)
  const nodeId = stringValue(raw.id)
  const number = numberValue(raw.number)
  const url = stringValue(raw.url)
  if (!owner || !repositoryName || !nodeId || !number || !url) return null
  const identity = { host, nodeId, owner, repository: repositoryName, number, url }
  if (!validateIssueIdentity(identity)) return null
  return {
    identity,
    title: stringValue(raw.title),
    state: issueState(stringValue(raw.state)),
    author: {
      login: stringValue((raw.author as { login?: unknown } | undefined)?.login) || "ghost",
    },
    assignees: actorNodes(raw.assignees),
    labels: labelNodes(raw.labels),
    commentCount: numberValue((raw.comments as { totalCount?: unknown } | undefined)?.totalCount),
    reactionCount: reactionCount(raw.reactionGroups),
    createdAt: stringValue(raw.createdAt),
    updatedAt: stringValue(raw.updatedAt),
  }
}

export function normalizeIssueSearchPage(raw: RawIssueSearchPage, host: string): IssueSearchPage {
  const search = raw.data?.search
  const nodes = Array.isArray(search?.nodes) ? search.nodes : []
  const items = nodes.flatMap((node) => {
    const item = normalizeIssueNode(node, host)
    return item ? [item] : []
  })
  return {
    items,
    totalCount: typeof search?.issueCount === "number" ? search.issueCount : null,
    hasNextPage: search?.pageInfo?.hasNextPage === true,
    endCursor: stringValue(search?.pageInfo?.endCursor) || null,
    partial: Boolean(raw.errors?.length) || items.length !== nodes.length,
  }
}

export async function searchIssuesPage({
  host,
  query,
  first = 20,
  after = null,
  options = {},
}: {
  host: string
  query: string
  first?: number
  after?: string | null
  options?: GhTransportOptions
}) {
  const raw = await runGhJson<RawIssueSearchPage>(
    {
      args: ["api", "graphql", "--hostname", host, "--input", "-"],
      stdin: JSON.stringify({
        query: ISSUE_SEARCH_QUERY,
        variables: { searchQuery: query, first, after },
      }),
    },
    { ...options, host },
  )
  return normalizeIssueSearchPage(raw, host)
}
