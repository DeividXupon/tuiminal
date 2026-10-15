import { accessSync, constants } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

type OpenCodeExecutableOptions = {
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

/** Resolves OpenCode installs added after Tuiminal started. */
export function resolveOpenCodeExecutable(options: OpenCodeExecutableOptions = {}) {
  const which = options.which ?? ((command: string) => Bun.which(command))
  const discovered = which("opencode")
  if (discovered) return discovered

  const home = options.home ?? homedir()
  const filename = (options.platform ?? process.platform) === "win32" ? "opencode.exe" : "opencode"
  const executable = options.executable ?? executableFile
  const candidates = [
    join(home, ".opencode", "bin", filename),
    join(home, ".local", "bin", filename),
    join(home, ".bun", "bin", filename),
    join(home, ".npm-global", "bin", filename),
  ]
  return candidates.find(executable) ?? "opencode"
}
