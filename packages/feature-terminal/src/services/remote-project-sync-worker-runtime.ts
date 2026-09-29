import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { installedTerminalProjectSyncWorkerCommand } from "@xupon/tuiminal-core/runtime/feature-host"

type ProjectSyncWorkerCommandOptions = {
  executablePath?: string
  platform?: NodeJS.Platform
  pathExists?: (path: string) => boolean
  sourcePath?: string
}

export function remoteProjectSyncWorkerCommand({
  executablePath = process.execPath,
  platform = process.platform,
  pathExists = existsSync,
  sourcePath,
}: ProjectSyncWorkerCommandOptions = {}) {
  const installed = installedTerminalProjectSyncWorkerCommand()
  if (installed && executablePath === process.execPath && !sourcePath) return installed
  sourcePath ??= fileURLToPath(
    new URL(
      import.meta.url.endsWith(".ts")
        ? "./remote-project-sync-worker.ts"
        : "./remote-project-sync-worker.js",
      import.meta.url,
    ),
  )
  const helperName = platform === "win32" ? "tuiminal-project-sync.exe" : "tuiminal-project-sync"
  const packagedHelper = join(dirname(executablePath), helperName)
  return pathExists(packagedHelper) ? [packagedHelper] : [executablePath, sourcePath]
}
