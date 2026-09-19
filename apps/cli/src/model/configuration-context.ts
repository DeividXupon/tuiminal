import type { ToolId } from "../tool-catalog"

export type ConfigurationSection =
  | "git"
  | "colorMode"
  | "palette"
  | "layout"
  | "language"
  | "sensitive"
  | "history"
  | "tutorial"
  | "features"

export type ConfigurationContext = "database" | "git" | "global" | "installer"

const GLOBAL_CONFIGURATION_SECTIONS: ConfigurationSection[] = [
  "colorMode",
  "palette",
  "layout",
  "language",
  "tutorial",
  "features",
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
  if (context === "installer")
    return GLOBAL_CONFIGURATION_SECTIONS.filter((section) => section !== "tutorial")
  if (context === "database") return [...DATABASE_CONFIGURATION_SECTIONS]
  if (context === "git") return ["git" as const, ...GLOBAL_CONFIGURATION_SECTIONS]
  return [...GLOBAL_CONFIGURATION_SECTIONS]
}

export function normalizeConfigurationSectionForContext(
  section: ConfigurationSection,
  context: ConfigurationContext,
) {
  const sections = configurationSectionsForContext(context)
  return sections.includes(section) ? section : (sections[0] ?? "colorMode")
}

export function activateConfigurationSection(
  section: ConfigurationSection,
  actions: {
    openFeatures: () => void
    startTutorial: () => void
    openHistory: () => void
    openSensitive: () => void
    openGit: () => void
  },
) {
  if (section === "features") return actions.openFeatures()
  if (section === "tutorial") return actions.startTutorial()
  if (section === "history") return actions.openHistory()
  if (section === "sensitive") return actions.openSensitive()
  if (section === "git") return actions.openGit()
}
