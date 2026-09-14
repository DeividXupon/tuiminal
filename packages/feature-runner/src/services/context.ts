import { lstatSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

export const RUNNER_WORKING_DIRECTORY = resolve(process.env.TUIMINAL_WORKDIR ?? process.cwd())

function regularFile(path: string) {
  try {
    return lstatSync(path).isFile()
  } catch {
    return false
  }
}

export function isGitWorktreeRoot(directory: string) {
  const root = resolve(directory)
  const marker = resolve(root, ".git")
  try {
    const markerStat = lstatSync(marker)
    if (markerStat.isDirectory()) return regularFile(resolve(marker, "HEAD"))
    if (!markerStat.isFile()) return false

    const match = /^gitdir:\s*(.+?)\s*$/i.exec(
      readFileSync(marker, "utf8").split(/\r?\n/, 1)[0] ?? "",
    )
    if (!match?.[1]) return false
    return regularFile(resolve(root, match[1], "HEAD"))
  } catch {
    return false
  }
}

export function resolveRunnerSessionScope(directory = RUNNER_WORKING_DIRECTORY) {
  const requestedRoot = resolve(directory)
  let candidate = requestedRoot
  while (true) {
    if (isGitWorktreeRoot(candidate)) return candidate
    const parent = dirname(candidate)
    if (parent === candidate) return requestedRoot
    candidate = parent
  }
}
