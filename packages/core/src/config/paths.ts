import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"

const RESERVED_TOOL_FILENAMES = new Set([
  "database.yml",
  "git.yml",
  "runner.yml",
  "http.yml",
  "terminal.yml",
])

export type ConfigurationLocation = {
  configPath?: string
  environment?: Record<string, string | undefined>
  homeDirectory?: string
  cwd?: string
}

/** Only the main YAML moves; sibling tool YAMLs follow its directory. */
export function resolveConfigurationPath(options: ConfigurationLocation = {}) {
  const environment = options.environment ?? process.env
  const home = options.homeDirectory ?? homedir()
  const cwd = options.cwd ?? process.cwd()
  const selected = options.configPath ?? environment.TUIMINAL_CONFIG?.trim()
  if (selected) {
    const expanded = selected.startsWith("~/") ? join(home, selected.slice(2)) : selected
    const path = resolve(cwd, expanded)
    if (RESERVED_TOOL_FILENAMES.has(basename(path).toLowerCase())) {
      throw new Error(
        `Main configuration filename "${basename(path)}" is reserved for a tool; choose config.yml or another filename`,
      )
    }
    return path
  }
  const xdg = environment.XDG_CONFIG_HOME?.trim()
  const root = xdg && isAbsolute(xdg) ? xdg : join(home, ".config")
  return join(root, "tuiminal", "config.yml")
}

export function configurationDirectory(options: ConfigurationLocation = {}) {
  return dirname(resolveConfigurationPath(options))
}
