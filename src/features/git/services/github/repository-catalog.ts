import { sanitizeGitHubText } from "../../model/pr/content"
import { validateRepositoryName } from "../../model/pr/query"
import type { GhTransportOptions } from "./transport"
import { runGhJson } from "./transport"

const REPOSITORIES_QUERY = `
query TuiminalRepositoryCatalog($first: Int!, $after: String) {
  viewer {
    repositories(
      first: $first
      after: $after
      affiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR]
      orderBy: { field: NAME, direction: ASC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner }
    }
  }
}`

const PAGE_SIZE = 100
const MAX_PAGES = 100

type RepositoryPage = {
  data?: {
    viewer?: {
      repositories?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
        nodes?: unknown[]
      }
    }
  }
  errors?: unknown[]
}

type RepositoryConnection = NonNullable<
  NonNullable<NonNullable<RepositoryPage["data"]>["viewer"]>["repositories"]
>

function repositoryNames(nodes: unknown) {
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    const raw =
      node && typeof node === "object" ? (node as { nameWithOwner?: unknown }).nameWithOwner : ""
    const repository = sanitizeGitHubText(typeof raw === "string" ? raw : "")
    return validateRepositoryName(repository) ? [repository] : []
  })
}

export async function loadGitHubRepositoryCatalog({
  host,
  options = {},
}: {
  host: string
  options?: GhTransportOptions
}) {
  const repositories = new Set<string>()
  let after: string | null = null
  let partial = false
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const raw: RepositoryPage = await runGhJson<RepositoryPage>(
      {
        args: ["api", "graphql", "--hostname", host, "--input", "-"],
        stdin: JSON.stringify({
          query: REPOSITORIES_QUERY,
          variables: { first: PAGE_SIZE, after },
        }),
      },
      { ...options, host },
    )
    const connection: RepositoryConnection | undefined = raw.data?.viewer?.repositories
    for (const repository of repositoryNames(connection?.nodes)) repositories.add(repository)
    partial ||= Boolean(raw.errors?.length)
    if (connection?.pageInfo?.hasNextPage !== true) break
    const cursor: string | null | undefined = connection.pageInfo.endCursor
    if (!cursor || cursor === after) {
      partial = true
      break
    }
    after = cursor
    if (page === MAX_PAGES - 1) partial = true
  }
  return { repositories: [...repositories].sort(), partial }
}
