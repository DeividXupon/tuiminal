import { execFile } from "node:child_process"
import { accessSync, constants, existsSync, statSync } from "node:fs"
import { realpath } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import { parseGitHubRemote } from "../model/repository"

export { parseGitHubRemote } from "../model/repository"

export type CheckoutCloneInspection = {
  eligible: boolean
  reason: string | null
  root: string | null
  branch: string | null
  remote: string | null
}

export type CheckoutIdentity = {
  host: string
  owner: string
  repository: string
}

export type CheckoutGitProbeResult = {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
}

export type CheckoutInspectionOptions = {
  runGit?: (cwd: string, args: readonly string[]) => Promise<CheckoutGitProbeResult>
}

function runGit(cwd: string, args: readonly string[]): Promise<CheckoutGitProbeResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      {
        encoding: "utf8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
        timeout: 10_000,
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout,
          stderr,
          exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
          timedOut: Boolean(error?.killed && error.signal),
        })
      },
    )
  })
}

function gitDirectoryIsUsable(gitDirectory: string) {
  try {
    if (!statSync(gitDirectory).isDirectory()) return false
    accessSync(gitDirectory, constants.R_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}

function operationInProgress(gitDirectory: string) {
  return ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"].some(
    (entry) => existsSync(resolve(gitDirectory, entry)),
  )
}

async function inspectCheckoutProbes({
  root,
  identity,
  status,
  branch,
  remote,
  gitDirectory,
}: {
  root: string
  identity: CheckoutIdentity
  status: CheckoutGitProbeResult
  branch: CheckoutGitProbeResult
  remote: CheckoutGitProbeResult
  gitDirectory: CheckoutGitProbeResult
}): Promise<CheckoutCloneInspection> {
  const summary = {
    root,
    branch: branch.ok ? branch.stdout.trim() || "HEAD" : null,
    remote: remote.ok ? remote.stdout.trim() || null : null,
  }
  if (!status.ok) return { eligible: false, reason: "worktree-status-unavailable", ...summary }
  if (!branch.ok && !(branch.exitCode === 1 && !branch.stdout.trim())) {
    return { eligible: false, reason: "git-metadata-unavailable", ...summary }
  }
  const parsedRemote = remote.ok ? parseGitHubRemote(remote.stdout) : null
  const expectedRepository = `${identity.owner}/${identity.repository}`
  if (
    !remote.ok ||
    parsedRemote?.host !== identity.host.toLowerCase() ||
    parsedRemote.repository.toLowerCase() !== expectedRepository.toLowerCase()
  ) {
    return { eligible: false, reason: "remote-mismatch", ...summary }
  }
  if (!gitDirectory.ok || !gitDirectory.stdout.trim()) {
    return { eligible: false, reason: "git-metadata-unavailable", ...summary }
  }
  const gitDirectoryPath = isAbsolute(gitDirectory.stdout.trim())
    ? gitDirectory.stdout.trim()
    : resolve(root, gitDirectory.stdout.trim())
  let canonicalGitDirectory: string
  try {
    canonicalGitDirectory = await realpath(gitDirectoryPath)
  } catch {
    return { eligible: false, reason: "git-metadata-unavailable", ...summary }
  }
  if (!gitDirectoryIsUsable(canonicalGitDirectory)) {
    return { eligible: false, reason: "git-metadata-unavailable", ...summary }
  }
  if (operationInProgress(canonicalGitDirectory)) {
    return { eligible: false, reason: "git-operation-in-progress", ...summary }
  }
  if (status.stdout.trim()) return { eligible: false, reason: "worktree-dirty", ...summary }
  return { eligible: true, reason: null, ...summary }
}

export async function inspectCheckoutClone(
  clonePath: string,
  identity: CheckoutIdentity,
  options: CheckoutInspectionOptions = {},
): Promise<CheckoutCloneInspection> {
  try {
    if (!existsSync(clonePath) || !statSync(clonePath).isDirectory()) {
      return { eligible: false, reason: "clone-not-found", root: null, branch: null, remote: null }
    }
  } catch {
    return { eligible: false, reason: "clone-not-found", root: null, branch: null, remote: null }
  }
  let canonical: string
  try {
    canonical = await realpath(clonePath)
  } catch {
    return { eligible: false, reason: "clone-not-found", root: null, branch: null, remote: null }
  }
  const probe = options.runGit ?? runGit
  const rootResult = await probe(canonical, ["rev-parse", "--show-toplevel"])
  if (!rootResult.ok || !rootResult.stdout.trim()) {
    return {
      eligible: false,
      reason: "not-a-git-repository",
      root: null,
      branch: null,
      remote: null,
    }
  }
  let root: string
  try {
    root = await realpath(rootResult.stdout.trim())
    if (!statSync(root).isDirectory()) throw new Error("invalid Git root")
  } catch {
    return {
      eligible: false,
      reason: "not-a-git-repository",
      root: null,
      branch: null,
      remote: null,
    }
  }
  const [status, branch, remote, gitDirectory] = await Promise.all([
    probe(root, ["status", "--porcelain=v1", "--untracked-files=all"]),
    probe(root, ["symbolic-ref", "--short", "-q", "HEAD"]),
    probe(root, ["remote", "get-url", "origin"]),
    probe(root, ["rev-parse", "--git-dir"]),
  ])
  return inspectCheckoutProbes({
    root,
    identity,
    status,
    branch,
    remote,
    gitDirectory,
  })
}

const checkoutClonesInProgress = new Set<string>()

export type ValidatedCheckoutResult<T> =
  | {
      status: "executed"
      value: T
      before: CheckoutCloneInspection
      after: CheckoutCloneInspection
    }
  | { status: "rejected"; reason: string }

export async function withValidatedCheckoutClone<T>(
  clonePath: string,
  identity: CheckoutIdentity,
  execute: (canonicalRoot: string) => Promise<T>,
): Promise<ValidatedCheckoutResult<T>> {
  const initial = await inspectCheckoutClone(clonePath, identity)
  if (!initial.eligible || !initial.root) {
    return { status: "rejected", reason: initial.reason ?? "clone-not-found" }
  }
  if (checkoutClonesInProgress.has(initial.root)) {
    return { status: "rejected", reason: "checkout-clone-in-progress" }
  }
  checkoutClonesInProgress.add(initial.root)
  try {
    const before = await inspectCheckoutClone(initial.root, identity)
    if (!before.eligible || !before.root) {
      return { status: "rejected", reason: before.reason ?? "clone-not-found" }
    }
    const value = await execute(before.root)
    const after = await inspectCheckoutClone(before.root, identity)
    return { status: "executed", value, before, after }
  } finally {
    checkoutClonesInProgress.delete(initial.root)
  }
}
