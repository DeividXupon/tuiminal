import { sanitizeGitHubText } from "./content"
import type { PullRequestIdentity } from "./types"

export type PullRequestDiffTarget =
  | { kind: "pr" }
  | { kind: "file"; path: string }
  | { kind: "commit"; sha: string }

export type PullRequestDiffSnapshot = {
  identity: PullRequestIdentity
  target: PullRequestDiffTarget
  baseSha: string
  headSha: string
  source: string
  byteLength: number
  truncated: boolean
}

export type PullRequestDiffFocus = "files" | "document"
export type PullRequestDiffMode = "unified" | "split" | "inline"
export type PullRequestDiffKeyboardAction =
  | { type: "close" }
  | { type: "toggle-focus" }
  | { type: "focus"; target: PullRequestDiffFocus }
  | { type: "move"; delta: -1 | 1 }
  | { type: "move-hunk"; delta: -1 | 1 }
  | { type: "cycle-mode" }
  | { type: "copy-path" }

export const MAX_PULL_REQUEST_DIFF_BYTES = 2 * 1024 * 1024

export function nextPullRequestDiffMode(mode: PullRequestDiffMode): PullRequestDiffMode {
  return mode === "unified" ? "split" : mode === "split" ? "inline" : "unified"
}

export function boundedPullRequestDiff(value: string, limit = MAX_PULL_REQUEST_DIFF_BYTES) {
  const sanitized = sanitizeGitHubText(value.replace(/\r\n?/g, "\n"))
  const bytes = new TextEncoder().encode(sanitized)
  if (bytes.length <= limit) {
    return { source: sanitized, byteLength: bytes.length, truncated: false }
  }
  const prefix = new TextDecoder().decode(bytes.slice(0, limit))
  return {
    source: sanitizeGitHubText(prefix),
    byteLength: bytes.length,
    truncated: true,
  }
}

export function pullRequestDiffHunkOffsets(source: string, mode: PullRequestDiffMode) {
  const offsets: number[] = []
  let offset = 0
  let insideHunk = false
  let removed = 0
  let added = 0
  const flushChanges = () => {
    offset += mode === "unified" ? removed + added : Math.max(removed, added)
    removed = 0
    added = 0
  }
  for (const line of source.split("\n")) {
    if (line.startsWith("@@")) {
      flushChanges()
      offsets.push(offset)
      insideHunk = true
    } else if (insideHunk && line.startsWith(" ")) {
      flushChanges()
      offset += 1
    } else if (insideHunk && line.startsWith("-") && !line.startsWith("--- ")) removed += 1
    else if (insideHunk && line.startsWith("+") && !line.startsWith("+++ ")) added += 1
  }
  flushChanges()
  return offsets
}

export function adjacentPullRequestHunkOffset(current: number, offsets: number[], delta: -1 | 1) {
  if (!offsets.length) return current
  if (delta === 1) return offsets.find((offset) => offset > current) ?? offsets.at(-1) ?? current
  return offsets.findLast((offset) => offset < current) ?? offsets[0] ?? current
}

export function pullRequestDiffKeyboardAction(key: string): PullRequestDiffKeyboardAction | null {
  if (key === "escape") return { type: "close" }
  if (key === "tab") return { type: "toggle-focus" }
  if (key === "h" || key === "left") return { type: "focus", target: "files" }
  if (key === "l" || key === "right") return { type: "focus", target: "document" }
  if (key === "j" || key === "down") return { type: "move", delta: 1 }
  if (key === "k" || key === "up") return { type: "move", delta: -1 }
  if (key === "[") return { type: "move-hunk", delta: -1 }
  if (key === "]") return { type: "move-hunk", delta: 1 }
  if (key === "v") return { type: "cycle-mode" }
  if (key === "y") return { type: "copy-path" }
  return null
}
