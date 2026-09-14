export type GitHubQueryKind = "pr" | "issue"

export type GitHubQuerySuggestion = {
  value: string
  description: string
}

const COMMON_SUGGESTIONS: readonly GitHubQuerySuggestion[] = [
  { value: "is:open", description: "somente abertos" },
  { value: "is:closed", description: "somente fechados" },
  { value: "author:@me", description: "criados por mim" },
  { value: "assignee:@me", description: "atribuídos a mim" },
  { value: "involves:@me", description: "com minha participação" },
  { value: "mentions:@me", description: "que me mencionam" },
  { value: "label:", description: "filtrar por label" },
  { value: "repo:", description: "filtrar por repositório" },
  { value: "updated:>=", description: "atualizados desde uma data" },
  { value: "sort:updated-desc", description: "mais recentes primeiro" },
]

const PR_SUGGESTIONS: readonly GitHubQuerySuggestion[] = [
  { value: "review-requested:@me", description: "aguardando minha revisão" },
  { value: "review:approved", description: "revisão aprovada" },
  { value: "review:changes_requested", description: "alterações solicitadas" },
  { value: "status:failure", description: "CI falhando" },
  { value: "status:pending", description: "CI pendente" },
  { value: "draft:true", description: "somente rascunhos" },
  { value: "draft:false", description: "sem rascunhos" },
  { value: "base:", description: "filtrar pela branch base" },
  { value: "head:", description: "filtrar pela branch de origem" },
]

const ISSUE_SUGGESTIONS: readonly GitHubQuerySuggestion[] = [
  { value: "no:assignee", description: "sem responsável" },
  { value: "no:label", description: "sem labels" },
  { value: "comments:>0", description: "com comentários" },
  { value: "reactions:>0", description: "com reações" },
]

function activeToken(query: string) {
  return query.match(/(?:^|\s)([^\s]*)$/)?.[1] ?? ""
}

function* queryCandidates(kind: GitHubQueryKind, repositories: readonly string[], token: string) {
  if (!token || "repo:".startsWith(token) || token.startsWith("repo:")) {
    for (const repository of repositories) {
      yield { value: `repo:${repository}`, description: "repositório deste perfil" }
    }
  }
  yield* kind === "pr" ? PR_SUGGESTIONS : ISSUE_SUGGESTIONS
  yield* COMMON_SUGGESTIONS
}

export function githubQuerySuggestions({
  query,
  kind,
  repositories = [],
  limit = 5,
}: {
  query: string
  kind: GitHubQueryKind
  repositories?: readonly string[]
  limit?: number
}) {
  const maximum = Math.max(0, Math.trunc(limit)) || 0
  if (!maximum) return []
  const token = activeToken(query).toLowerCase()
  const existing = new Set(query.toLowerCase().split(/\s+/).filter(Boolean))
  const result: GitHubQuerySuggestion[] = []
  for (const suggestion of queryCandidates(kind, repositories, token)) {
    const value = suggestion.value.toLowerCase()
    if (existing.has(value) || (token && !value.startsWith(token))) continue
    result.push(suggestion)
    if (result.length >= maximum) break
  }
  return result
}

export function applyGitHubQuerySuggestion(query: string, suggestion: string) {
  const match = query.match(/^(.*?)([^\s]*)$/s)
  const prefix = match?.[1] ?? ""
  return `${prefix}${suggestion}`
}
