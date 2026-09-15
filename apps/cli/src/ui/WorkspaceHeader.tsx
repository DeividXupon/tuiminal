import { Tabs } from "@tuiparts/react/tabs"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { COLORS, LAYOUT, separatorBorder } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { NavigationTab } from "./NavigationTab"
import type { ToolId } from "../tool-catalog"
export function WorkspaceHeader({
  installed,
  compactNavigation,
  minimalNavigation,
  openSettings,
  onQuit,
}: {
  installed: readonly ToolId[]
  compactNavigation: boolean
  minimalNavigation: boolean
  openSettings: () => void
  onQuit: () => void
}) {
  return (
    <box
      id="tutorial-app-header"
      style={{
        height: LAYOUT.compact ? 1 : 2,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        ...separatorBorder(),
        backgroundColor: LAYOUT.compact ? COLORS.panel : COLORS.canvas,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text
        content={minimalNavigation ? "◆ T" : "◆ TUIMINAL"}
        style={{ flexShrink: 0, fg: BRAND_COLOR }}
      />
      <Tabs.List flexDirection="row" gap={compactNavigation ? 0 : 1}>
        {installed.includes("database") ? (
          <NavigationTab
            minimal={minimalNavigation}
            value="database"
            label={compactNavigation ? "DB" : translateUi("Banco")}
            shortcut="[Alt+1]"
          />
        ) : null}
        {installed.includes("git") ? (
          <NavigationTab
            minimal={minimalNavigation}
            value="git"
            label={compactNavigation ? "G" : "Git"}
            shortcut="[Alt+2]"
          />
        ) : null}
        {installed.includes("runner") ? (
          <NavigationTab
            minimal={minimalNavigation}
            value="runner"
            label={compactNavigation ? "Run" : "Runner"}
            shortcut="[Alt+3]"
          />
        ) : null}
        {installed.includes("http") ? (
          <NavigationTab minimal={minimalNavigation} value="http" label="HTTP" shortcut="[Alt+4]" />
        ) : null}
        {installed.includes("terminal") ? (
          <NavigationTab
            minimal={minimalNavigation}
            value="terminal"
            label={compactNavigation ? "FT" : translateUi("Terminal")}
            shortcut="[Alt+5]"
          />
        ) : null}
      </Tabs.List>
      <box style={{ flexDirection: "row", alignItems: "center" }}>
        {compactNavigation ? null : (
          <ShortcutText
            content={`[Alt+1–5] ${translateUi("MUDAR")}  `}
            style={{ fg: COLORS.muted }}
          />
        )}
        <InlineButton
          id="tutorial-settings-button"
          label={compactNavigation ? "[,]" : "[,] Config"}
          accent={COLORS.focus}
          onPress={openSettings}
        />
        <InlineButton
          label={compactNavigation ? "[Q]" : "[Q] Sair"}
          accent={COLORS.focus}
          onPress={onQuit}
        />
      </box>
    </box>
  )
}
