export type GitWorkspaceTab = "base" | "pr" | "issues"

export const DEFAULT_GIT_WORKSPACE_TAB: GitWorkspaceTab = "base"

export function gitWorkspaceTabForKey(keyName: string): GitWorkspaceTab | null {
  if (keyName === "1") return "base"
  if (keyName === "2") return "pr"
  if (keyName === "3") return "issues"
  return null
}
