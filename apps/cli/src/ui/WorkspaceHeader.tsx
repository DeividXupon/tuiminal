import { Tabs } from "@tuiparts/react/tabs"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, LAYOUT, separatorBorder } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { ToolId } from "../tool-catalog"
import { NavigationTab } from "./NavigationTab"

function WorkspaceTabs({
  installed,
  compact,
  minimal,
  shortcutColor,
}: {
  installed: readonly ToolId[]
  compact: boolean
  minimal: boolean
  shortcutColor?: string | undefined
}) {
  const tabs = [
    { value: "database", label: translateUi("Banco"), compactLabel: "DB", shortcut: "[Alt+1]" },
    { value: "git", label: "Git", compactLabel: "G", shortcut: "[Alt+2]" },
    { value: "runner", label: "Runner", compactLabel: "Run", shortcut: "[Alt+3]" },
    { value: "http", label: "HTTP", compactLabel: "HTTP", shortcut: "[Alt+4]" },
    {
      value: "terminal",
      label: translateUi("Terminal"),
      compactLabel: "FT",
      shortcut: "[Alt+5]",
    },
  ] satisfies Array<{ value: ToolId; label: string; compactLabel: string; shortcut: string }>
  return (
    <Tabs.List flexDirection="row" gap={compact ? 0 : 1}>
      {tabs
        .filter(({ value }) => installed.includes(value))
        .map(({ value, label, compactLabel, shortcut }) => (
          <NavigationTab
            key={value}
            minimal={minimal}
            value={value}
            label={compact ? compactLabel : label}
            shortcut={shortcut}
            shortcutColor={shortcutColor}
          />
        ))}
    </Tabs.List>
  )
}

export function WorkspaceHeader({
  installed,
  terminalCompact = false,
  compactNavigation,
  minimalNavigation,
  terminalMasterKeyActive = false,
  openSettings,
  onQuit,
}: {
  terminalCompact?: boolean
  installed: readonly ToolId[]
  compactNavigation: boolean
  minimalNavigation: boolean
  terminalMasterKeyActive?: boolean
  openSettings: () => void
  onQuit: () => void
}) {
  const shortcutColor = terminalCompact && !terminalMasterKeyActive ? COLORS.muted : undefined
  return (
    <box
      id="tutorial-app-header"
      style={{
        height: terminalCompact || LAYOUT.compact ? 1 : 2,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        ...(terminalCompact ? { border: false } : separatorBorder()),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text
        content={minimalNavigation ? "◆ T" : "◆ TUIMINAL"}
        style={{ flexShrink: 0, fg: BRAND_COLOR }}
      />
      <WorkspaceTabs
        installed={installed}
        compact={compactNavigation}
        minimal={minimalNavigation}
        shortcutColor={shortcutColor}
      />
      <box style={{ flexDirection: "row", alignItems: "center" }}>
        <InlineButton
          compact={terminalCompact || LAYOUT.compact}
          id="tutorial-settings-button"
          label={compactNavigation ? "[,]" : "[,] Config"}
          accent={COLORS.focus}
          shortcutColor={shortcutColor}
          onPress={openSettings}
        />
        <InlineButton
          compact={terminalCompact || LAYOUT.compact}
          label={compactNavigation ? "[Q]" : "[Q] Sair"}
          accent={COLORS.focus}
          shortcutColor={shortcutColor}
          onPress={onQuit}
        />
      </box>
    </box>
  )
}
