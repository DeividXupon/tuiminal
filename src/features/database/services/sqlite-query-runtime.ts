import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

type SqliteQueryProcessOptions = {
  executablePath?: string
  platform?: NodeJS.Platform
  pathExists?: (path: string) => boolean
  sourcePath?: string
}

export function sqliteQueryProcessCommand({
  executablePath = process.execPath,
  platform = process.platform,
  pathExists = existsSync,
  sourcePath = fileURLToPath(new URL("../drivers/sqlite-query-process.ts", import.meta.url)),
}: SqliteQueryProcessOptions = {}) {
  const helperName = platform === "win32" ? "tuiminal-sqlite-query.exe" : "tuiminal-sqlite-query"
  const packagedHelper = join(dirname(executablePath), helperName)
  return pathExists(packagedHelper) ? [packagedHelper] : [executablePath, sourcePath]
}
