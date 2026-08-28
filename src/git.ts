import { basename, resolve } from "node:path"
import { spawn } from "node:child_process"

export type GitFile = {
  path: string
  indexStatus: string
  worktreeStatus: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
}

export type GitCommit = {
  hash: string
  age: string
  subject: string
}

export type GitSnapshot = {
  isRepository: boolean
  launchDirectory: string
  root: string | null
  repositoryName: string
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  files: GitFile[]
  commits: GitCommit[]
}

type GitCommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export const GIT_LAUNCH_DIRECTORY = resolve(
  process.env.TUIMINAL_WORKDIR ?? process.cwd(),
)

async function runGit(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
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
}

function parseCommits(output: string): GitCommit[] {
  return output
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = "", age = "", ...subject] = entry.split("\x1f")
      return { hash, age, subject: subject.join("\x1f") }
    })
}

function commandError(result: GitCommandResult, fallback: string) {
  return new Error(result.stderr.trim() || result.stdout.trim() || fallback)
}

export async function loadGitSnapshot(): Promise<GitSnapshot> {
  const rootResult = await runGit(GIT_LAUNCH_DIRECTORY, [
    "rev-parse",
    "--show-toplevel",
  ])

  if (rootResult.exitCode !== 0) {
    return {
      isRepository: false,
      launchDirectory: GIT_LAUNCH_DIRECTORY,
      root: null,
      repositoryName: basename(GIT_LAUNCH_DIRECTORY),
      branch: "—",
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      commits: [],
    }
  }

  const root = rootResult.stdout.trim()
  const [branchResult, statusResult, upstreamResult, logResult] =
    await Promise.all([
      runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"]),
      runGit(root, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--no-renames",
      ]),
      runGit(root, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
      ]),
      runGit(root, [
        "log",
        "-12",
        "--pretty=format:%h%x1f%ar%x1f%s%x1e",
      ]),
    ])

  if (statusResult.exitCode !== 0) {
    throw commandError(statusResult, "Não foi possível ler o status do Git.")
  }

  let branch = branchResult.stdout.trim()
  if (!branch) {
    const headResult = await runGit(root, ["rev-parse", "--short", "HEAD"])
    branch = headResult.exitCode === 0
      ? `HEAD@${headResult.stdout.trim()}`
      : "sem commits"
  }

  const upstream =
    upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() : null
  let ahead = 0
  let behind = 0

  if (upstream) {
    const distanceResult = await runGit(root, [
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
    launchDirectory: GIT_LAUNCH_DIRECTORY,
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
    const stagedResult = await runGit(root, [
      "diff",
      "--cached",
      "--no-ext-diff",
      "--no-color",
      "--unified=3",
      "--",
      file.path,
    ])
    if (stagedResult.stdout.trim()) {
      sections.push("── STAGED ──", stagedResult.stdout.trimEnd())
    }
  }

  if (file.untracked) {
    const untrackedResult = await runGit(root, [
      "diff",
      "--no-index",
      "--no-color",
      "--unified=3",
      "--",
      "/dev/null",
      resolve(root, file.path),
    ])
    if (untrackedResult.stdout.trim()) {
      sections.push("── UNTRACKED ──", untrackedResult.stdout.trimEnd())
    }
  } else if (file.unstaged) {
    const unstagedResult = await runGit(root, [
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
      sections.push("── WORKTREE ──", unstagedResult.stdout.trimEnd())
    }
  }

  return sections.join("\n") || "Sem alterações textuais para exibir."
}

export async function toggleGitFile(root: string, file: GitFile) {
  if (file.unstaged) {
    const addResult = await runGit(root, ["add", "--", file.path])
    if (addResult.exitCode !== 0) {
      throw commandError(addResult, `Não foi possível adicionar ${file.path}.`)
    }
    return "Alterações adicionadas ao stage."
  }

  const restoreResult = await runGit(root, [
    "restore",
    "--staged",
    "--",
    file.path,
  ])
  if (restoreResult.exitCode === 0) {
    return "Alterações removidas do stage."
  }

  const fallbackResult = await runGit(root, ["rm", "--cached", "--", file.path])
  if (fallbackResult.exitCode !== 0) {
    throw commandError(
      restoreResult,
      `Não foi possível remover ${file.path} do stage.`,
    )
  }

  return "Alterações removidas do stage."
}
