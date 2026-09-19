import type { ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import type { RefObject } from "react"
import { LANGUAGE_OPTIONS, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, PALETTE_OPTIONS, type UiSettings } from "@xupon/tuiminal-core/settings/theme"
import type { ConfigurationSection } from "../model/configuration-context"
import { CONFIGURATION_SECTION_LABELS } from "./configuration-modal-types"

type NavigationGroup = "context" | "appearance" | "general"

const GROUP_LABELS: Record<NavigationGroup, string> = {
  context: "CONTEXTO",
  appearance: "APARÊNCIA",
  general: "GERAL",
}

function navigationGroup(section: ConfigurationSection): NavigationGroup {
  if (section === "git" || section === "sensitive" || section === "history") return "context"
  if (section === "colorMode" || section === "palette" || section === "layout") return "appearance"
  return "general"
}

function sectionSummary(
  section: ConfigurationSection,
  settings: UiSettings,
  queryHistoryCount: number,
  tutorialLabel: string,
) {
  if (section === "colorMode") return translateUi(settings.colorMode === "dark" ? "DARK" : "LIGHT")
  if (section === "palette")
    return (
      PALETTE_OPTIONS.find((option) => option.id === settings.palette)?.label ?? settings.palette
    )
  if (section === "layout")
    return translateUi(settings.layout === "framed" ? "MOLDURADO" : "COMPACTO")
  if (section === "language")
    return LANGUAGE_OPTIONS.find((option) => option.id === settings.language)?.nativeName ?? ""
  if (section === "sensitive") return translateUi(`${settings.sensitiveTerms.length} termos`)
  if (section === "history") return String(queryHistoryCount)
  if (section === "tutorial") return translateUi(tutorialLabel)
  return ""
}

function NavigationRow({
  section,
  active,
  summary,
  onPress,
}: {
  section: ConfigurationSection
  active: boolean
  summary: string
  onPress: () => void
}) {
  return (
    <Button
      id={`configuration-section-${section}`}
      onPress={onPress}
      width="100%"
      height={1}
      flexShrink={0}
    >
      {(state) => (
        <box
          style={{
            width: "100%",
            height: 1,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: active || state.focused ? COLORS.panelRaised : COLORS.panel,
            paddingRight: 1,
          }}
        >
          <text content={active ? "▌" : " "} style={{ width: 2, fg: COLORS.focus }} />
          <text
            content={truncateDisplay(translateUi(CONFIGURATION_SECTION_LABELS[section]), 14)}
            style={{ flexGrow: 1, fg: active ? COLORS.focus : COLORS.text }}
          />
          {summary ? (
            <text content={truncateDisplay(summary, 10)} style={{ fg: COLORS.muted }} />
          ) : null}
        </box>
      )}
    </Button>
  )
}

export function ConfigurationNavigation({
  sections,
  section,
  settings,
  queryHistoryCount,
  tutorialLabel,
  navigationRef,
  onSectionChange,
}: {
  sections: readonly ConfigurationSection[]
  section: ConfigurationSection
  settings: UiSettings
  queryHistoryCount: number
  tutorialLabel: string
  navigationRef: RefObject<ScrollBoxRenderable | null>
  onSectionChange: (section: ConfigurationSection) => void
}) {
  const groups = (["context", "appearance", "general"] as const)
    .map((group) => ({
      group,
      sections: sections.filter((candidate) => navigationGroup(candidate) === group),
    }))
    .filter(({ sections: grouped }) => grouped.length > 0)

  return (
    <box
      id="configuration-navigation"
      style={{
        width: 29,
        height: "100%",
        flexShrink: 0,
        border: ["right"],
        borderColor: COLORS.border,
        paddingRight: 1,
      }}
    >
      <scrollbox
        ref={navigationRef}
        scrollY
        style={{ width: "100%", flexGrow: 1 }}
        verticalScrollbarOptions={{
          trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
        }}
      >
        {groups.map(({ group, sections: grouped }, groupIndex) => (
          <box
            key={group}
            style={{
              height: grouped.length + 1 + (groupIndex === 0 ? 0 : 1),
              flexShrink: 0,
              ...(groupIndex === 0 ? {} : { paddingTop: 1 }),
            }}
          >
            <text
              content={translateUi(GROUP_LABELS[group])}
              style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
            />
            {grouped.map((candidate) => (
              <NavigationRow
                key={candidate}
                section={candidate}
                active={candidate === section}
                summary={sectionSummary(candidate, settings, queryHistoryCount, tutorialLabel)}
                onPress={() => onSectionChange(candidate)}
              />
            ))}
          </box>
        ))}
      </scrollbox>
    </box>
  )
}
