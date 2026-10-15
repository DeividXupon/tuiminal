import type { ToolId } from "../tool-catalog"
import type { GitConfigurationTab } from "@xupon/tuiminal-feature-git"

export type ConfigurationSection =
  | "gitDiffs"
  | "gitPullRequests"
  | "gitIssues"
  | "gitRepositories"
  | "gitBrowser"
  | "terminal"
  | "remoteConnection"
  | "colorMode"
  | "palette"
  | "layout"
  | "language"
  | "sensitive"
  | "history"
  | "tutorial"
  | "features"

export type ConfigurationContext = "database" | "git" | "global" | "installer" | "terminal"

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

export const GIT_CONFIGURATION_SECTIONS = [
  "gitDiffs",
  "gitPullRequests",
  "gitIssues",
  "gitRepositories",
  "gitBrowser",
] as const satisfies readonly ConfigurationSection[]

const GIT_TAB_BY_SECTION: Record<(typeof GIT_CONFIGURATION_SECTIONS)[number], GitConfigurationTab> =
  {
    gitDiffs: "diffs",
    gitPullRequests: "pull-requests",
    gitIssues: "issues",
    gitRepositories: "repositories",
    gitBrowser: "browser",
  }

export function isGitConfigurationSection(
  section: ConfigurationSection,
): section is (typeof GIT_CONFIGURATION_SECTIONS)[number] {
  return GIT_CONFIGURATION_SECTIONS.includes(section as (typeof GIT_CONFIGURATION_SECTIONS)[number])
}

export function gitConfigurationTabForSection(
  section: (typeof GIT_CONFIGURATION_SECTIONS)[number],
) {
  return GIT_TAB_BY_SECTION[section]
}

export function configurationSectionForGitTab(tab: GitConfigurationTab) {
  return (
    GIT_CONFIGURATION_SECTIONS.find((section) => GIT_TAB_BY_SECTION[section] === tab) ?? "gitDiffs"
  )
}

export function configurationContextForTool(tool: ToolId): ConfigurationContext {
  if (tool === "database") return "database"
  if (tool === "git") return "git"
  if (tool === "terminal") return "terminal"
  return "global"
}

export function configurationSectionsForContext(context: ConfigurationContext) {
  if (context === "terminal")
    return [
      "terminal",
      "remoteConnection",
      ...GLOBAL_CONFIGURATION_SECTIONS.filter((section) => section !== "layout"),
    ] as ConfigurationSection[]
  if (context === "installer")
    return GLOBAL_CONFIGURATION_SECTIONS.filter((section) => section !== "tutorial")
  if (context === "database") return [...DATABASE_CONFIGURATION_SECTIONS]
  if (context === "git") return [...GIT_CONFIGURATION_SECTIONS, ...GLOBAL_CONFIGURATION_SECTIONS]
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
    focusRemoteConnection: () => void
  },
) {
  if (section === "features") return actions.openFeatures()
  if (section === "tutorial") return actions.startTutorial()
  if (section === "history") return actions.openHistory()
  if (section === "sensitive") return actions.openSensitive()
  if (section === "remoteConnection") return actions.focusRemoteConnection()
}
