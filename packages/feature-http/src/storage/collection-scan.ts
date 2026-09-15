import { watch as watchFs, type Dirent, type FSWatcher } from "node:fs"
import { readFile, readdir, realpath, stat } from "node:fs/promises"
import { extname, relative, resolve, sep } from "node:path"
import { parseHttpFile, type ParsedHttpFile } from "../model/http-file"

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
])
const MAX_HTTP_FILE_BYTES = 1_000_000
export const HTTP_PROJECT_MAX_FILES = 500
export const HTTP_PROJECT_MAX_DIRECTORIES = 1_000
export const HTTP_PROJECT_MAX_SOURCE_BYTES = 20_000_000
export const HTTP_PROJECT_MAX_WATCHERS = 512
const HTTP_PROJECT_MAX_ERRORS = 100
const HTTP_ENVIRONMENT_FILES = new Set(["http-client.env.json", "http-client.private.env.json"])

export type HttpCollectionFile = ParsedHttpFile & { absolutePath: string }
export type HttpProjectCollection = {
  root: string
  files: HttpCollectionFile[]
  errors: Array<{ path: string; message: string }>
}

type HttpScanBudget = { directories: number; files: number; bytes: number; exhausted: boolean }

function insideRoot(root: string, candidate: string) {
  const normalizedRoot = resolve(root)
  const normalizedCandidate = resolve(candidate)
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  )
}

function scanError(result: HttpProjectCollection, path: string, message: string) {
  if (result.errors.length < HTTP_PROJECT_MAX_ERRORS) result.errors.push({ path, message })
}

function exhaustScan(
  budget: HttpScanBudget,
  result: HttpProjectCollection,
  path: string,
  message: string,
) {
  if (!budget.exhausted) scanError(result, path, message)
  budget.exhausted = true
}

async function scanHttpFile(
  root: string,
  absolutePath: string,
  result: HttpProjectCollection,
  budget: HttpScanBudget,
) {
  if (budget.files >= HTTP_PROJECT_MAX_FILES) {
    exhaustScan(
      budget,
      result,
      relative(root, absolutePath),
      "Limite de 500 arquivos HTTP atingido.",
    )
    return
  }
  try {
    const fileStat = await stat(absolutePath)
    if (fileStat.size > MAX_HTTP_FILE_BYTES) {
      scanError(result, relative(root, absolutePath), "Arquivo maior que 1 MB; leitura ignorada.")
      return
    }
    if (budget.bytes + fileStat.size > HTTP_PROJECT_MAX_SOURCE_BYTES) {
      exhaustScan(budget, result, relative(root, absolutePath), "Limite total de 20 MB atingido.")
      return
    }
    const source = await readFile(absolutePath, "utf8")
    budget.files += 1
    budget.bytes += fileStat.size
    result.files.push({ ...parseHttpFile(source, relative(root, absolutePath)), absolutePath })
  } catch (error) {
    scanError(result, relative(root, absolutePath), String(error))
  }
}

async function scanEntry(
  root: string,
  directory: string,
  entry: Dirent,
  result: HttpProjectCollection,
  budget: HttpScanBudget,
) {
  if (entry.isSymbolicLink()) return
  const absolutePath = resolve(directory, entry.name)
  if (!insideRoot(root, absolutePath)) return
  if (entry.isDirectory()) {
    if (!IGNORED_DIRECTORIES.has(entry.name)) {
      await scanDirectory(root, absolutePath, result, budget)
    }
    return
  }
  if (!entry.isFile() || ![".http", ".rest"].includes(extname(entry.name).toLowerCase())) return
  await scanHttpFile(root, absolutePath, result, budget)
}

async function scanDirectory(
  root: string,
  directory: string,
  result: HttpProjectCollection,
  budget: HttpScanBudget,
) {
  if (budget.directories >= HTTP_PROJECT_MAX_DIRECTORIES) {
    exhaustScan(budget, result, relative(root, directory), "Limite de 1.000 diretórios atingido.")
    return
  }
  budget.directories += 1
  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    scanError(result, relative(root, directory), String(error))
    return
  }
  for (const entry of entries) await scanEntry(root, directory, entry, result, budget)
}

export async function scanHttpProject(root: string): Promise<HttpProjectCollection> {
  const resolvedRoot = await realpath(root)
  const result: HttpProjectCollection = { root: resolvedRoot, files: [], errors: [] }
  await scanDirectory(resolvedRoot, resolvedRoot, result, {
    directories: 0,
    files: 0,
    bytes: 0,
    exhausted: false,
  })
  result.files.sort((left, right) => left.path.localeCompare(right.path))
  return result
}

export function httpProjectChangeRequiresRefresh(fileName: string | null | undefined) {
  if (fileName === null || fileName === undefined) return true
  const parts = fileName.split(/[\\/]/).filter(Boolean)
  if (!parts.length || parts.some((part) => IGNORED_DIRECTORIES.has(part))) return false
  const leaf = parts.at(-1)?.toLowerCase() ?? ""
  if ([".http", ".rest"].includes(extname(leaf))) return true
  if (HTTP_ENVIRONMENT_FILES.has(leaf)) return true
  return parts.slice(-3).join("/").toLowerCase() === ".tuiminal/http/config.json"
}

async function projectDirectories(root: string) {
  const directories = [resolve(root)]
  for (
    let index = 0;
    index < directories.length && directories.length < HTTP_PROJECT_MAX_WATCHERS;
    index += 1
  ) {
    const directory = directories[index]
    if (!directory) continue
    let entries: Dirent[]
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && !IGNORED_DIRECTORIES.has(entry.name)) {
        directories.push(resolve(directory, entry.name))
        if (directories.length >= HTTP_PROJECT_MAX_WATCHERS) break
      }
    }
  }
  return directories
}

export async function watchHttpProject(root: string, onChange: () => void) {
  const resolvedRoot = resolve(root)
  let closed = false
  let reconciling = true
  let pending = false
  let refreshRequested = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const watchers = new Map<string, FSWatcher>()

  const schedule = (refresh: boolean) => {
    if (closed) return
    pending = true
    refreshRequested ||= refresh
    if (timer || reconciling) return
    timer = setTimeout(() => void flush(), 80)
  }
  const attach = (directory: string) => {
    if (closed || watchers.has(directory)) return
    try {
      const watcher = watchFs(directory, (event, fileName) => {
        const path =
          fileName === null ? null : relative(resolvedRoot, resolve(directory, String(fileName)))
        if (httpProjectChangeRequiresRefresh(path)) schedule(true)
        else if (event === "rename") schedule(false)
      })
      watchers.set(directory, watcher)
    } catch {
      // A directory can disappear between discovery and watch installation.
    }
  }
  const reconcile = async () => {
    const directories = new Set(await projectDirectories(resolvedRoot))
    if (closed) return false
    let changed = false
    for (const [directory, watcher] of watchers) {
      if (directories.has(directory)) continue
      watcher.close()
      watchers.delete(directory)
      changed = true
    }
    for (const directory of directories) {
      if (watchers.has(directory)) continue
      attach(directory)
      changed = true
    }
    return changed
  }
  const flush = async () => {
    timer = null
    pending = false
    reconciling = true
    try {
      const structureChanged = await reconcile()
      const refresh = refreshRequested || structureChanged
      refreshRequested = false
      // A new directory can already contain files before its watcher is attached.
      if (!closed && refresh) onChange()
    } finally {
      reconciling = false
      if (pending) schedule(false)
    }
  }

  // Bun's recursive watcher can miss descendants created after registration on
  // macOS. Watch a bounded directory set explicitly and reconcile rename events.
  // Attach the root before discovery so concurrent directory creation is observed.
  attach(resolvedRoot)
  await reconcile()
  reconciling = false
  if (pending) schedule(false)
  return () => {
    closed = true
    if (timer) clearTimeout(timer)
    for (const watcher of watchers.values()) watcher.close()
    watchers.clear()
  }
}
