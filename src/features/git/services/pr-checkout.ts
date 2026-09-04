import { execFile } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { realpath } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import type { PullRequestIdentity } from "../model/pr/types"

export type CheckoutCloneInspection = {
  eligible: boolean
  reason: string | null
  root: string | null
  branch: string | null
  remote: string | null
}

function runGit(cwd: string, args: readonly string[]) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, timeout: 10_000 },
      (error, stdout, stderr) => {
        if (error && typeof error.code === "string") return reject(error)
        resolve({ stdout, stderr, exitCode: typeof error?.code === "number" ? error.code : 0 })
      },
    )
  })
}

export function parseGitHubRemote(remote: string) {
  const value = remote.trim().replace(/\.git$/, "")
  const ssh = value.match(/^git@([^:]+):([^/]+)\/(.+)$/)
  if (ssh) return { host: ssh[1]?.toLowerCase() ?? "", repository: `${ssh[2]}/${ssh[3]}` }
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "ssh:") return null
    const repository = url.pathname.replace(/^\//, "")
    return repository.includes("/") ? { host: url.hostname.toLowerCase(), repository } : null
  } catch {
    return null
  }
}

function operationInProgress(gitDirectory: string) {
  return ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"].some(
    (entry) => existsSync(`${gitDirectory}/${entry}`),
  )
}

export async function inspectCheckoutClone(
  clonePath: string,
  identity: PullRequestIdentity,
): Promise<CheckoutCloneInspection> {
  if (!existsSync(clonePath) || !statSync(clonePath).isDirectory()) {
    return { eligible: false, reason: "clone-not-found", root: null, branch: null, remote: null }
  }
  const canonical = await realpath(clonePath)
  const rootResult = await runGit(canonical, ["rev-parse", "--show-toplevel"])
  if (rootResult.exitCode !== 0) {
    return {
      eligible: false,
      reason: "not-a-git-repository",
      root: null,
      branch: null,
      remote: null,
    }
  }
  const root = (await realpath(rootResult.stdout.trim())).trim()
  const [status, branch, remote, gitDirectory] = await Promise.all([
    runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]),
    runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"]),
    runGit(root, ["remote", "get-url", "origin"]),
    runGit(root, ["rev-parse", "--git-dir"]),
  ])
  const parsedRemote = parseGitHubRemote(remote.stdout)
  const expectedRepository = `${identity.owner}/${identity.repository}`
  const summary = {
    root,
    branch: branch.stdout.trim() || "HEAD",
    remote: remote.stdout.trim() || null,
  }
  if (
    remote.exitCode !== 0 ||
    parsedRemote?.host !== identity.host.toLowerCase() ||
    parsedRemote.repository.toLowerCase() !== expectedRepository.toLowerCase()
  ) {
    return { eligible: false, reason: "remote-mismatch", ...summary }
  }
  const gitDirectoryPath = isAbsolute(gitDirectory.stdout.trim())
    ? gitDirectory.stdout.trim()
    : resolve(root, gitDirectory.stdout.trim())
  if (gitDirectory.exitCode === 0 && operationInProgress(gitDirectoryPath)) {
    return { eligible: false, reason: "git-operation-in-progress", ...summary }
  }
  if (status.stdout.trim()) return { eligible: false, reason: "worktree-dirty", ...summary }
  return { eligible: true, reason: null, ...summary }
}
