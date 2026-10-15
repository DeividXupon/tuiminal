import { accessSync, constants } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

type CodexExecutableOptions = {
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

/** Resolves installs added after Tuiminal started, including Codex standalone. */
export function resolveCodexExecutable(options: CodexExecutableOptions = {}) {
  const which = options.which ?? ((command: string) => Bun.which(command))
  const discovered = which("codex")
  if (discovered) return discovered

  const home = options.home ?? homedir()
  const platform = options.platform ?? process.platform
  const executable = options.executable ?? executableFile
  const filename = platform === "win32" ? "codex.exe" : "codex"
  const candidates = [
    join(home, ".local", "bin", filename),
    join(home, ".codex", "packages", "standalone", "current", "bin", filename),
    join(home, ".bun", "bin", filename),
    join(home, ".npm-global", "bin", filename),
  ]
  return candidates.find(executable) ?? "codex"
}
