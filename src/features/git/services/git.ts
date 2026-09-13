import type { GitFile, GitSnapshot } from "../model/types"

export type * from "../model/types"

import { basename, resolve } from "node:path"
import { type GitHubRepositoryReference, parseGitHubRemote } from "../model/repository"
import { loadGitCommitHistory } from "./git-commit-history"
import { type GitCommandResult, runGitCommand } from "./git-command"
import type { GitCommandObserver } from "./git-file-actions"

export {
  GIT_COMMAND_MAX_OUTPUT_BYTES,
  GIT_COMMAND_TIMEOUT_MS,
  GitCommandBudgetError,
  runGitCommand,
} from "./git-command"
export {
  discardGitFiles,
  type GitCommandObserver,
  stageGitFiles,
  unstageGitFiles,
} from "./git-file-actions"
export { loadGitCommitHistory } from "./git-commit-history"

export const GIT_LAUNCH_DIRECTORY = resolve(process.env.TUIMINAL_WORKDIR ?? process.cwd())
const GIT_PROJECT_CONTEXT_CACHE_LIMIT = 64
const projectContextCache = new Map<string, Promise<GitProjectContext>>()

export type GitProjectContext = {
  launchDirectory: string
  root: string
  isRepository: boolean
  remote: GitHubRepositoryReference | null
}

async function inspectGitProjectContext(directory: string): Promise<GitProjectContext> {
  const requested = resolve(directory)
  const rootResult = await runGitCommand(requested, ["rev-parse", "--show-toplevel"])
  if (rootResult.exitCode !== 0) {
    return { launchDirectory: requested, root: requested, isRepository: false, remote: null }
  }
  const root = resolve(rootResult.stdout.trim())
  const remote = await runGitCommand(root, ["remote", "get-url", "origin"])
  return {
    launchDirectory: requested,
    root,
    isRepository: true,
    remote: remote.exitCode === 0 ? parseGitHubRemote(remote.stdout) : null,
  }
}

export function resolveGitProjectContext(directory = GIT_LAUNCH_DIRECTORY) {
  const requested = resolve(directory)
  const cached = projectContextCache.get(requested)
  if (cached) {
    projectContextCache.delete(requested)
    projectContextCache.set(requested, cached)
    return cached
  }
  const pending = inspectGitProjectContext(requested)
  projectContextCache.set(requested, pending)
  while (projectContextCache.size > GIT_PROJECT_CONTEXT_CACHE_LIMIT) {
    const oldest = projectContextCache.keys().next().value
    if (typeof oldest !== "string") break
    projectContextCache.delete(oldest)
  }
  return pending
}

export async function resolveGitProjectScope(directory = GIT_LAUNCH_DIRECTORY) {
  return (await resolveGitProjectContext(directory)).root
}

function parseStatus(output: string): GitFile[] {
  return output
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const indexStatus = entry[0] ?? " "
      const worktreeStatus = entry[1] ?? " "
      const path = entry.slice(3)
      const untracked = indexStatus === "?" && worktreeStatus === "?"

      return {
        path,
        indexStatus,
        worktreeStatus,
        staged: !untracked && indexStatus !== " ",
        unstaged: untracked || worktreeStatus !== " ",
        untracked,
      }
    })
    .sort((left, right) => {
      const leftGroup = left.unstaged ? 0 : 1
      const rightGroup = right.unstaged ? 0 : 1
      return leftGroup - rightGroup || left.path.localeCompare(right.path)
    })
}

function emptyGitSnapshot(context: GitProjectContext): GitSnapshot {
  return {
    isRepository: false,
    launchDirectory: context.launchDirectory,
    root: null,
    repositoryName: basename(context.launchDirectory),
    branch: "—",
    upstream: null,
    ahead: 0,
    behind: 0,
    files: [],
    commits: [],
  }
}

function commandError(result: GitCommandResult, fallback: string) {
  const message = result.stderr.trim() || result.stdout.trim() || fallback
  return new Error(result.truncated ? `${message}\n[saída truncada pelo limite]` : message)
}

async function runObservedGitCommand(root: string, args: string[], observer?: GitCommandObserver) {
  observer?.(args)
  return runGitCommand(root, args, { mutating: true })
}

/** Remove Git's record terminator without erasing a meaningful patch marker. */
export function trimGitPatchTerminator(output: string) {
  if (output.endsWith("\r\n")) return output.slice(0, -2)
  if (output.endsWith("\n")) return output.slice(0, -1)
  return output
}

export async function loadGitFiles(root: string): Promise<GitFile[]> {
  const statusResult = await runGitCommand(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--no-renames",
  ])
  if (statusResult.exitCode !== 0) {
    throw commandError(statusResult, "Não foi possível ler o status do Git.")
  }
  return parseStatus(statusResult.stdout)
}

async function loadGitWorkingTreeFromContext(context: GitProjectContext): Promise<GitSnapshot> {
  if (!context.isRepository) return emptyGitSnapshot(context)
  const root = context.root
  const [branchResult, files, upstreamResult] = await Promise.all([
    runGitCommand(root, ["symbolic-ref", "--short", "-q", "HEAD"]),
    loadGitFiles(root),
    runGitCommand(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
  ])

  let branch = branchResult.stdout.trim()
  if (!branch) {
    const headResult = await runGitCommand(root, ["rev-parse", "--short", "HEAD"])
    branch = headResult.exitCode === 0 ? `HEAD@${headResult.stdout.trim()}` : "sem commits"
  }

  const upstream = upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() : null
  let ahead = 0
  let behind = 0

  if (upstream) {
    const distanceResult = await runGitCommand(root, [
      "rev-list",
      "--left-right",
      "--count",
      `HEAD...${upstream}`,
    ])
    if (distanceResult.exitCode === 0) {
      const [nextAhead, nextBehind] = distanceResult.stdout.trim().split(/\s+/)
      ahead = Number(nextAhead) || 0
      behind = Number(nextBehind) || 0
    }
  }

  return {
    isRepository: true,
    launchDirectory: context.launchDirectory,
    root,
    repositoryName: basename(root),
    branch,
    upstream,
    ahead,
    behind,
    files,
    commits: [],
  }
}

export async function loadGitWorkingTreeSnapshot(
  directory = GIT_LAUNCH_DIRECTORY,
): Promise<GitSnapshot> {
  return loadGitWorkingTreeFromContext(await resolveGitProjectContext(directory))
}

/** A cheap history cache key; worktree changes do not alter refs. */
export async function loadGitRefSignature(root: string): Promise<string> {
  const result = await runGitCommand(root, ["show-ref", "--head", "--dereference"])
  if (result.exitCode === 0) return result.stdout
  if (result.exitCode === 1) return ""
  throw commandError(result, "Não foi possível ler as referências do Git.")
}

export async function loadGitSnapshot(directory = GIT_LAUNCH_DIRECTORY): Promise<GitSnapshot> {
  const context = await resolveGitProjectContext(directory)
  if (!context.isRepository) return emptyGitSnapshot(context)
  const [workingTree, commits] = await Promise.all([
    loadGitWorkingTreeFromContext(context),
    loadGitCommitHistory(context.root),
  ])
  return { ...workingTree, commits }
}

export async function loadGitDiff(root: string, file: GitFile) {
  const sections: string[] = []

  if (file.staged) {
    const stagedResult = await runGitCommand(root, [
      "--literal-pathspecs",
      "diff",
      "--cached",
      "--no-ext-diff",
      "--no-color",
      "--unified=3",
      "--",
      file.path,
    ])
    if (stagedResult.stdout.trim()) {
      sections.push("── STAGED ──", trimGitPatchTerminator(stagedResult.stdout))
    }
  }

  if (file.untracked) {
    const untrackedResult = await runGitCommand(root, [
      "diff",
      "--no-index",
      "--no-color",
      "--unified=3",
      "--",
      "/dev/null",
      resolve(root, file.path),
    ])
    if (untrackedResult.stdout.trim()) {
      sections.push("── UNTRACKED ──", trimGitPatchTerminator(untrackedResult.stdout))
    }
  } else if (file.unstaged) {
    const unstagedResult = await runGitCommand(root, [
      "--literal-pathspecs",
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--unified=3",
      "--",
      file.path,
    ])
    if (unstagedResult.exitCode !== 0) {
      throw commandError(unstagedResult, "Não foi possível carregar o diff.")
    }
    if (unstagedResult.stdout.trim()) {
      sections.push("── WORKTREE ──", trimGitPatchTerminator(unstagedResult.stdout))
    }
  }

  return sections.join("\n") || "Sem alterações textuais para exibir."
}

export async function loadCommitDiff(root: string, commitHash: string) {
  const result = await runGitCommand(root, [
    "show",
    "--format=",
    "--no-ext-diff",
    "--no-color",
    "--unified=3",
    commitHash,
    "--",
  ])

  if (result.exitCode !== 0) {
    throw commandError(result, "Não foi possível carregar o commit.")
  }

  return trimGitPatchTerminator(result.stdout) || "Este commit não possui diff textual."
}

export async function toggleGitFile(root: string, file: GitFile, observer?: GitCommandObserver) {
  if (file.unstaged) {
    const addResult = await runObservedGitCommand(
      root,
      ["--literal-pathspecs", "add", "--", file.path],
      observer,
    )
    if (addResult.exitCode !== 0) {
      throw commandError(addResult, `Não foi possível adicionar ${file.path}.`)
    }
    return "Alterações adicionadas ao stage."
  }

  const restoreResult = await runObservedGitCommand(
    root,
    ["--literal-pathspecs", "restore", "--staged", "--", file.path],
    observer,
  )
  if (restoreResult.exitCode === 0) {
    return "Alterações removidas do stage."
  }

  const fallbackResult = await runObservedGitCommand(
    root,
    ["--literal-pathspecs", "rm", "--cached", "--", file.path],
    observer,
  )
  if (fallbackResult.exitCode !== 0) {
    throw commandError(restoreResult, `Não foi possível remover ${file.path} do stage.`)
  }

  return "Alterações removidas do stage."
}

export async function toggleAllGitFiles(
  root: string,
  files: GitFile[],
  observer?: GitCommandObserver,
) {
  if (files.some((file) => file.unstaged)) {
    const addResult = await runObservedGitCommand(root, ["add", "--all"], observer)
    if (addResult.exitCode !== 0) {
      throw commandError(addResult, "Não foi possível adicionar as alterações.")
    }
    return "Todas as alterações foram adicionadas ao stage."
  }

  const restoreResult = await runObservedGitCommand(
    root,
    ["restore", "--staged", "--", "."],
    observer,
  )
  if (restoreResult.exitCode !== 0) {
    throw commandError(restoreResult, "Não foi possível limpar o stage.")
  }
  return "Todos os arquivos foram removidos do stage."
}
