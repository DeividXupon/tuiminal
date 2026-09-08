import type { ToolId } from "../tool-catalog"

export type ConfigurationSection =
  | "git"
  | "palette"
  | "layout"
  | "language"
  | "sensitive"
  | "history"
  | "tutorial"

export type ConfigurationContext = "database" | "git" | "global"

const GLOBAL_CONFIGURATION_SECTIONS: ConfigurationSection[] = [
  "palette",
  "layout",
  "language",
  "tutorial",
]

const DATABASE_CONFIGURATION_SECTIONS: ConfigurationSection[] = [
  "sensitive",
  "history",
  ...GLOBAL_CONFIGURATION_SECTIONS,
]

export function configurationContextForTool(tool: ToolId): ConfigurationContext {
  if (tool === "database") return "database"
  if (tool === "git") return "git"
  return "global"
}

export function configurationSectionsForContext(context: ConfigurationContext) {
  if (context === "database") return [...DATABASE_CONFIGURATION_SECTIONS]
  if (context === "git") return ["git" as const, ...GLOBAL_CONFIGURATION_SECTIONS]
  return [...GLOBAL_CONFIGURATION_SECTIONS]
}

export function normalizeConfigurationSectionForContext(
  section: ConfigurationSection,
  context: ConfigurationContext,
) {
  const sections = configurationSectionsForContext(context)
  return sections.includes(section) ? section : (sections[0] ?? "palette")
}

export function activateConfigurationSection(
  section: ConfigurationSection,
  actions: {
    startTutorial: () => void
    openHistory: () => void
    openSensitive: () => void
    openGit: () => void
    close: () => void
  },
) {
  if (section === "tutorial") return actions.startTutorial()
  if (section === "history") return actions.openHistory()
  if (section === "sensitive") return actions.openSensitive()
  if (section === "git") return actions.openGit()
  actions.close()
}
