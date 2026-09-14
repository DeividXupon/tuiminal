import type { Dirent } from "node:fs"
import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, delimiter, relative, resolve } from "node:path"

import type { RunnerProject, RunnerDirectoryEntry } from "../model/types"
import { isGitWorktreeRoot, RUNNER_WORKING_DIRECTORY } from "../services/context"

export function displayProjectPath(path: string) {
  const home = homedir()
  if (path === home) return "~"
  const fromHome = relative(home, path)
  return fromHome && !fromHome.startsWith("..") ? `~/${fromHome}` : path
}

export const IGNORED_PROJECT_DIRECTORIES = new Set([
  "Applications",
  "Library",
  "Movies",
  "Music",
  "Pictures",
  "Public",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "venv",
])

export function shouldSkipProjectDirectory(name: string) {
  return name.startsWith(".") || IGNORED_PROJECT_DIRECTORIES.has(name)
}

function isDiscoveredGitProject(path: string, entries: Dirent<string>[]) {
  return entries.some((entry) => entry.name === ".git") && isGitWorktreeRoot(path)
}

export async function discoverRunnerProjects(
  currentRoot = RUNNER_WORKING_DIRECTORY,
): Promise<RunnerProject[]> {
  const configuredRoots = process.env.TUIMINAL_PROJECT_ROOTS?.split(delimiter)
    .map((path) => path.trim())
    .filter(Boolean)
  const roots = configuredRoots?.length ? configuredRoots : [homedir()]
  const visited = new Set([currentRoot, ...roots].map((path) => resolve(path)))
  const queue = [...visited].map((path) => ({
    path,
    depth: 0,
  }))
  const projects = new Map<string, RunnerProject>()
  let cursor = 0

  // Refill each bounded batch: workers must not exit while earlier reads discover children.
  while (cursor < queue.length && projects.size < 300) {
    const batch = queue.slice(cursor, cursor + 16)
    cursor += batch.length
    const results = await Promise.all(
      batch.map(async (item) => {
        try {
          return { ...item, entries: await readdir(item.path, { withFileTypes: true }) }
        } catch {
          return { ...item, entries: [] }
        }
      }),
    )
    for (const item of results) {
      if (projects.size >= 300) break
      const entries = item.entries
      if (isDiscoveredGitProject(item.path, entries)) {
        projects.set(item.path, {
          path: item.path,
          name: basename(item.path),
          displayPath: displayProjectPath(item.path),
        })
        continue
      }
      if (item.depth >= 7) continue

      for (const entry of entries) {
        if (!entry.isDirectory() || shouldSkipProjectDirectory(entry.name)) {
          continue
        }
        const path = resolve(item.path, entry.name)
        if (visited.has(path)) continue
        visited.add(path)
        queue.push({ path, depth: item.depth + 1 })
      }
    }
  }

  const selectedRoot = resolve(currentRoot)
  return [...projects.values()].sort((left, right) => {
    if (left.path === selectedRoot) return -1
    if (right.path === selectedRoot) return 1
    const byName = left.name.localeCompare(right.name)
    return byName || left.path.localeCompare(right.path)
  })
}

export async function listRunnerDirectories(directory: string): Promise<RunnerDirectoryEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const directories = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== ".git" &&
        !IGNORED_PROJECT_DIRECTORIES.has(entry.name),
    )
    .map((entry) => {
      const path = resolve(directory, entry.name)
      return {
        path,
        name: entry.name,
        git: isGitWorktreeRoot(path),
      }
    })
  return directories.sort((left, right) => {
    if (left.git !== right.git) return left.git ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}
