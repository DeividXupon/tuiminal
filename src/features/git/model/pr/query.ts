import { hasGitHubSearchQualifier, readGitHubSearchQuery } from "../search-query"
import type { PullRequestIdentity } from "./types"

export { normalizeGitHubSearchQuery as normalizePullRequestQuery } from "../search-query"

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const ACCOUNT_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

export type EffectivePullRequestQuery = {
  repository: string | null
  query: string
}

export type PullRequestAccountScope = {
  viewerLogin: string
  organizations: readonly string[]
  repositories?: readonly string[]
}

function validateAccountLogin(login: string) {
  if (!ACCOUNT_LOGIN_PATTERN.test(login)) throw new Error(`Invalid GitHub account: ${login}`)
  return login
}

export function validateRepositoryName(repository: string) {
  return REPOSITORY_PATTERN.test(repository)
}

export function validatePullRequestIdentity(identity: PullRequestIdentity) {
  if (!identity.host.trim()) return false
  if (!identity.nodeId.trim()) return false
  if (!validateRepositoryName(`${identity.owner}/${identity.repository}`)) return false
  if (!Number.isInteger(identity.number) || identity.number <= 0) return false
  try {
    const url = new URL(identity.url)
    return url.protocol === "https:" && url.hostname.toLowerCase() === identity.host.toLowerCase()
  } catch {
    return false
  }
}

export function pullRequestIdentityKey(identity: PullRequestIdentity) {
  if (!validatePullRequestIdentity(identity)) throw new Error("Invalid pull request identity")
  return `${identity.host.toLowerCase()}:${identity.nodeId}`
}

export function samePullRequestIdentity(left: PullRequestIdentity, right: PullRequestIdentity) {
  return pullRequestIdentityKey(left) === pullRequestIdentityKey(right)
}

export function buildEffectivePullRequestQueries({
  query,
  repositories,
  accountScope,
}: {
  query: string
  repositories: readonly string[]
  accountScope?: PullRequestAccountScope
}): EffectivePullRequestQuery[] {
  const { normalized, qualifiers } = readGitHubSearchQuery(query)
  if (hasGitHubSearchQualifier(qualifiers, "is", "issue")) {
    throw new Error("Pull request queries cannot include is:issue")
  }
  if (repositories.length && hasGitHubSearchQualifier(qualifiers, "repo")) {
    throw new Error("Use the structured repository scope instead of repo: in the query")
  }
  const base = [
    hasGitHubSearchQualifier(qualifiers, "is", "pr") ? normalized : `is:pr ${normalized}`,
    hasGitHubSearchQualifier(qualifiers, "archived", "false") ? "" : "archived:false",
  ]
    .filter(Boolean)
    .join(" ")

  if (repositories.length) {
    return repositories.map((repository) => {
      if (!validateRepositoryName(repository)) throw new Error(`Invalid repository: ${repository}`)
      return { repository, query: `${base} repo:${repository}` }
    })
  }
  if (
    !accountScope ||
    ["repo", "user", "org"].some((name) => hasGitHubSearchQualifier(qualifiers, name)) ||
    [
      "author",
      "assignee",
      "review-requested",
      "reviewed-by",
      "involves",
      "mentions",
      "commenter",
    ].some((name) => hasGitHubSearchQualifier(qualifiers, name, "@me"))
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
      if (!validateRepositoryName(repository)) throw new Error(`Invalid repository: ${repository}`)
      return { repository, query: `${base} repo:${repository}` }
    }),
  ]
}
