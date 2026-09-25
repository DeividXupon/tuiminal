import type { LanguageId } from "@xupon/tuiminal-core/i18n/index"
import type {
  ColorMode,
  LayoutMode,
  PaletteId,
  TerminalMasterKey,
  UiSettings,
} from "@xupon/tuiminal-core/settings/theme"
import type {
  RemoteCodexConnectionTestResult,
  RemoteServerReadinessReport,
} from "@xupon/tuiminal-feature-terminal"
import type { ConfigurationContext, ConfigurationSection } from "../model/configuration-context"

export type ConfigurationModalProps = {
  open: boolean
  settings: UiSettings
  section: ConfigurationSection
  focusedSection: ConfigurationSection
  navigationActive: boolean
  notice: string
  onClose: () => void
  onSectionChange: (section: ConfigurationSection) => void
  onSectionFocus: (section: ConfigurationSection) => void
  onNavigationFocus: () => void
  onTerminalAgentCommandsChange?: ((commands: string[]) => void) | undefined
  onTerminalRemoteProfilesChange?:
    | ((profiles: UiSettings["terminalRemoteCodexProfiles"]) => void)
    | undefined
  onTerminalRemoteActiveProfileChange?: ((profileId: string) => void) | undefined
  onTerminalRemoteProfileTest?:
    | ((
        profile: UiSettings["terminalRemoteCodexProfiles"][number],
        signal?: AbortSignal,
      ) => Promise<RemoteCodexConnectionTestResult>)
    | undefined
  onTerminalRemoteReadinessCheck?:
    | ((
        profile: UiSettings["terminalRemoteCodexProfiles"][number],
        signal?: AbortSignal,
      ) => Promise<RemoteServerReadinessReport>)
    | undefined
  onConfigureRemoteServer?:
    | ((profile: UiSettings["terminalRemoteCodexProfiles"][number]) => void)
    | undefined
  onTerminalMasterKeyChange?: ((key: TerminalMasterKey) => void) | undefined
  onPaletteChange: (palette: PaletteId) => void
  onColorModeChange: (mode: ColorMode) => void
  onLayoutChange: (layout: LayoutMode) => void
  onLanguageChange: (language: LanguageId) => void
  onOpenSensitiveTerms: () => void
  onReset: () => void
  onOpenQueryHistory: () => void
  onOpenFeatures: () => void
  onStartTutorial: () => void
  queryHistoryCount: number
  tutorialLabel: string
  context: ConfigurationContext
  onGitConfigurationChanged: (change: "local" | "remote") => void
}

export const CONFIGURATION_SECTION_LABELS: Record<ConfigurationSection, string> = {
  terminal: "Terminal",
  remoteConnection: "CONEXÃO REMOTA",
  gitDiffs: "DIFFS",
  gitPullRequests: "PULL REQUESTS",
  gitIssues: "ISSUES",
  gitRepositories: "REPOSITÓRIOS",
  gitBrowser: "NAVEGADOR",
  sensitive: "DADOS SENSÍVEIS",
  history: "HISTÓRICO SQL",
  colorMode: "MODO DE COR",
  palette: "PALETA",
  layout: "LAYOUT",
  language: "IDIOMA",
  tutorial: "TUTORIAL",
  features: "FERRAMENTAS OFICIAIS",
}
