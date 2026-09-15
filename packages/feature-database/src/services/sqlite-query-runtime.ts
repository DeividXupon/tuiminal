import { installedSqliteWorkerCommand } from "@xupon/tuiminal-core/runtime/feature-host"
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
  sourcePath,
}: SqliteQueryProcessOptions = {}) {
  const installedCommand = installedSqliteWorkerCommand()
  if (installedCommand && executablePath === process.execPath && !sourcePath)
    return installedCommand
  sourcePath ??= fileURLToPath(
    new URL(
      import.meta.url.endsWith(".ts")
        ? "../drivers/sqlite-query-process.ts"
        : "../drivers/sqlite-query-process.js",
      import.meta.url,
    ),
  )
  const helperName = platform === "win32" ? "tuiminal-sqlite-query.exe" : "tuiminal-sqlite-query"
  const packagedHelper = join(dirname(executablePath), helperName)
  return pathExists(packagedHelper) ? [packagedHelper] : [executablePath, sourcePath]
}
