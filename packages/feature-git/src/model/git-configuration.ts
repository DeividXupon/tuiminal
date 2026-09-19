export type GitConfigurationTab = "diffs" | "pull-requests" | "issues" | "repositories" | "browser"
export type GitConfigurationMutation = "duplicate" | "delete" | "up" | "down"
export type GitConfigurationAction =
  | { type: "close" }
  | { type: "create" }
  | { type: "edit" }
  | { type: "configure-local"; target: "project" | "branch" }
  | { type: "toggle-repository" }
  | { type: "select-browser" }
  | { type: "select-tab"; tab: GitConfigurationTab }
  | { type: "move-selection"; delta: -1 | 1 }
  | { type: "mutate"; mutation: GitConfigurationMutation }

export const GIT_CONFIGURATION_TABS: readonly GitConfigurationTab[] = [
  "diffs",
  "pull-requests",
  "issues",
  "repositories",
  "browser",
]

export function gitConfigurationTabLabel(tab: GitConfigurationTab, compact = false) {
  if (tab === "diffs") return "[1] Diffs"
  if (compact) {
    if (tab === "pull-requests") return "[2] PR"
    if (tab === "issues") return "[3] Issues"
    if (tab === "repositories") return "[4] Repo"
    return "[5] Web"
  }
  if (tab === "pull-requests") return "[2] Seletores de PR"
  if (tab === "issues") return "[3] Seletores de Issues"
  if (tab === "repositories") return "[4] Repositórios"
  return "[5] Navegador"
}

function tabSelectionAction(keyName: string): GitConfigurationAction | null {
  const tab = GIT_CONFIGURATION_TABS[Number(keyName) - 1]
  return tab ? { type: "select-tab", tab } : null
}

function listMovementAction(key: {
  name: string
  option?: boolean
}): GitConfigurationAction | null {
  if (key.option && (key.name === "up" || key.name === "down")) {
    return { type: "mutate", mutation: key.name === "up" ? "up" : "down" }
  }
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
  key: { name: string; option?: boolean }
  tab: GitConfigurationTab
  hasSelection: boolean
  selectedIndex?: number
}): GitConfigurationAction | null {
  if (key.name === "escape") return { type: "close" }
  const tabSelection = tabSelectionAction(key.name)
  if (tabSelection) return tabSelection
  const movement = listMovementAction(key)
  if (movement) return movement
  if (tab === "diffs") {
    if (key.name === "p") return { type: "configure-local", target: "project" }
    if (key.name === "b") return { type: "configure-local", target: "branch" }
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
