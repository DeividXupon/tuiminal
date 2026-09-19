import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { ConfigurationSection } from "../model/configuration-context"
import {
  gitConfigurationTabForSection,
  isGitConfigurationSection,
} from "../model/configuration-context"
import {
  ColorModeDetail,
  LanguageDetail,
  LayoutDetail,
  PaletteDetail,
} from "./ConfigurationAppearanceDetails"
import { ConfigurationDetailHeader } from "./ConfigurationDetailHeader"
import type { ConfigurationModalProps } from "./configuration-modal-types"
import { GitConfigurationView } from "../features/components"

function ActionDetail({
  section,
  notice,
  buttonId,
  buttonLabel,
  primary,
  secondary,
  accent = COLORS.focus,
  compact,
  contentWidth,
  onPress,
}: {
  section: ConfigurationSection
  notice: string
  buttonId: string
  buttonLabel: string
  primary: string
  secondary: string
  accent?: string
  compact: boolean
  contentWidth: number
  onPress: () => void
}) {
  return (
    <>
      <ConfigurationDetailHeader
        section={section}
        notice={notice}
        action
        compact={compact}
        contentWidth={contentWidth}
      />
      <text
        content={truncateDisplay(translateUi(primary), contentWidth)}
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      <text
        content={translateUi(secondary)}
        style={{ height: 2, flexShrink: 0, fg: COLORS.muted }}
      />
      <box style={{ height: 1, flexShrink: 0 }}>
        <InlineButton id={buttonId} label={buttonLabel} accent={accent} active onPress={onPress} />
      </box>
    </>
  )
}

type ConfigurationDetailProps = Pick<
  ConfigurationModalProps,
  | "settings"
  | "section"
  | "navigationActive"
  | "notice"
  | "onNavigationFocus"
  | "onPaletteChange"
  | "onColorModeChange"
  | "onLayoutChange"
  | "onLanguageChange"
  | "onOpenSensitiveTerms"
  | "onOpenQueryHistory"
  | "onOpenFeatures"
  | "onStartTutorial"
  | "queryHistoryCount"
  | "tutorialLabel"
  | "onGitConfigurationChanged"
> & { compact: boolean; contentWidth: number }

export function ConfigurationDetail({
  section,
  settings,
  navigationActive,
  notice,
  onNavigationFocus,
  queryHistoryCount,
  tutorialLabel,
  onPaletteChange,
  onColorModeChange,
  onLayoutChange,
  onLanguageChange,
  onOpenSensitiveTerms,
  onOpenQueryHistory,
  onOpenFeatures,
  onStartTutorial,
  onGitConfigurationChanged,
  compact,
  contentWidth,
}: ConfigurationDetailProps) {
  if (section === "colorMode")
    return (
      <ColorModeDetail
        settings={settings}
        notice={notice}
        onChange={onColorModeChange}
        compact={compact}
        contentWidth={contentWidth}
      />
    )
  if (section === "palette")
    return (
      <PaletteDetail
        settings={settings}
        notice={notice}
        onChange={onPaletteChange}
        compact={compact}
        contentWidth={contentWidth}
      />
    )
  if (section === "layout")
    return (
      <LayoutDetail
        settings={settings}
        notice={notice}
        onChange={onLayoutChange}
        compact={compact}
        contentWidth={contentWidth}
      />
    )
  if (section === "language")
    return (
      <LanguageDetail
        settings={settings}
        notice={notice}
        onChange={onLanguageChange}
        compact={compact}
        contentWidth={contentWidth}
      />
    )
  if (isGitConfigurationSection(section))
    return (
      <GitConfigurationView
        active
        keyboardActive={!navigationActive}
        tab={gitConfigurationTabForSection(section)}
        width={contentWidth}
        onBackToNavigation={onNavigationFocus}
        onChanged={onGitConfigurationChanged}
      />
    )
  if (section === "sensitive")
    return (
      <ActionDetail
        section="sensitive"
        notice={notice}
        buttonId="configuration-open-sensitive-terms"
        buttonLabel="[Enter] editar"
        primary={`${translateUi(`${settings.sensitiveTerms.length} termos`)} · ${truncateDisplay(
          settings.sensitiveTerms.join(", ") || translateUi("desativado"),
          48,
        )}`}
        secondary="Escolha quais fragmentos de nomes de colunas serão mascarados."
        accent={COLORS.warning}
        compact={compact}
        contentWidth={contentWidth}
        onPress={onOpenSensitiveTerms}
      />
    )
  if (section === "history")
    return (
      <ActionDetail
        section="history"
        notice={notice}
        buttonId="configuration-open-query-history"
        buttonLabel="[Enter] abrir"
        primary={`${translateUi("Consultas executadas")} · ${queryHistoryCount}`}
        secondary="100 leituras recentes · alterações por 6 meses."
        accent={COLORS.database}
        compact={compact}
        contentWidth={contentWidth}
        onPress={onOpenQueryHistory}
      />
    )
  if (section === "tutorial")
    return (
      <ActionDetail
        section="tutorial"
        notice={notice}
        buttonId="configuration-start-tutorial"
        buttonLabel="[Enter] iniciar"
        primary={`▶ Tour guiado · ${translateUi(tutorialLabel)}`}
        secondary="Explica blocos, controles, ações e atalhos em contexto."
        compact={compact}
        contentWidth={contentWidth}
        onPress={onStartTutorial}
      />
    )
  return (
    <ActionDetail
      section="features"
      notice={notice}
      buttonId="configuration-open-features"
      buttonLabel="[Enter] Gerenciar ferramentas"
      primary="Ferramentas oficiais"
      secondary="Instale mais ferramentas para esta versão do Tuiminal."
      compact={compact}
      contentWidth={contentWidth}
      onPress={onOpenFeatures}
    />
  )
}
