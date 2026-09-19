import type { LanguageId } from "@xupon/tuiminal-core/i18n/index"
import type {
  ColorMode,
  LayoutMode,
  PaletteId,
  UiSettings,
} from "@xupon/tuiminal-core/settings/theme"
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
