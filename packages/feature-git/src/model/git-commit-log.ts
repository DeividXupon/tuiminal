import type { GitCommit } from "./types"

const BODY_LINE_LIMIT = 6

export function gitCommitBodyLines(commit: GitCommit) {
  const lines = commit.body.replace(/\r/g, "").split("\n")
  while (lines[0] === "") lines.shift()
  while (lines.at(-1) === "") lines.pop()
  if (lines.length <= BODY_LINE_LIMIT) return lines
  return [...lines.slice(0, BODY_LINE_LIMIT - 1), "…"]
}

export function gitCommitLogRowHeight(commit: GitCommit) {
  const bodyLines = gitCommitBodyLines(commit)
  return 6 + (commit.parents.length > 1 ? 1 : 0) + (bodyLines.length ? bodyLines.length + 1 : 0)
}

export function gitCommitLogWindow(
  commits: GitCommit[],
  selectedIndex: number,
  availableHeight: number,
) {
  if (!commits.length) return { start: 0, end: 0 }
  const selected = Math.max(0, Math.min(selectedIndex, commits.length - 1))
  const capacity = Math.max(1, availableHeight)

  for (let start = 0; start <= selected; start += 1) {
    let used = 0
    let end = start
    while (end < commits.length) {
      const commit = commits[end]
      if (!commit) break
      const height = gitCommitLogRowHeight(commit)
      if (end > start && used + height > capacity) break
      used += height
      end += 1
    }
    if (selected < end) return { start, end }
  }

  return { start: selected, end: selected + 1 }
}
