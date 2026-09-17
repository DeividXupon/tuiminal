import type { Dirent } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export type HttpImportPathSuggestion = {
  label: string
  path: string
  directory: boolean
}

function unquoteTerminalPath(input: string) {
  const trimmed = input.trim()
  const quoted =
    trimmed.length > 1 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  const value = quoted ? trimmed.slice(1, -1) : trimmed
  return process.platform === "win32" ? value : value.replace(/\\([ ()\[\]'"\\])/gu, "$1")
}

export function resolveHttpImportSourcePath(input: string, home = homedir()) {
  const value = unquoteTerminalPath(input)
  if (!value) throw new Error("Informe o arquivo a importar.")
  if (value.startsWith("file://")) return fileURLToPath(value)
  if (value === "~") return resolve(home)
  if (value.startsWith("~/")) return resolve(home, value.slice(2))
  if (!isAbsolute(value)) throw new Error("Use um caminho completo ou ~/ para importar.")
  return resolve(value)
}

export function pastedHttpImportSourcePath(input: string) {
  if (input.trim().includes("\n") || input.trim().includes("\r")) return null
  try {
    return resolveHttpImportSourcePath(input)
  } catch {
    return null
  }
}

function supportedFile(name: string) {
  return /\.(json|ya?ml)$/iu.test(name)
}

async function entryIsDirectory(path: string, entry: Dirent<string>) {
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false
  return (await stat(path).catch(() => null))?.isDirectory() === true
}

export async function suggestHttpImportSourcePaths(
  input: string,
  home = homedir(),
): Promise<HttpImportPathSuggestion[]> {
  if (input === "~") return [{ label: "~/", path: "~/", directory: true }]
  const separator = process.platform === "win32" && input.includes("\\") ? "\\" : "/"
  const lastSeparator = input.lastIndexOf(separator)
  if (lastSeparator < 0) return []
  const displayDirectory = input.slice(0, lastSeparator + 1)
  const prefix = input.slice(lastSeparator + 1).toLocaleLowerCase()
  let directory: string
  try {
    directory = resolveHttpImportSourcePath(displayDirectory, home)
  } catch {
    return []
  }
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const matches: HttpImportPathSuggestion[] = []
  for (const entry of entries) {
    if (!entry.name.toLocaleLowerCase().startsWith(prefix)) continue
    if (!prefix && entry.name.startsWith(".")) continue
    const path = join(directory, entry.name)
    const directoryEntry = await entryIsDirectory(path, entry)
    if (!directoryEntry && !supportedFile(entry.name)) continue
    matches.push({
      label: `${entry.name}${directoryEntry ? separator : ""}`,
      path: `${displayDirectory}${entry.name}${directoryEntry ? separator : ""}`,
      directory: directoryEntry,
    })
  }
  return matches
    .sort((left, right) =>
      left.directory === right.directory
        ? left.label.localeCompare(right.label)
        : left.directory
          ? -1
          : 1,
    )
    .slice(0, 6)
}
