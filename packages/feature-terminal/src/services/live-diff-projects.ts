import { readdir, realpath } from "node:fs/promises"
import { delimiter } from "node:path"
import { basename, dirname, resolve } from "node:path"

const MAX_PROJECTS = 200
const MAX_DIRECTORIES = 600
const IGNORED = new Set([
  "Library",
  "Applications",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "venv",
])

export type LiveDiffProject = { path: string; name: string; parent: string }

export async function discoverLiveDiffProjects(
  seeds: readonly string[],
  signal: AbortSignal,
): Promise<LiveDiffProject[]> {
  const configured = process.env.TUIMINAL_PROJECT_ROOTS?.split(delimiter)
    .map((path) => path.trim())
    .filter(Boolean)
  const resolvedSeeds = [...new Set(seeds.filter(Boolean).map((path) => resolve(path)))]
  const roots = configured?.length
    ? configured.map((path) => ({ path: resolve(path), depth: 0, maxDepth: 7 }))
    : [
        ...resolvedSeeds.map((path) => ({ path, depth: 0, maxDepth: 0 })),
        ...resolvedSeeds.map((path) => ({ path: dirname(path), depth: 0, maxDepth: 2 })),
      ]
  const visited = new Set<string>()
  const queue = roots.filter((item) => {
    if (visited.has(item.path)) return false
    visited.add(item.path)
    return true
  })
  const projects = new Map<string, LiveDiffProject>()
  let cursor = 0
  while (cursor < queue.length && cursor < MAX_DIRECTORIES && projects.size < MAX_PROJECTS) {
    signal.throwIfAborted()
    const item = queue[cursor++]!
    const entries = await readdir(item.path, { withFileTypes: true }).catch(() => [])
    if (entries.some((entry) => entry.name === ".git")) {
      const canonical = await realpath(item.path).catch(() => item.path)
      projects.set(canonical, {
        path: canonical,
        name: basename(canonical),
        parent: basename(dirname(canonical)),
      })
      continue
    }
    if (item.depth >= item.maxDepth) continue
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || IGNORED.has(entry.name)) continue
      const path = resolve(item.path, entry.name)
      if (visited.has(path)) continue
      visited.add(path)
      queue.push({ path, depth: item.depth + 1, maxDepth: item.maxDepth })
    }
  }
  return [...projects.values()].sort(
    (left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path),
  )
}
