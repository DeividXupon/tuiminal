import { COLORS } from "@xupon/tuiminal-core/settings/theme"

export type GitHubListState = "open" | "draft" | "merged" | "closed"

export function githubListStateColor(state: GitHubListState | null | undefined) {
  if (state === "open") return COLORS.success
  if (state === "merged") return COLORS.gitMerged
  if (state === "closed") return COLORS.danger
  return COLORS.muted
}
