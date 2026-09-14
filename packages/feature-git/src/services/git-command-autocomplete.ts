import type { GitCommandCompletionData } from "../model/git-command-autocomplete"
import { runGitCommand } from "./git-command"

const COMPLETION_OUTPUT_LIMIT = 256 * 1_024
const COMPLETION_TIMEOUT_MS = 5_000

function outputLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseRefs(value: string) {
  const branches: GitCommandCompletionData["branches"] = []
  const tags: string[] = []
  for (const line of outputLines(value)) {
    const [ref = "", name = "", head = ""] = line.split("\0")
    if (!ref || !name || ref.endsWith("/HEAD")) continue
    if (ref.startsWith("refs/tags/")) {
      tags.push(name)
      continue
    }
    branches.push({
      name,
      kind: ref.startsWith("refs/remotes/") ? "remote" : "local",
      current: head === "*",
    })
  }
  branches.sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1
    if (left.kind !== right.kind) return left.kind === "local" ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  tags.sort((left, right) => left.localeCompare(right))
  return { branches, tags }
}

export async function loadGitCommandCompletionData(
  root: string,
): Promise<Omit<GitCommandCompletionData, "paths">> {
  const commandOptions = {
    maxOutputBytes: COMPLETION_OUTPUT_LIMIT,
    timeoutMs: COMPLETION_TIMEOUT_MS,
    mutating: false,
  }
  const [refsResult, remotesResult] = await Promise.all([
    runGitCommand(
      root,
      [
        "for-each-ref",
        "--format=%(refname)%00%(refname:short)%00%(HEAD)",
        "refs/heads",
        "refs/remotes",
        "refs/tags",
      ],
      commandOptions,
    ),
    runGitCommand(root, ["remote"], commandOptions),
  ])
  const refs = refsResult.exitCode === 0 ? parseRefs(refsResult.stdout) : { branches: [], tags: [] }
  return {
    ...refs,
    remotes: remotesResult.exitCode === 0 ? outputLines(remotesResult.stdout).sort() : [],
  }
}
