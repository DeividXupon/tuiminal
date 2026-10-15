import { hasGitHubSearchQualifier, readGitHubSearchQuery } from "../search-query"
import type { IssueIdentity } from "./types"

export { normalizeGitHubSearchQuery as normalizeIssueQuery } from "../search-query"

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const ACCOUNT_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const identityKeyCache = new WeakMap<IssueIdentity, IssueIdentity & { key: string }>()

export type EffectiveIssueQuery = {
  repository: string | null
  query: string
}

export type IssueAccountScope = {
  viewerLogin: string
  organizations: readonly string[]
  repositories?: readonly string[]
}

function validateAccountLogin(login: string) {
  if (!ACCOUNT_LOGIN_PATTERN.test(login)) throw new Error(`Invalid GitHub account: ${login}`)
  return login
}

export function validateIssueRepositoryName(repository: string) {
  return REPOSITORY_PATTERN.test(repository)
}

export function validateIssueIdentity(identity: IssueIdentity) {
  if (!identity.host.trim() || !identity.nodeId.trim()) return false
  if (!validateIssueRepositoryName(`${identity.owner}/${identity.repository}`)) return false
  if (!Number.isInteger(identity.number) || identity.number <= 0) return false
  try {
    const url = new URL(identity.url)
    return url.protocol === "https:" && url.hostname.toLowerCase() === identity.host.toLowerCase()
  } catch {
    return false
  }
}

export function issueIdentityKey(identity: IssueIdentity) {
  const cached = identityKeyCache.get(identity)
  if (
    cached?.host === identity.host &&
    cached.nodeId === identity.nodeId &&
    cached.owner === identity.owner &&
    cached.repository === identity.repository &&
    cached.number === identity.number &&
    cached.url === identity.url
  ) {
    return cached.key
  }
  if (!validateIssueIdentity(identity)) throw new Error("Invalid issue identity")
  const key = `${identity.host.toLowerCase()}:${identity.nodeId}`
  identityKeyCache.set(identity, { ...identity, key })
  return key
}

export function buildEffectiveIssueQueries({
  query,
  repositories,
  accountScope,
}: {
  query: string
  repositories: readonly string[]
  accountScope?: IssueAccountScope
}): EffectiveIssueQuery[] {
  const { normalized, qualifiers } = readGitHubSearchQuery(query)
  if (hasGitHubSearchQualifier(qualifiers, "is", "pr")) {
    throw new Error("Issue queries cannot include is:pr")
  }
  if (repositories.length && hasGitHubSearchQualifier(qualifiers, "repo")) {
    throw new Error("Use the structured repository scope instead of repo: in the query")
  }
  const base = [
    hasGitHubSearchQualifier(qualifiers, "is", "issue") ? normalized : `is:issue ${normalized}`,
    hasGitHubSearchQualifier(qualifiers, "archived", "false") ? "" : "archived:false",
  ]
    .filter(Boolean)
    .join(" ")

  if (repositories.length) {
    return repositories.map((repository) => {
      if (!validateIssueRepositoryName(repository)) {
        throw new Error(`Invalid repository: ${repository}`)
      }
      return { repository, query: `${base} repo:${repository}` }
    })
  }
  if (
    !accountScope ||
    ["repo", "user", "org"].some((name) => hasGitHubSearchQualifier(qualifiers, name)) ||
    ["author", "assignee", "involves", "mentions", "commenter"].some((name) =>
      hasGitHubSearchQualifier(qualifiers, name, "@me"),
    )
  ) {
    return [{ repository: null, query: base }]
  }
  const owners = [
    { qualifier: "user", login: accountScope.viewerLogin },
    ...accountScope.organizations.map((login) => ({ qualifier: "org", login })),
  ]
  return [
    ...owners.map(({ qualifier, login }) => ({
      repository: null,
      query: `${base} ${qualifier}:${validateAccountLogin(login)}`,
    })),
    ...(accountScope.repositories ?? []).map((repository) => {
      if (!validateIssueRepositoryName(repository)) {
        throw new Error(`Invalid repository: ${repository}`)
      }
      return { repository, query: `${base} repo:${repository}` }
    }),
  ]
}
