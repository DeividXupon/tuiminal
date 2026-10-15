import { accessSync, constants } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

type ClaudeExecutableOptions = {
  home?: string
  platform?: NodeJS.Platform
  which?: (command: string) => string | null
  executable?: (path: string) => boolean
}

function executableFile(path: string) {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Resolves installs added after Tuiminal started, including the native installer. */
export function resolveClaudeExecutable(options: ClaudeExecutableOptions = {}) {
  const which = options.which ?? ((command: string) => Bun.which(command))
  const discovered = which("claude")
  if (discovered) return discovered
  const home = options.home ?? homedir()
  const filename = (options.platform ?? process.platform) === "win32" ? "claude.exe" : "claude"
  const executable = options.executable ?? executableFile
  const candidates = [
    join(home, ".local", "bin", filename),
    join(home, ".bun", "bin", filename),
    join(home, ".npm-global", "bin", filename),
  ]
  return candidates.find(executable) ?? "claude"
}
