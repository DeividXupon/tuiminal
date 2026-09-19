import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef } from "react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { configurationSectionsForContext } from "../model/configuration-context"
import { ConfigurationDetail } from "./ConfigurationDetail"
import { ConfigurationNavigation } from "./ConfigurationNavigation"
import {
  CONFIGURATION_SECTION_LABELS,
  type ConfigurationModalProps,
} from "./configuration-modal-types"

export {
  configurationSectionsForContext,
  normalizeConfigurationSectionForContext,
  type ConfigurationContext,
  type ConfigurationSection,
} from "../model/configuration-context"

export function ConfigurationModal({
  open,
  settings,
  section,
  notice,
  onClose,
  onSectionChange,
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
  onOpenGitConfiguration,
}: ConfigurationModalProps) {
  const terminal = useTerminalDimensions()
  const navigationRef = useRef<ScrollBoxRenderable | null>(null)
  const sections = configurationSectionsForContext(context)

  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => {
      navigationRef.current?.scrollChildIntoView(`configuration-section-${section}`)
    }, 0)
    return () => clearTimeout(timeout)
  }, [open, section])

  if (!open) return null

  const width = Math.max(1, Math.min(96, terminal.width - 2))
  const height = Math.max(1, Math.min(26, terminal.height))
  const narrow = width < 68
  const minimal = width < 52
  const detailWidth = Math.max(12, narrow ? width - 5 : width - 38)
  const currentIndex = Math.max(0, sections.indexOf(section))
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
            content={` · ${translateUi(context === "database" ? "BANCO" : context === "git" ? "GIT" : "GERAL")}`}
            style={{ fg: COLORS.muted }}
          />
        </box>
        <InlineButton
          label={narrow ? "[Esc]" : "[Esc] Fechar"}
          accent={COLORS.focus}
          onPress={onClose}
        />
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
            onPress={() => previous && onSectionChange(previous)}
          />
          <text
            content={truncateDisplay(
              translateUi(CONFIGURATION_SECTION_LABELS[section]),
              Math.max(8, width - 22),
            )}
            style={{ fg: COLORS.focus }}
          />
          <InlineButton
            id="configuration-category-next"
            label="[J] ↓"
            accent={COLORS.focus}
            onPress={() => next && onSectionChange(next)}
          />
        </box>
      ) : null}

      <box style={{ flexGrow: 1, width: "100%", flexDirection: "row" }}>
        {narrow ? null : (
          <ConfigurationNavigation
            sections={sections}
            section={section}
            settings={settings}
            queryHistoryCount={queryHistoryCount}
            tutorialLabel={tutorialLabel}
            navigationRef={navigationRef}
            onSectionChange={onSectionChange}
          />
        )}
        <scrollbox
          id="configuration-detail"
          scrollY
          style={{
            flexGrow: 1,
            height: "100%",
            paddingLeft: narrow ? 0 : 2,
          }}
          verticalScrollbarOptions={{
            trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
          }}
        >
          <box
            id={`configuration-detail-${section}`}
            style={{ width: "100%", flexShrink: 0, paddingTop: 1 }}
          >
            <ConfigurationDetail
              section={section}
              settings={settings}
              notice={notice}
              queryHistoryCount={queryHistoryCount}
              tutorialLabel={tutorialLabel}
              onPaletteChange={onPaletteChange}
              onColorModeChange={onColorModeChange}
              onLayoutChange={onLayoutChange}
              onLanguageChange={onLanguageChange}
              onOpenSensitiveTerms={onOpenSensitiveTerms}
              onOpenQueryHistory={onOpenQueryHistory}
              onOpenFeatures={onOpenFeatures}
              onStartTutorial={onStartTutorial}
              onOpenGitConfiguration={onOpenGitConfiguration}
              compact={narrow}
              contentWidth={detailWidth}
            />
          </box>
        </scrollbox>
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
            minimal
              ? "[J/K] · [H/L]"
              : narrow
                ? "[J/K/↑/↓] categoria · [H/L/←/→] opção"
                : "[J/K/↑/↓] categoria · [H/L/←/→] opção · [Enter] abrir",
          )}
          style={{ fg: COLORS.muted }}
        />
        <InlineButton
          label={narrow ? "[R]" : "[R] Padrão"}
          accent={COLORS.focus}
          onPress={onReset}
        />
      </box>
    </ModalSurface>
  )
}
