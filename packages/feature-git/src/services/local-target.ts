import type { Dirent } from "node:fs"
import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, delimiter, relative, resolve } from "node:path"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { resolveGitProjectContext, runGitCommand } from "./git"

export type LocalGitProject = {
  root: string
  name: string
  displayPath: string
}

export type LocalGitTarget = LocalGitProject & {
  isRepository: boolean
  branch: string
  branches: string[]
}

const IGNORED_DIRECTORIES = new Set([
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

export function displayLocalProjectPath(path: string) {
  const home = homedir()
  if (path === home) return "~"
  const fromHome = relative(home, path)
  return fromHome && !fromHome.startsWith("..") ? `~/${fromHome}` : path
}

function localProject(root: string): LocalGitProject {
  return { root, name: basename(root), displayPath: displayLocalProjectPath(root) }
}

export async function loadLocalGitTarget(directory: string): Promise<LocalGitTarget> {
  const context = await resolveGitProjectContext(directory)
  if (!context.isRepository) {
    return {
      ...localProject(resolve(directory)),
      isRepository: false,
      branch: "—",
      branches: [],
    }
  }
  const [branchResult, branchesResult] = await Promise.all([
    runGitCommand(context.root, ["symbolic-ref", "--short", "-q", "HEAD"]),
    runGitCommand(context.root, [
      "for-each-ref",
      "--format=%(refname:short)",
      "--sort=refname",
      "refs/heads",
    ]),
  ])
  let branch = branchResult.stdout.trim()
  if (!branch) {
    const head = await runGitCommand(context.root, ["rev-parse", "--short", "HEAD"])
    branch = head.exitCode === 0 ? `HEAD@${head.stdout.trim()}` : "sem commits"
  }
  return {
    ...localProject(context.root),
    isRepository: true,
    branch,
    branches: branchesResult.stdout
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
  }
}

export async function switchLocalGitBranch(root: string, branch: string) {
  const target = await loadLocalGitTarget(root)
  if (!target.isRepository) {
    throw new Error(translateUi("O projeto selecionado não é um repositório Git."))
  }
  if (!target.branches.includes(branch)) {
    throw new Error(translateUi("A branch selecionada não existe localmente."))
  }
  if (target.branch === branch) return target
  const result = await runGitCommand(target.root, ["switch", "--quiet", "--no-guess", branch])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || translateUi("Não foi possível trocar a branch."))
  }
  return loadLocalGitTarget(target.root)
}

function shouldSkip(name: string) {
  return name.startsWith(".") || IGNORED_DIRECTORIES.has(name)
}

function browsableDirectory(entry: Dirent<string>) {
  return entry.isDirectory() && !shouldSkip(entry.name)
}

function enqueueLocalProjectDirectories(
  entries: readonly Dirent<string>[],
  parent: { path: string; depth: number },
  queue: Array<{ path: string; depth: number }>,
) {
  for (const entry of entries) {
    if (!browsableDirectory(entry)) continue
    queue.push({ path: resolve(parent.path, entry.name), depth: parent.depth + 1 })
  }
}

export async function discoverLocalGitProjects(currentRoot: string): Promise<LocalGitProject[]> {
  const configuredRoots = process.env.TUIMINAL_PROJECT_ROOTS?.split(delimiter)
    .map((path) => path.trim())
    .filter(Boolean)
  const roots = configuredRoots?.length ? configuredRoots : [homedir()]
  const queue = [...new Set([currentRoot, ...roots])].map((path) => ({
    path: resolve(path),
    depth: 0,
  }))
  const projects = new Map<string, LocalGitProject>()
  let cursor = 0
  const scan = async () => {
    while (cursor < queue.length) {
      if (projects.size >= 300) return
      const item = queue[cursor++]
      if (!item) continue
      let entries: Dirent<string>[]
      try {
        entries = await readdir(item.path, { withFileTypes: true })
      } catch {
        continue
      }
      if (entries.some((entry) => entry.name === ".git")) {
        projects.set(item.path, localProject(item.path))
        continue
      }
      if (item.depth >= 7) continue
      enqueueLocalProjectDirectories(entries, item, queue)
    }
  }
  await Promise.all(Array.from({ length: 16 }, () => scan()))
  return [...projects.values()].sort((left, right) => {
    if (left.root === resolve(currentRoot)) return -1
    if (right.root === resolve(currentRoot)) return 1
    return left.name.localeCompare(right.name) || left.root.localeCompare(right.root)
  })
}
