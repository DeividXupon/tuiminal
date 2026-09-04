import type { PullRequestIdentity } from "./types"

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

function queryHasQualifier(query: string, qualifier: string) {
  const escaped = qualifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "i").test(query)
}

function queryHasExplicitRepositoryScope(query: string) {
  return /(?:^|\s)(?:repo|user|org):\S+/i.test(query)
}

function queryIsScopedToViewer(query: string) {
  return /(?:^|\s)(?:author|assignee|review-requested|reviewed-by|involves|mentions|commenter):@me(?=\s|$)/i.test(
    query,
  )
}

function validateAccountLogin(login: string) {
  if (!ACCOUNT_LOGIN_PATTERN.test(login)) throw new Error(`Invalid GitHub account: ${login}`)
  return login
}

export function normalizePullRequestQuery(value: string) {
  let normalized = ""
  let quote: '"' | "'" | null = null
  let pendingSpace = false
  for (const character of value.trim()) {
    if (!quote && (character === '"' || character === "'")) {
      if (pendingSpace && normalized) normalized += " "
      pendingSpace = false
      quote = character
      normalized += character
    } else if (quote && character === quote) {
      quote = null
      normalized += character
    } else if (!quote && /\s/.test(character)) {
      pendingSpace = true
    } else {
      if (pendingSpace && normalized) normalized += " "
      pendingSpace = false
      normalized += character
    }
  }
  return normalized
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
  const normalized = normalizePullRequestQuery(query)
  if (queryHasQualifier(normalized, "is:issue")) {
    throw new Error("Pull request queries cannot include is:issue")
  }
  if (repositories.length && /(?:^|\s)repo:\S+/i.test(normalized)) {
    throw new Error("Use the structured repository scope instead of repo: in the query")
  }
  const base = [
    queryHasQualifier(normalized, "is:pr") ? normalized : `is:pr ${normalized}`,
    queryHasQualifier(normalized, "archived:false") ? "" : "archived:false",
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
    queryHasExplicitRepositoryScope(normalized) ||
    queryIsScopedToViewer(normalized)
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
