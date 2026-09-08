import { useMemo } from "react"
import type { GitFile } from "../services/git"

export function useGitDiffTarget(file: GitFile | null) {
  const path = file?.path
  const indexStatus = file?.indexStatus
  const worktreeStatus = file?.worktreeStatus
  const staged = file?.staged
  const unstaged = file?.unstaged
  const untracked = file?.untracked
  return useMemo<GitFile | null>(() => {
    if (!path) return null
    return {
      path,
      indexStatus: indexStatus ?? " ",
      worktreeStatus: worktreeStatus ?? " ",
      staged: staged ?? false,
      unstaged: unstaged ?? false,
      untracked: untracked ?? false,
    }
  }, [indexStatus, path, staged, unstaged, untracked, worktreeStatus])
}
