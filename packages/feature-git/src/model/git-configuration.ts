export type GitConfigurationTab = "diffs" | "pull-requests" | "issues" | "repositories" | "browser"
export type GitConfigurationMutation = "duplicate" | "delete" | "up" | "down"
export type GitConfigurationAction =
  | { type: "create" }
  | { type: "edit" }
  | { type: "configure-local"; target: "project" | "branch" }
  | { type: "toggle-repository" }
  | { type: "select-browser" }
  | { type: "back-to-navigation" }
  | { type: "move-selection"; delta: -1 | 1 }
  | { type: "mutate"; mutation: GitConfigurationMutation }

function listMovementAction(key: {
  name: string
  option?: boolean
  shift?: boolean
}): GitConfigurationAction | null {
  if (key.option || key.shift) return null
  if (key.name === "j" || key.name === "down") return { type: "move-selection", delta: 1 }
  if (key.name === "k" || key.name === "up") return { type: "move-selection", delta: -1 }
  return null
}

function selectorAction(keyName: string, hasSelection: boolean): GitConfigurationAction | null {
  if (keyName === "n") return { type: "create" }
  if (!hasSelection) return null
  if (["e", "return", "enter"].includes(keyName)) return { type: "edit" }
  if (keyName === "d" || keyName === "x") {
    return { type: "mutate", mutation: keyName === "d" ? "duplicate" : "delete" }
  }
  return null
}

export function gitConfigurationAction({
  key,
  tab,
  hasSelection,
  selectedIndex = 0,
}: {
  key: { name: string; option?: boolean; shift?: boolean }
  tab: GitConfigurationTab
  hasSelection: boolean
  selectedIndex?: number
}): GitConfigurationAction | null {
  if (key.name === "escape") return { type: "back-to-navigation" }
  const movement = listMovementAction(key)
  if (movement) return movement
  if (tab === "diffs") {
    if (["return", "enter"].includes(key.name)) {
      return { type: "configure-local", target: selectedIndex === 1 ? "branch" : "project" }
    }
    return null
  }
  if (tab === "repositories" && ["space", "return", "enter"].includes(key.name)) {
    return { type: "toggle-repository" }
  }
  if (tab === "repositories") return null
  if (tab === "browser" && ["space", "return", "enter"].includes(key.name)) {
    return { type: "select-browser" }
  }
  if (tab === "browser") return null
  return selectorAction(key.name, hasSelection)
}

export function repositorySelectionLabel(repositories: readonly string[], repositoryWord: string) {
  if (repositories.length === 1) return repositories[0] ?? ""
  return `${repositories.length} ${repositoryWord}`
}

function normalizedRepositories(repositories: readonly string[]) {
  return [...new Set(repositories)].sort((left, right) => left.localeCompare(right))
}

export function unifiedRepositorySelection({
  pullRequests,
  issues,
  pullRequestsExplicit,
  issuesExplicit,
}: {
  pullRequests: readonly string[]
  issues: readonly string[]
  pullRequestsExplicit: boolean
  issuesExplicit: boolean
}) {
  const pr = normalizedRepositories(pullRequests)
  const issue = normalizedRepositories(issues)
  const selected = pullRequestsExplicit ? pr : issuesExplicit ? issue : pr
  return {
    repositories: selected,
    mismatch:
      (pullRequestsExplicit || issuesExplicit) && JSON.stringify(pr) !== JSON.stringify(issue),
  }
}

export function toggleRepositorySelection(current: readonly string[], repository: string | null) {
  if (repository === null) return []
  if (!current.length) return [repository]
  const selected = new Set(current)
  if (selected.has(repository)) selected.delete(repository)
  else selected.add(repository)
  return normalizedRepositories(selected.size ? [...selected] : [])
}
