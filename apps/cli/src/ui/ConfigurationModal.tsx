import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useEffect, useRef } from "react"
import {
  type ConfigurationSection,
  configurationSectionsForContext,
  isGitConfigurationSection,
} from "../model/configuration-context"
import { ConfigurationDetail } from "./ConfigurationDetail"
import { ConfigurationNavigation } from "./ConfigurationNavigation"
import {
  CONFIGURATION_SECTION_LABELS,
  type ConfigurationModalProps,
} from "./configuration-modal-types"

export {
  type ConfigurationContext,
  type ConfigurationSection,
  configurationSectionsForContext,
  normalizeConfigurationSectionForContext,
} from "../model/configuration-context"

function configurationDetailLayout(section: ConfigurationSection) {
  return section === "remoteConnection"
    ? { height: "100%" as const, flexGrow: 1 }
    : { flexShrink: 0 }
}

export function ConfigurationModal({
  open,
  settings,
  section,
  focusedSection,
  navigationActive,
  notice,
  onClose,
  onSectionChange,
  onSectionFocus,
  onNavigationFocus,
  onTerminalAgentCommandsChange,
  onTerminalRemoteProfilesChange,
  onTerminalRemoteActiveProfileChange,
  onTerminalRemoteProfileTest,
  onTerminalRemoteReadinessCheck,
  onConfigureRemoteServer,
  onTerminalMasterKeyChange,
  onPaletteChange,
  onColorModeChange,
  onLayoutChange,
  onLanguageChange,
  onOpenSensitiveTerms,
  onReset,
  onOpenQueryHistory,
  onStartTutorial,
  onOpenFeatures,
  queryHistoryCount,
  tutorialLabel,
  context,
  onGitConfigurationChanged,
}: ConfigurationModalProps) {
  const terminal = useTerminalDimensions()
  const navigationRef = useRef<ScrollBoxRenderable | null>(null)
  const sections = configurationSectionsForContext(context)

  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => {
      navigationRef.current?.scrollChildIntoView(`configuration-section-${focusedSection}`)
    }, 0)
    return () => clearTimeout(timeout)
  }, [focusedSection, open])

  if (!open) return null

  const width = Math.max(1, Math.min(96, terminal.width - 2))
  const height = Math.max(1, Math.min(26, terminal.height))
  const narrow = width < 68
  const minimal = width < 52
  const detailWidth = Math.max(12, narrow ? width - 5 : width - 38)
  const currentIndex = Math.max(0, sections.indexOf(focusedSection))
  const previous = sections[(currentIndex - 1 + sections.length) % sections.length]
  const next = sections[(currentIndex + 1) % sections.length]

  return (
    <ModalSurface
      id="configuration-modal"
      width={width}
      height={height}
      zIndex={900}
      borderColor={COLORS.focus}
      backdropOpacity={0.86}
      horizontalPadding={narrow ? 1 : 2}
      dialogFocusable={false}
      onBackdropPress={onClose}
    >
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <box style={{ flexDirection: "row" }}>
          <text content={translateUi("◆ CONFIGURAÇÕES")} style={{ fg: COLORS.focus }} />
          <text
            content={` · ${translateUi(context === "database" ? "BANCO" : context === "git" ? "GIT" : context === "terminal" ? "Terminal" : "GERAL")}`}
            style={{ fg: COLORS.muted }}
          />
        </box>
        <InlineButton label="Fechar" accent={COLORS.focus} onPress={onClose} />
      </box>

      {narrow ? (
        <box
          id="configuration-mobile-navigation"
          style={{
            height: 2,
            flexShrink: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            border: ["bottom"],
            borderColor: COLORS.border,
          }}
        >
          <InlineButton
            id="configuration-category-previous"
            label="[K] ↑"
            accent={COLORS.focus}
            onPress={() => {
              if (previous) onSectionFocus(previous)
            }}
          />
          <InlineButton
            id="configuration-category-open"
            label={`${truncateDisplay(
              translateUi(CONFIGURATION_SECTION_LABELS[focusedSection]),
              Math.max(8, width - (navigationActive ? 24 : 16)),
            )}${navigationActive ? " [Enter]" : ""}`}
            accent={isGitConfigurationSection(focusedSection) ? BRAND_COLOR : COLORS.focus}
            active={navigationActive}
            onPress={() => onSectionChange(focusedSection)}
          />
          <InlineButton
            id="configuration-category-next"
            label="[J] ↓"
            accent={COLORS.focus}
            onPress={() => {
              if (next) onSectionFocus(next)
            }}
          />
        </box>
      ) : null}

      <box style={{ flexGrow: 1, width: "100%", flexDirection: "row" }}>
        {narrow ? null : (
          <ConfigurationNavigation
            sections={sections}
            section={section}
            focusedSection={focusedSection}
            navigationActive={navigationActive}
            settings={settings}
            queryHistoryCount={queryHistoryCount}
            tutorialLabel={tutorialLabel}
            navigationRef={navigationRef}
            onSectionChange={onSectionChange}
            onSectionFocus={onSectionFocus}
          />
        )}
        {isGitConfigurationSection(section) ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: Detail clicks transfer settings keyboard ownership.
          <box
            id="configuration-detail-git"
            onMouseDown={() => {
              if (navigationActive) onSectionChange(section)
            }}
            style={{
              flexGrow: 1,
              height: "100%",
              border: ["left"],
              borderColor: navigationActive ? COLORS.canvas : BRAND_COLOR,
              paddingLeft: narrow ? 0 : 2,
              paddingTop: 1,
            }}
          >
            <ConfigurationDetail
              section={section}
              settings={settings}
              navigationActive={navigationActive}
              notice={notice}
              onClose={onClose}
              onNavigationFocus={onNavigationFocus}
              queryHistoryCount={queryHistoryCount}
              tutorialLabel={tutorialLabel}
              onTerminalAgentCommandsChange={onTerminalAgentCommandsChange}
              onTerminalRemoteProfilesChange={onTerminalRemoteProfilesChange}
              onTerminalRemoteActiveProfileChange={onTerminalRemoteActiveProfileChange}
              onTerminalRemoteProfileTest={onTerminalRemoteProfileTest}
              onTerminalRemoteReadinessCheck={onTerminalRemoteReadinessCheck}
              onConfigureRemoteServer={onConfigureRemoteServer}
              onTerminalMasterKeyChange={onTerminalMasterKeyChange}
              onPaletteChange={onPaletteChange}
              onColorModeChange={onColorModeChange}
              onLayoutChange={onLayoutChange}
              onLanguageChange={onLanguageChange}
              onOpenSensitiveTerms={onOpenSensitiveTerms}
              onOpenQueryHistory={onOpenQueryHistory}
              onOpenFeatures={onOpenFeatures}
              onStartTutorial={onStartTutorial}
              onGitConfigurationChanged={onGitConfigurationChanged}
              compact={narrow}
              contentWidth={detailWidth}
            />
          </box>
        ) : (
          // biome-ignore lint/a11y/noStaticElementInteractions: Detail clicks transfer settings keyboard ownership.
          <scrollbox
            id="configuration-detail"
            scrollY={section !== "remoteConnection"}
            onMouseDown={() => {
              if (navigationActive) onSectionChange(section)
            }}
            style={{
              flexGrow: 1,
              height: "100%",
              border: ["left"],
              borderColor: COLORS.border,
              paddingLeft: narrow ? 0 : 2,
            }}
            verticalScrollbarOptions={{
              trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
            }}
          >
            <box
              id={`configuration-detail-${section}`}
              style={{
                width: "100%",
                ...configurationDetailLayout(section),
                paddingTop: 1,
              }}
            >
              <ConfigurationDetail
                section={section}
                settings={settings}
                navigationActive={navigationActive}
                notice={notice}
                onClose={onClose}
                onNavigationFocus={onNavigationFocus}
                queryHistoryCount={queryHistoryCount}
                tutorialLabel={tutorialLabel}
                onTerminalAgentCommandsChange={onTerminalAgentCommandsChange}
                onTerminalRemoteProfilesChange={onTerminalRemoteProfilesChange}
                onTerminalRemoteActiveProfileChange={onTerminalRemoteActiveProfileChange}
                onTerminalRemoteProfileTest={onTerminalRemoteProfileTest}
                onTerminalRemoteReadinessCheck={onTerminalRemoteReadinessCheck}
                onConfigureRemoteServer={onConfigureRemoteServer}
                onTerminalMasterKeyChange={onTerminalMasterKeyChange}
                onPaletteChange={onPaletteChange}
                onColorModeChange={onColorModeChange}
                onLayoutChange={onLayoutChange}
                onLanguageChange={onLanguageChange}
                onOpenSensitiveTerms={onOpenSensitiveTerms}
                onOpenQueryHistory={onOpenQueryHistory}
                onOpenFeatures={onOpenFeatures}
                onStartTutorial={onStartTutorial}
                onGitConfigurationChanged={onGitConfigurationChanged}
                compact={narrow}
                contentWidth={detailWidth}
              />
            </box>
          </scrollbox>
        )}
      </box>

      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <ShortcutText
          content={translateUi(
            navigationActive
              ? minimal
                ? "[J/K] · [Enter]"
                : "[J/K/↑/↓] foco · [Enter/L] detalhes"
              : isGitConfigurationSection(section)
                ? ""
                : minimal
                  ? "[J/K] · [H/L]"
                  : narrow
                    ? "[J/K/↑/↓] categoria · [H/L/←/→] opção"
                    : "[J/K/↑/↓] categoria · [H/L/←/→] opção",
          )}
          style={{ fg: COLORS.muted }}
        />
        {isGitConfigurationSection(section) ? null : (
          <InlineButton
            label={narrow ? "[R]" : "[R] Padrão"}
            accent={COLORS.focus}
            onPress={onReset}
          />
        )}
      </box>
    </ModalSurface>
  )
}
