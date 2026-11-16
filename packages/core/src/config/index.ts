import { dirname, join } from "node:path"
import {
  getDefaultShortcuts,
  normalizeShortcut,
  setToolShortcuts,
  type ShortcutBindings,
  validateShortcuts,
} from "../keyboard/bindings"
import {
  DEFAULT_CONFIGURED_THEME,
  type ConfiguredTheme,
  setConfiguredTheme,
  validateConfiguredTheme,
} from "../settings/configured-theme"
import {
  setConfiguredMasterKey,
  validateConfiguredMasterKey,
} from "../settings/configured-terminal"
import type { TerminalMasterKey } from "../settings/terminal"
import { type ConfigurationLocation, resolveConfigurationPath } from "./paths"
import { type ConfigurationWarning, loadYamlFile } from "./yaml-file"

export { resolveConfigurationPath, type ConfigurationLocation } from "./paths"
export type { ConfigurationWarning } from "./yaml-file"

const TOOL_FILES = ["database", "git", "runner", "http", "terminal"] as const
type Tool = (typeof TOOL_FILES)[number]
type MainConfiguration = { shortcuts: ShortcutBindings; theme: ConfiguredTheme }
export type YamlConfiguration = {
  path: string
  directory: string
  main: MainConfiguration
  tools: Record<Tool, ShortcutBindings>
  terminalMasterKey: TerminalMasterKey | null
  warnings: ConfigurationWarning[]
}

function mapping(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Configuration must be a mapping")
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unknown configuration option: ${key}`)
  }
  return value as Record<string, unknown>
}

/** No module import performs I/O. Bootstrap owns this explicit initialization. */
export function loadYamlConfiguration(options: ConfigurationLocation = {}): YamlConfiguration {
  const path = resolveConfigurationPath(options)
  const directory = dirname(path)
  const main = loadYamlFile(
    path,
    { shortcuts: getDefaultShortcuts("global"), theme: DEFAULT_CONFIGURED_THEME },
    (value): MainConfiguration => {
      const data = mapping(value, ["shortcuts", "theme"])
      return {
        shortcuts: validateShortcuts("global", data.shortcuts),
        theme: validateConfiguredTheme(data.theme),
      }
    },
  )
  const warnings = [...main.warnings]
  const tools = {} as Record<Tool, ShortcutBindings>
  let terminalMasterKey: TerminalMasterKey | null = null
  for (const tool of TOOL_FILES) {
    const loaded = loadYamlFile(
      join(directory, `${tool}.yml`),
      { shortcuts: getDefaultShortcuts(tool), ...(tool === "terminal" ? { masterKey: null } : {}) },
      (value) => {
        const data = mapping(
          value,
          tool === "terminal" ? ["shortcuts", "masterKey"] : ["shortcuts"],
        )
        return {
          shortcuts: validateShortcuts(tool, data.shortcuts),
          masterKey: tool === "terminal" ? validateConfiguredMasterKey(data.masterKey) : null,
        }
      },
      (key, path) => (path.length === 2 && path[0] === "shortcuts" ? normalizeShortcut(key) : key),
    )
    tools[tool] = loaded.value.shortcuts
    if (tool === "terminal") terminalMasterKey = loaded.value.masterKey
    warnings.push(...loaded.warnings)
  }
  return { path, directory, main: main.value, tools, terminalMasterKey, warnings }
}

let initialized: YamlConfiguration | undefined

export function initializeYamlConfiguration(configPath?: string): YamlConfiguration {
  const options = configPath === undefined ? {} : { configPath }
  if (initialized?.path === resolveConfigurationPath(options)) return initialized
  const configuration = loadYamlConfiguration(options)
  setToolShortcuts("global", configuration.main.shortcuts)
  for (const tool of TOOL_FILES) setToolShortcuts(tool, configuration.tools[tool])
  setConfiguredTheme(configuration.main.theme)
  setConfiguredMasterKey(configuration.terminalMasterKey)
  initialized = configuration
  return configuration
}

export function getYamlConfigurationWarnings(): ConfigurationWarning[] {
  return initialized?.warnings.map((warning) => ({ ...warning })) ?? []
}
