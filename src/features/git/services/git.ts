import type { GitFile, GitCommit, GitSnapshot } from "../model/types"
export type * from "../model/types"
import { parseGitHubRemote, type GitHubRepositoryReference } from "../model/repository"
import { basename, resolve } from "node:path"
import { spawn } from "node:child_process"

type GitCommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export const GIT_LAUNCH_DIRECTORY = resolve(process.env.TUIMINAL_WORKDIR ?? process.cwd())
const projectContextCache = new Map<string, Promise<GitProjectContext>>()

export type GitProjectContext = {
  launchDirectory: string
  root: string
  isRepository: boolean
  remote: GitHubRepositoryReference | null
}

export async function runGitCommand(cwd: string, args: string[]): Promise<GitCommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn("git", ["-C", cwd, ...args], {
      env: { ...process.env, LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })
    child.once("error", rejectCommand)
    child.once("close", (exitCode) => {
      resolveCommand({ stdout, stderr, exitCode: exitCode ?? 1 })
    })
  })
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
  if (cached) return cached
  const pending = inspectGitProjectContext(requested)
  projectContextCache.set(requested, pending)
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

function parseCommits(output: string): GitCommit[] {
  return output
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [metadata = "", ...statLines] = entry.split("\n")
      const [
        fullHash = "",
        hash = "",
        date = "",
        author = "",
        decorations = "",
        parentList = "",
        ...subject
      ] = metadata.split("\x1f")
      let additions = 0
      let deletions = 0

      for (const line of statLines) {
        const [added, deleted] = line.split("\t")
        if (/^\d+$/.test(added ?? "")) additions += Number(added)
        if (/^\d+$/.test(deleted ?? "")) deletions += Number(deleted)
      }

      return {
        fullHash,
        hash,
        date,
        author,
        decorations,
        parents: parentList ? parentList.split(" ") : [],
        subject: subject.join("\x1f"),
        additions,
        deletions,
      }
    })
}

function commandError(result: GitCommandResult, fallback: string) {
  return new Error(result.stderr.trim() || result.stdout.trim() || fallback)
}

/** Remove Git's record terminator without erasing a meaningful patch marker. */
export function trimGitPatchTerminator(output: string) {
  if (output.endsWith("\r\n")) return output.slice(0, -2)
  if (output.endsWith("\n")) return output.slice(0, -1)
  return output
}

export async function loadGitSnapshot(directory = GIT_LAUNCH_DIRECTORY): Promise<GitSnapshot> {
  const context = await resolveGitProjectContext(directory)
  if (!context.isRepository) {
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
  const root = context.root
  const [branchResult, statusResult, upstreamResult, logResult] = await Promise.all([
    runGitCommand(root, ["symbolic-ref", "--short", "-q", "HEAD"]),
    runGitCommand(root, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--no-renames",
    ]),
    runGitCommand(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    runGitCommand(root, [
      "log",
      "--all",
      "--topo-order",
      "-32",
      "--date=short",
      "--decorate=short",
      "--numstat",
      "--pretty=format:%x1e%H%x1f%h%x1f%ad%x1f%an%x1f%D%x1f%P%x1f%s",
    ]),
  ])

  if (statusResult.exitCode !== 0) {
    throw commandError(statusResult, "Não foi possível ler o status do Git.")
  }

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
    files: parseStatus(statusResult.stdout),
    commits: logResult.exitCode === 0 ? parseCommits(logResult.stdout) : [],
  }
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

export async function toggleGitFile(root: string, file: GitFile) {
  if (file.unstaged) {
    const addResult = await runGitCommand(root, ["--literal-pathspecs", "add", "--", file.path])
    if (addResult.exitCode !== 0) {
      throw commandError(addResult, `Não foi possível adicionar ${file.path}.`)
    }
    return "Alterações adicionadas ao stage."
  }

  const restoreResult = await runGitCommand(root, [
    "--literal-pathspecs",
    "restore",
    "--staged",
    "--",
    file.path,
  ])
  if (restoreResult.exitCode === 0) {
    return "Alterações removidas do stage."
  }

  const fallbackResult = await runGitCommand(root, [
    "--literal-pathspecs",
    "rm",
    "--cached",
    "--",
    file.path,
  ])
  if (fallbackResult.exitCode !== 0) {
    throw commandError(restoreResult, `Não foi possível remover ${file.path} do stage.`)
  }

  return "Alterações removidas do stage."
}

export async function toggleAllGitFiles(root: string, files: GitFile[]) {
  if (files.some((file) => file.unstaged)) {
    const addResult = await runGitCommand(root, ["add", "--all"])
    if (addResult.exitCode !== 0) {
      throw commandError(addResult, "Não foi possível adicionar as alterações.")
    }
    return "Todas as alterações foram adicionadas ao stage."
  }

  const restoreResult = await runGitCommand(root, ["restore", "--staged", "--", "."])
  if (restoreResult.exitCode !== 0) {
    throw commandError(restoreResult, "Não foi possível limpar o stage.")
  }
  return "Todos os arquivos foram removidos do stage."
}
