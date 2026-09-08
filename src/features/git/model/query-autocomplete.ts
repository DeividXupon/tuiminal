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

function repositorySuggestions(repositories: readonly string[]) {
  return repositories.map((repository) => ({
    value: `repo:${repository}`,
    description: "repositório deste perfil",
  }))
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
  const token = activeToken(query).toLowerCase()
  const existing = new Set(query.toLowerCase().split(/\s+/).filter(Boolean))
  const candidates = [
    ...repositorySuggestions(repositories),
    ...(kind === "pr" ? PR_SUGGESTIONS : ISSUE_SUGGESTIONS),
    ...COMMON_SUGGESTIONS,
  ]
  return candidates
    .filter((suggestion) => !existing.has(suggestion.value.toLowerCase()))
    .filter((suggestion) => !token || suggestion.value.toLowerCase().startsWith(token))
    .slice(0, Math.max(0, limit))
}

export function applyGitHubQuerySuggestion(query: string, suggestion: string) {
  const match = query.match(/^(.*?)([^\s]*)$/s)
  const prefix = match?.[1] ?? ""
  return `${prefix}${suggestion}`
}
