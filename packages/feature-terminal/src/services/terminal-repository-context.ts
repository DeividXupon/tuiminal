import { execFile } from "node:child_process"
import { basename } from "node:path"
import type { TerminalRepositoryContext } from "../model/terminal-context"
import { terminalNewFileLines } from "./terminal-new-file-lines"
import { readTerminalRepositoryChanges } from "./terminal-repository-changes"

type GitResult = { exitCode: number; stdout: string; stderr: string }

function runGit(directory: string, args: readonly string[], signal: AbortSignal) {
  return new Promise<GitResult>((resolve, reject) => {
    execFile(
      "git",
      ["--no-optional-locks", "-c", "core.fsmonitor=false", "-C", directory, ...args],
      {
        encoding: "utf8",
        timeout: 4000,
        maxBuffer: 256 * 1024,
        windowsHide: true,
        signal,
        env: {
          ...process.env,
          LC_ALL: "C",
          GIT_PAGER: "cat",
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
        },
      },
      (error, stdout, stderr) => {
        if (signal.aborted) return reject(signal.reason)
        if (!error) return resolve({ exitCode: 0, stdout, stderr })
        const code = (error as Error & { code?: number | string }).code
        if (typeof code !== "number") return reject(error)
        resolve({ exitCode: code, stdout, stderr })
      },
    )
  })
}

function notRepository(result: GitResult) {
  return result.exitCode === 128 && /not a git repository/u.test(result.stderr)
}

async function readBranch(root: string, signal: AbortSignal) {
  const symbolic = await runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"], signal)
  const branch = symbolic.stdout.trim()
  if (branch) return branch
  const detached = await runGit(root, ["rev-parse", "--short", "HEAD"], signal)
  const hash = detached.stdout.trim()
  return hash ? `HEAD@${hash}` : "HEAD"
}

export async function readTerminalRepositoryContext(
  directory: string,
  signal: AbortSignal,
): Promise<TerminalRepositoryContext> {
  const rootResult = await runGit(directory, ["rev-parse", "--show-toplevel"], signal)
  if (notRepository(rootResult)) {
    return {
      directory,
      projectName: basename(directory) || directory,
      state: "no-git",
    }
  }
  if (rootResult.exitCode !== 0) throw new Error(rootResult.stderr.trim() || "Git indisponível.")
  const root = rootResult.stdout.trim()
  if (!root) throw new Error("O Git não informou a raiz do repositório.")
  const [branch, status] = await Promise.all([
    readBranch(root, signal),
    runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], signal),
  ])
  if (status.exitCode !== 0) throw new Error(status.stderr.trim() || "Git indisponível.")
  const changes = status.stdout
    ? await readTerminalRepositoryChanges(status.stdout, {
        headExists: async () =>
          (await runGit(root, ["rev-parse", "--verify", "HEAD"], signal)).exitCode === 0,
        numstat: async () => {
          const result = await runGit(
            root,
            ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z", "HEAD", "--"],
            signal,
          )
          if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "Git indisponível.")
          return result.stdout
        },
        newLines: (paths) => terminalNewFileLines(root, paths, signal),
      })
    : undefined
  return {
    directory,
    projectName: basename(root) || root,
    branch,
    state: status.stdout ? "dirty" : "clean",
    ...(changes ? { changes } : {}),
  }
}
