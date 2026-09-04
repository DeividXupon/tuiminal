import type { Dirent } from "node:fs"
import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, delimiter, relative, resolve } from "node:path"

import type { RunnerProject, RunnerDirectoryEntry } from "../model/types"
import { RUNNER_WORKING_DIRECTORY } from "../services/context"
import { fileExists } from "./shared"

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

export async function discoverRunnerProjects(
  currentRoot = RUNNER_WORKING_DIRECTORY,
): Promise<RunnerProject[]> {
  const configuredRoots = process.env.TUIMINAL_PROJECT_ROOTS?.split(delimiter)
    .map((path) => path.trim())
    .filter(Boolean)
  const roots = configuredRoots?.length ? configuredRoots : [homedir()]
  const queue = [...new Set([currentRoot, ...roots])].map((path) => ({
    path: resolve(path),
    depth: 0,
  }))
  const projects = new Map<string, RunnerProject>()
  let cursor = 0

  const scan = async () => {
    while (cursor < queue.length && projects.size < 300) {
      const item = queue[cursor]
      cursor += 1
      if (!item) continue
      let entries: Dirent<string>[]
      try {
        entries = await readdir(item.path, { withFileTypes: true })
      } catch {
        continue
      }

      if (entries.some((entry) => entry.name === ".git")) {
        if (!projects.has(item.path)) {
          projects.set(item.path, {
            path: item.path,
            name: basename(item.path),
            displayPath: displayProjectPath(item.path),
          })
        }
        continue
      }
      if (item.depth >= 7) continue

      for (const entry of entries) {
        if (!entry.isDirectory() || shouldSkipProjectDirectory(entry.name)) {
          continue
        }
        queue.push({
          path: resolve(item.path, entry.name),
          depth: item.depth + 1,
        })
      }
    }
  }

  await Promise.all(Array.from({ length: 16 }, () => scan()))
  return [...projects.values()].sort((left, right) => {
    if (left.path === resolve(currentRoot)) return -1
    if (right.path === resolve(currentRoot)) return 1
    const byName = left.name.localeCompare(right.name)
    return byName || left.path.localeCompare(right.path)
  })
}

export async function listRunnerDirectories(directory: string): Promise<RunnerDirectoryEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const directories = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== ".git" &&
          !IGNORED_PROJECT_DIRECTORIES.has(entry.name),
      )
      .map(async (entry) => {
        const path = resolve(directory, entry.name)
        return {
          path,
          name: entry.name,
          git: await fileExists(resolve(path, ".git")),
        }
      }),
  )
  return directories.sort((left, right) => {
    if (left.git !== right.git) return left.git ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}
