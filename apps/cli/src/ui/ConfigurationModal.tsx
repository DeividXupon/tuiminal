import { TutorialSetting } from "./TutorialSetting"
import { FeatureSettings } from "../features/FeatureSettings"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef } from "react"
import {
  LANGUAGE_OPTIONS,
  translateUi,
  truncateDisplay,
  type LanguageId,
} from "@xupon/tuiminal-core/i18n/index"
import {
  COLORS,
  type ColorMode,
  type LayoutMode,
  type PaletteId,
  type UiSettings,
} from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { ConfigurationContext, ConfigurationSection } from "../model/configuration-context"
import { GitConfigurationGroup } from "./GitConfigurationGroup"
import { ColorModeConfigurationGroup } from "./ColorModeConfigurationGroup"
import { PaletteConfigurationGroup } from "./PaletteConfigurationGroup"

export {
  configurationSectionsForContext,
  normalizeConfigurationSectionForContext,
  type ConfigurationContext,
  type ConfigurationSection,
} from "../model/configuration-context"

type ConfigurationModalProps = {
  open: boolean
  settings: UiSettings
  section: ConfigurationSection
  notice: string
  onClose: () => void
  onSectionChange: (section: ConfigurationSection) => void
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
  onOpenGitConfiguration: () => void
}

function ConfigurationDivider({ label }: { label: string }) {
  return (
    <text
      content={`── ${translateUi(label)} ${"─".repeat(64)}`}
      style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
    />
  )
}

function LanguageChoice({
  nativeName,
  shortName,
  selected,
  compact = false,
  onPress,
}: {
  id: LanguageId
  nativeName: string
  shortName: string
  selected: boolean
  compact?: boolean
  onPress: () => void
}) {
  return (
    <Button onPress={onPress} width="50%" height={1} flexShrink={0}>
      {(state) => (
        <box
          style={{
            width: "100%",
            height: 1,
            flexDirection: "row",
            justifyContent: "space-between",
            backgroundColor: selected || state.focused ? COLORS.panelRaised : COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={`${selected ? "◆" : "◇"} ${nativeName}`}
            style={{ fg: selected ? COLORS.focus : COLORS.text }}
          />
          {compact ? null : <text content={shortName} style={{ fg: COLORS.muted }} />}
        </box>
      )}
    </Button>
  )
}

const LANGUAGE_ROWS = [
  { id: "latin-primary", options: LANGUAGE_OPTIONS.slice(0, 2) },
  { id: "latin-cjk", options: LANGUAGE_OPTIONS.slice(2, 4) },
  { id: "cjk", options: LANGUAGE_OPTIONS.slice(4, 6) },
] as const

function LayoutChoice({
  mode,
  selected,
  compact = false,
  onPress,
}: {
  mode: LayoutMode
  selected: boolean
  compact?: boolean
  onPress: () => void
}) {
  const framed = mode === "framed"
  return (
    <Button onPress={onPress} width="50%" height={compact ? 1 : 4} flexShrink={0}>
      {(state) => (
        <box
          style={{
            width: "100%",
            height: compact ? 1 : 4,
            flexShrink: 0,
            ...(compact
              ? { border: false as const }
              : framed
                ? {
                    border: true as const,
                    borderStyle: "rounded" as const,
                    borderColor: selected ? COLORS.focus : COLORS.border,
                  }
                : { border: false as const }),
            backgroundColor: framed ? COLORS.panel : COLORS.panelAlt,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={`${selected ? "◆" : "◇"} ${framed ? "MOLDURADO" : "COMPACTO"}`}
            style={{ fg: selected || state.focused ? COLORS.focus : COLORS.text }}
          />
          {compact ? null : (
            <text
              content={framed ? "gaps e bordas arredondadas" : "sem gaps · fundos alternados"}
              style={{ fg: COLORS.muted }}
            />
          )}
        </box>
      )}
    </Button>
  )
}

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
  const contentRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => {
      contentRef.current?.scrollChildIntoView(`configuration-group-${section}`)
    }, 0)
    return () => clearTimeout(timeout)
  }, [open, section])

  if (!open) return null

  const width = Math.max(1, Math.min(86, terminal.width - 2))
  const height = Math.max(1, Math.min(24, terminal.height))
  const compact = width < 68 || height < 22

  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={900}
        backgroundColor="#030509"
        opacity={0.86}
      />
      <box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 901,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <box
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.focus,
            backgroundColor: COLORS.canvas,
            paddingLeft: compact ? 1 : 2,
            paddingRight: compact ? 1 : 2,
          }}
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
            <text content={translateUi("◆ CONFIGURAÇÕES")} style={{ fg: COLORS.focus }} />
            <InlineButton
              label={compact ? "[Esc]" : "[Esc] Fechar"}
              accent={COLORS.focus}
              onPress={onClose}
            />
          </box>

          <scrollbox
            ref={contentRef}
            scrollY
            style={{ flexGrow: 1, width: "100%" }}
            verticalScrollbarOptions={{
              trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
            }}
          >
            <GitConfigurationGroup
              visible={context === "git"}
              selected={section === "git"}
              compact={compact}
              onSelect={() => onSectionChange("git")}
              onOpen={onOpenGitConfiguration}
            />

            {context === "database" ? (
              <>
                <ConfigurationDivider label="CONFIGURAÇÕES DO BANCO" />

                <box
                  id="configuration-group-sensitive"
                  style={{ height: compact ? 2 : 3, flexShrink: 0 }}
                >
                  <box
                    id="configuration-section-sensitive"
                    style={{
                      height: 1,
                      flexShrink: 0,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      backgroundColor: section === "sensitive" ? COLORS.panelRaised : COLORS.canvas,
                    }}
                  >
                    <text
                      content={`${section === "sensitive" ? "◆" : "◇"} ${translateUi("DADOS SENSÍVEIS")}`}
                      style={{ fg: COLORS.text }}
                    />
                    <ShortcutText
                      content={translateUi("[Enter] editar")}
                      style={{ fg: COLORS.muted }}
                    />
                  </box>

                  <Button
                    id="configuration-open-sensitive-terms"
                    onPress={() => {
                      onSectionChange("sensitive")
                      onOpenSensitiveTerms()
                    }}
                    height={compact ? 1 : 2}
                    flexShrink={0}
                  >
                    {(state) => (
                      <box
                        style={{
                          height: compact ? 1 : 2,
                          flexShrink: 0,
                          paddingLeft: 1,
                          paddingRight: 1,
                          backgroundColor:
                            section === "sensitive" || state.focused
                              ? COLORS.panelRaised
                              : COLORS.panel,
                        }}
                      >
                        <text
                          content={`◇ ${translateUi(`${settings.sensitiveTerms.length} termos`)} · ${truncateDisplay(settings.sensitiveTerms.join(", ") || translateUi("desativado"), Math.max(12, width - 24))}`}
                          style={{ fg: section === "sensitive" ? COLORS.warning : COLORS.text }}
                        />
                        {compact ? null : (
                          <text
                            content={translateUi(
                              "Escolha quais fragmentos de nomes de colunas serão mascarados.",
                            )}
                            style={{ fg: COLORS.muted }}
                          />
                        )}
                      </box>
                    )}
                  </Button>
                </box>

                <box style={{ height: 1, flexShrink: 0 }} />

                <box
                  id="configuration-group-history"
                  style={{ height: compact ? 2 : 3, flexShrink: 0 }}
                >
                  <box
                    id="configuration-section-history"
                    style={{
                      height: 1,
                      flexShrink: 0,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      backgroundColor: section === "history" ? COLORS.panelRaised : COLORS.canvas,
                    }}
                  >
                    <text
                      content={`${section === "history" ? "◆" : "◇"} ${translateUi("HISTÓRICO SQL")}`}
                      style={{ fg: COLORS.text }}
                    />
                    <ShortcutText
                      content={translateUi("[Enter] abrir")}
                      style={{ fg: COLORS.muted }}
                    />
                  </box>

                  <Button
                    id="configuration-open-query-history"
                    onPress={() => {
                      onSectionChange("history")
                      onOpenQueryHistory()
                    }}
                    height={compact ? 1 : 2}
                    flexShrink={0}
                  >
                    {(state) => (
                      <box
                        style={{
                          height: compact ? 1 : 2,
                          flexShrink: 0,
                          paddingLeft: 1,
                          paddingRight: 1,
                          backgroundColor:
                            section === "history" || state.focused
                              ? COLORS.panelRaised
                              : COLORS.panel,
                        }}
                      >
                        <text
                          content={`◷ ${translateUi("Consultas executadas")} · ${queryHistoryCount}`}
                          style={{ fg: section === "history" ? COLORS.database : COLORS.text }}
                        />
                        {compact ? null : (
                          <text
                            content={translateUi("100 leituras recentes · alterações por 6 meses.")}
                            style={{ fg: COLORS.muted }}
                          />
                        )}
                      </box>
                    )}
                  </Button>
                </box>

                <box style={{ height: 1, flexShrink: 0 }} />
              </>
            ) : null}

            <ConfigurationDivider label="CONFIGURAÇÕES GLOBAIS" />

            {compact ? null : (
              <text
                content="As alterações são aplicadas e salvas automaticamente."
                style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
              />
            )}

            <ColorModeConfigurationGroup
              selected={section === "colorMode"}
              mode={settings.colorMode}
              palette={settings.palette}
              compact={compact}
              onSelect={() => onSectionChange("colorMode")}
              onChange={onColorModeChange}
            />
            <box style={{ height: 1, flexShrink: 0 }} />
            <PaletteConfigurationGroup
              selected={section === "palette"}
              palette={settings.palette}
              colorMode={settings.colorMode}
              compact={compact}
              onSelect={() => onSectionChange("palette")}
              onChange={onPaletteChange}
            />
            <box style={{ height: 1, flexShrink: 0 }} />

            <box id="configuration-group-layout" style={{ height: compact ? 2 : 5, flexShrink: 0 }}>
              <box
                id="configuration-section-layout"
                style={{
                  height: 1,
                  flexShrink: 0,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  backgroundColor: section === "layout" ? COLORS.panelRaised : COLORS.canvas,
                }}
              >
                <text
                  content={`${section === "layout" ? "◆" : "◇"} ${translateUi("LAYOUT")}`}
                  style={{ fg: COLORS.text }}
                />
                <ShortcutText content="[↑/↓] seção" style={{ fg: COLORS.muted }} />
              </box>

              <box style={{ height: compact ? 1 : 4, flexShrink: 0, flexDirection: "row" }}>
                <LayoutChoice
                  mode="framed"
                  compact={compact}
                  selected={settings.layout === "framed"}
                  onPress={() => {
                    onSectionChange("layout")
                    onLayoutChange("framed")
                  }}
                />
                <LayoutChoice
                  mode="compact"
                  compact={compact}
                  selected={settings.layout === "compact"}
                  onPress={() => {
                    onSectionChange("layout")
                    onLayoutChange("compact")
                  }}
                />
              </box>
            </box>

            <box style={{ height: 1, flexShrink: 0 }} />

            <box id="configuration-group-language" style={{ height: 4, flexShrink: 0 }}>
              <box
                id="configuration-section-language"
                style={{
                  height: 1,
                  flexShrink: 0,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  backgroundColor: section === "language" ? COLORS.panelRaised : COLORS.canvas,
                }}
              >
                <text
                  content={`${section === "language" ? "◆" : "◇"} ${translateUi("IDIOMA")}`}
                  style={{ fg: COLORS.text }}
                />
                <ShortcutText content="[←/→] alterar" style={{ fg: COLORS.muted }} />
              </box>

              {LANGUAGE_ROWS.map((row) => (
                <box key={row.id} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                  {row.options.map((language) => (
                    <LanguageChoice
                      key={language.id}
                      {...language}
                      compact={compact}
                      selected={settings.language === language.id}
                      onPress={() => {
                        onSectionChange("language")
                        onLanguageChange(language.id)
                      }}
                    />
                  ))}
                </box>
              ))}
            </box>

            <box style={{ height: 1, flexShrink: 0 }} />

            <TutorialSetting
              visible={context !== "installer"}
              active={section === "tutorial"}
              compact={compact}
              tutorialLabel={tutorialLabel}
              onStartTutorial={() => {
                onSectionChange("tutorial")
                onStartTutorial()
              }}
            />
            <FeatureSettings
              active={section === "features"}
              onOpen={() => {
                onSectionChange("features")
                onOpenFeatures()
              }}
            />
          </scrollbox>

          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <ShortcutText
              content={
                notice ||
                (compact
                  ? "[↑↓] seção · [←→] opção"
                  : "[↑↓] seção · [←→] opção · [Enter] selecionar")
              }
              style={{ fg: notice ? COLORS.warning : COLORS.muted }}
            />
            <InlineButton
              label={compact ? "[R]" : "[R] Padrão"}
              accent={COLORS.focus}
              onPress={onReset}
            />
          </box>
        </box>
      </box>
    </>
  )
}
