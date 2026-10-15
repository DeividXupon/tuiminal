import { opendir, realpath, stat } from "node:fs/promises"
import { delimiter, dirname, join, resolve } from "node:path"
import type { AgentProjectTarget } from "../model/agent-project"
import { projectHomeDirectory } from "./agent-project-directories"
import { readRemoteProjectDirectory } from "./agent-project-ssh"

const IGNORED = new Set([
  "Library",
  "Applications",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  "coverage",
  "venv",
])
const MAX_DIRECTORIES = 600
const MAX_PROJECTS = 200
const MAX_DEPTH = 5
export type DiscoveredAgentProjects = { paths: string[]; truncated: boolean }

// One bounded SSH query, no Git subprocesses and no traversal into repositories or symlinks.
export const REMOTE_GIT_PROJECT_SCRIPT = String.raw`
export LC_ALL=C
root=$1
case "$root" in '~'|'~/') root=$HOME ;; esac
cd "$root" 2>/dev/null || exit 72
root=$(pwd -P)
printf 'TUIMINAL_PROJECTS\000%s\000' "$root"
visited=0
found=0
truncated=0
walk() {
  if [ "$visited" -ge 600 ] || [ "$found" -ge 200 ]; then truncated=1; return; fi
  visited=$((visited + 1))
  [ -r "$1" ] && [ -x "$1" ] || return
  if [ -d "$1/.git" ] || [ -f "$1/.git" ]; then
    printf '%s\000' "$1"
    found=$((found + 1))
    return
  fi
  [ "$2" -lt 5 ] || { truncated=1; return; }
  for child in "$1"/*; do
    [ -d "$child" ] && [ ! -L "$child" ] || continue
    case "${"$"}{child##*/}" in Library|Applications|node_modules|vendor|dist|build|target|coverage|venv) continue ;; esac
    walk "$child" "$(( $2 + 1 ))"
    [ "$visited" -lt 600 ] && [ "$found" -lt 200 ] || { truncated=1; break; }
  done
}
walk "$root" 0
if [ "$truncated" -eq 1 ]; then printf 'TRUNCATED\000'; else printf 'END\000'; fi
`

async function directoryChildren(path: string, signal: AbortSignal) {
  const children: string[] = []
  let git = false
  let truncated = false
  const directory = await opendir(path).catch(() => null)
  if (!directory) return { children, git, truncated }
  let count = 0
  for await (const entry of directory) {
    signal.throwIfAborted()
    if (++count > 2_000) {
      truncated = true
      break
    }
    if (entry.name === ".git") git = entry.isDirectory() || entry.isFile()
    if (!entry.isDirectory() || entry.name.startsWith(".") || IGNORED.has(entry.name)) continue
    children.push(join(path, entry.name))
  }
  // .git may occur beyond the enumeration limit.
  if (!git)
    git = await stat(join(path, ".git")).then(
      (item) => item.isFile() || item.isDirectory(),
      () => false,
    )
  return { children, git, truncated }
}

export async function discoverAgentGitProjects(
  target: AgentProjectTarget,
  seeds: readonly string[],
  signal: AbortSignal,
  options: { roots?: string[]; remoteCommand?: string[] } = {},
): Promise<DiscoveredAgentProjects> {
  signal.throwIfAborted()
  if (target.kind === "remote") {
    const result = await readRemoteProjectDirectory(target.profile, "~", "~", signal, true, {
      script: REMOTE_GIT_PROJECT_SCRIPT,
      ...(options.remoteCommand ? { command: options.remoteCommand } : {}),
    })
    return { paths: result.directories, truncated: result.truncated }
  }
  return discoverLocalGitProjects(seeds, signal, options.roots)
}

async function discoverLocalGitProjects(
  seeds: readonly string[],
  signal: AbortSignal,
  explicitRoots?: string[],
) {
  const configured = process.env.TUIMINAL_PROJECT_ROOTS?.split(delimiter).filter(Boolean)
  const roots =
    explicitRoots ??
    (configured?.length
      ? configured
      : [...seeds, ...seeds.map((path) => dirname(path)), projectHomeDirectory()])
  const queue = [...new Set(roots.map((path) => resolve(path)))].map((path) => ({ path, depth: 0 }))
  const visited = new Set<string>()
  const paths: string[] = []
  const deadline = Date.now() + 10_000
  let cursor = 0
  let truncated = false
  while (
    cursor < queue.length &&
    visited.size < MAX_DIRECTORIES &&
    paths.length < MAX_PROJECTS &&
    Date.now() < deadline
  ) {
    signal.throwIfAborted()
    const item = queue[cursor++]
    if (!item) break
    const canonical = await realpath(item.path).catch(() => null)
    if (!canonical || visited.has(canonical)) continue
    visited.add(canonical)
    const result = await directoryChildren(canonical, signal)
    truncated ||= result.truncated
    if (result.git) {
      paths.push(canonical)
      continue
    }
    if (item.depth >= MAX_DEPTH) {
      truncated ||= result.children.length > 0
      continue
    }
    for (const path of result.children) {
      if (queue.length >= MAX_DIRECTORIES) {
        truncated = true
        break
      }
      queue.push({ path, depth: item.depth + 1 })
    }
  }
  signal.throwIfAborted()
  return { paths: paths.sort(), truncated: truncated || cursor < queue.length }
}
