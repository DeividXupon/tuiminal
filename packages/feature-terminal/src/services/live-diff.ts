import { execFile } from "node:child_process"
import { lstat, readFile, readlink, realpath } from "node:fs/promises"
import { resolve } from "node:path"
import { type LiveDiffFile, parseLiveDiffNumstat, parseLiveDiffStatus } from "../model/live-diff"

const MAX_FILE_BYTES = 1024 * 1024
const MAX_FILE_ENTRIES = 1000
const MAX_ROOTS = 4

function runGit(directory: string, args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolveCommand, rejectCommand) => {
    execFile(
      "git",
      ["--no-optional-locks", "-c", "core.fsmonitor=false", "-C", directory, ...args],
      {
        encoding: "utf8",
        timeout: 4000,
        maxBuffer: 4 * 1024 * 1024,
        signal,
        windowsHide: true,
        env: {
          ...process.env,
          LC_ALL: "C",
          GIT_PAGER: "cat",
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
        },
      },
      (error, stdout) => (error ? rejectCommand(error) : resolveCommand(stdout)),
    )
  })
}

export async function liveDiffRepositoryRoot(directory: string, signal: AbortSignal) {
  if (!directory) return null
  try {
    const root = (await runGit(directory, ["rev-parse", "--show-toplevel"], signal)).trim()
    return root ? await realpath(root) : null
  } catch {
    return null
  }
}

export async function liveDiffWorktrees(root: string, signal: AbortSignal) {
  const output = await runGit(root, ["worktree", "list", "--porcelain"], signal)
  const paths = output
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice(9))
  const canonical = await Promise.all(paths.map((path) => realpath(path).catch(() => null)))
  return canonical.filter((path): path is string => Boolean(path)).slice(0, MAX_ROOTS)
}

export async function readLiveDiffRoot(root: string, signal: AbortSignal) {
  const status = parseLiveDiffStatus(
    await runGit(
      root,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"],
      signal,
    ),
  )
  const truncated = status.length > MAX_FILE_ENTRIES
  const headExists = await runGit(root, ["rev-parse", "--verify", "HEAD"], signal)
    .then(() => true)
    .catch(() => false)
  const numstat = headExists
    ? parseLiveDiffNumstat(
        await runGit(
          root,
          [
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
            "--numstat",
            "-z",
            "HEAD",
            "--",
          ],
          signal,
        ),
      )
    : new Map<string, { additions: number | null; deletions: number | null }>()
  const files: Omit<LiveDiffFile, "changedAt">[] = []
  const limited = status.slice(0, MAX_FILE_ENTRIES)
  for (let offset = 0; offset < limited.length; offset += 8) {
    signal.throwIfAborted()
    files.push(
      ...(await Promise.all(
        limited.slice(offset, offset + 8).map(async ({ path, status }) => {
          const untracked = status === "??"
          const absolute = resolve(root, path)
          const metadata = await lstat(absolute).catch(() => null)
          let stats = numstat.get(path) ?? { additions: null, deletions: null }
          if ((untracked || !headExists) && metadata?.isFile() && metadata.size <= MAX_FILE_BYTES) {
            const contents = await readFile(absolute, { signal })
            if (!contents.includes(0)) {
              const source = contents.toString("utf8")
              stats = {
                additions: source ? source.split("\n").length - Number(source.endsWith("\n")) : 0,
                deletions: 0,
              }
            }
          }
          return {
            root,
            path,
            additions: stats.additions,
            deletions: stats.deletions,
            fingerprint: `${status}\0${stats.additions}\0${stats.deletions}\0${metadata?.mtimeMs ?? "-"}\0${metadata?.size ?? "-"}`,
            untracked,
            newFile: untracked || !headExists || status.includes("A"),
            headExists,
          } satisfies Omit<LiveDiffFile, "changedAt">
        }),
      )),
    )
  }
  return { files, truncated }
}

export async function readLiveDiffPatch(file: LiveDiffFile, signal: AbortSignal) {
  if (file.additions === null && file.deletions === null) return ""
  if (!file.untracked && file.headExists) {
    const patch = await runGit(
      file.root,
      [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--no-renames",
        "--unified=3",
        "HEAD",
        "--",
        file.path,
      ],
      signal,
    )
    return Buffer.byteLength(patch) <= MAX_FILE_BYTES ? patch : ""
  }
  const absolute = resolve(file.root, file.path)
  const metadata = await lstat(absolute).catch(() => null)
  if (!metadata?.isFile() || metadata.size > MAX_FILE_BYTES) return ""
  const contents = await readFile(absolute, { signal })
  if (contents.includes(0)) return ""
  const source = contents.toString("utf8")
  const lines = source ? source.replace(/\n$/, "").split("\n") : []
  const header = `diff --git a/${file.path} b/${file.path}\nnew file mode 100644\n--- /dev/null\n+++ b/${file.path}`
  if (!lines.length) return `${header}\n`
  return `${header}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n`
}

export async function readProcessDirectories(pids: readonly number[], signal: AbortSignal) {
  const unique = [...new Set(pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))].slice(
    0,
    32,
  )
  if (process.platform === "linux") {
    const paths = await Promise.all(
      unique.map((pid) => readlink(`/proc/${pid}/cwd`).catch(() => null)),
    )
    return [...new Set(paths.filter((path): path is string => Boolean(path?.startsWith("/"))))]
  }
  if (process.platform !== "darwin" || !unique.length) return []
  return new Promise<string[]>((done) => {
    execFile(
      "lsof",
      ["-a", "-p", unique.join(","), "-d", "cwd", "-Fn"],
      { encoding: "utf8", timeout: 2500, maxBuffer: 256 * 1024, signal },
      (_error, stdout) => {
        done([
          ...new Set(
            stdout
              .split("\n")
              .filter((line) => line.startsWith("n/"))
              .map((line) => line.slice(1)),
          ),
        ])
      },
    )
  })
}
