import { sanitizeGitHubText } from "../../model/pr/content"
import { validateRepositoryName } from "../../model/pr/query"
import type { GhTransportOptions } from "./transport"
import { runGhJson } from "./transport"

const ORGANIZATIONS_QUERY = `
query TuiminalPullRequestOrganizations($first: Int!, $after: String) {
  viewer {
    organizations(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { login }
    }
  }
}`

const COLLABORATOR_REPOSITORIES_QUERY = `
query TuiminalPullRequestCollaborators($first: Int!, $after: String) {
  viewer {
    repositories(first: $first, after: $after, affiliations: [COLLABORATOR]) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner }
    }
  }
}`

const MAX_ORGANIZATION_PAGES = 100
const ORGANIZATIONS_PER_PAGE = 100
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

type RawOrganizationsPage = {
  data?: {
    viewer?: {
      organizations?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
        nodes?: unknown[]
      }
    }
  }
  errors?: unknown[]
}

type RawOrganizationsConnection = NonNullable<
  NonNullable<NonNullable<RawOrganizationsPage["data"]>["viewer"]>["organizations"]
>

type RawRepositoriesPage = {
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

export type GitHubAccountScope = {
  viewerLogin: string
  organizations: string[]
  repositories: string[]
  partial: boolean
}

function organizationLogins(nodes: unknown) {
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    const value = node && typeof node === "object" ? (node as { login?: unknown }).login : ""
    const login = sanitizeGitHubText(typeof value === "string" ? value : "")
    return LOGIN_PATTERN.test(login) ? [login] : []
  })
}

function repositoryNames(nodes: unknown) {
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    const value =
      node && typeof node === "object" ? (node as { nameWithOwner?: unknown }).nameWithOwner : ""
    const repository = sanitizeGitHubText(typeof value === "string" ? value : "")
    return validateRepositoryName(repository) ? [repository] : []
  })
}

async function loadCollaboratorRepositories(host: string, options: GhTransportOptions) {
  const repositories = new Set<string>()
  let after: string | null = null
  let partial = false
  for (let page = 0; page < MAX_ORGANIZATION_PAGES; page += 1) {
    const raw: RawRepositoriesPage = await runGhJson<RawRepositoriesPage>(
      {
        args: ["api", "graphql", "--hostname", host, "--input", "-"],
        stdin: JSON.stringify({
          query: COLLABORATOR_REPOSITORIES_QUERY,
          variables: { first: ORGANIZATIONS_PER_PAGE, after },
        }),
      },
      { ...options, host },
    )
    const connection = raw.data?.viewer?.repositories
    for (const repository of repositoryNames(connection?.nodes)) repositories.add(repository)
    partial ||= Boolean(raw.errors?.length)
    if (connection?.pageInfo?.hasNextPage !== true) break
    const nextCursor: string | null | undefined = connection.pageInfo.endCursor
    if (!nextCursor || nextCursor === after) {
      partial = true
      break
    }
    after = nextCursor
    if (page === MAX_ORGANIZATION_PAGES - 1) partial = true
  }
  return { repositories: [...repositories], partial }
}

export async function loadGitHubAccountScope({
  host,
  viewerLogin,
  options = {},
}: {
  host: string
  viewerLogin: string
  options?: GhTransportOptions
}): Promise<GitHubAccountScope> {
  const organizations = new Set<string>()
  let after: string | null = null
  let partial = false
  for (let page = 0; page < MAX_ORGANIZATION_PAGES; page += 1) {
    const raw: RawOrganizationsPage = await runGhJson<RawOrganizationsPage>(
      {
        args: ["api", "graphql", "--hostname", host, "--input", "-"],
        stdin: JSON.stringify({
          query: ORGANIZATIONS_QUERY,
          variables: { first: ORGANIZATIONS_PER_PAGE, after },
        }),
      },
      { ...options, host },
    )
    const connection: RawOrganizationsConnection | undefined = raw.data?.viewer?.organizations
    for (const login of organizationLogins(connection?.nodes)) organizations.add(login)
    partial ||= Boolean(raw.errors?.length)
    if (connection?.pageInfo?.hasNextPage !== true) break
    const nextCursor: string | null | undefined = connection.pageInfo.endCursor
    if (!nextCursor || nextCursor === after) {
      partial = true
      break
    }
    after = nextCursor
    if (page === MAX_ORGANIZATION_PAGES - 1) partial = true
  }
  const collaborator = await loadCollaboratorRepositories(host, options)
  const accountOwners = new Set([
    viewerLogin.toLowerCase(),
    ...[...organizations].map((v) => v.toLowerCase()),
  ])
  const repositories = collaborator.repositories.filter(
    (repository) => !accountOwners.has(repository.slice(0, repository.indexOf("/")).toLowerCase()),
  )
  return {
    viewerLogin,
    organizations: [...organizations],
    repositories,
    partial: partial || collaborator.partial,
  }
}
