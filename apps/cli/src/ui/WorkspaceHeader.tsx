import { globalShortcutCaption } from "../global-shortcuts"
import { shortcutLabel } from "@xupon/tuiminal-core/keyboard/bindings"
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
  shortcutsMuted,
}: {
  installed: readonly ToolId[]
  compact: boolean
  minimal: boolean
  shortcutsMuted?: boolean | undefined
}) {
  const tabs = [
    {
      value: "database",
      label: translateUi("Banco"),
      compactLabel: "DB",
      shortcut: shortcutLabel("global", "workspace", "database"),
    },
    {
      value: "git",
      label: "Git",
      compactLabel: "G",
      shortcut: shortcutLabel("global", "workspace", "git"),
    },
    {
      value: "runner",
      label: "Runner",
      compactLabel: "Run",
      shortcut: shortcutLabel("global", "workspace", "runner"),
    },
    {
      value: "http",
      label: "HTTP",
      compactLabel: "HTTP",
      shortcut: shortcutLabel("global", "workspace", "http"),
    },
    {
      value: "terminal",
      label: translateUi("Terminal"),
      compactLabel: "FT",
      shortcut: shortcutLabel("global", "workspace", "terminal"),
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
            shortcutsMuted={shortcutsMuted}
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
  const shortcutsMuted = terminalCompact && !terminalMasterKeyActive
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
        shortcutsMuted={shortcutsMuted}
      />
      <box style={{ flexDirection: "row", alignItems: "center" }}>
        <InlineButton
          compact={terminalCompact || LAYOUT.compact}
          id="tutorial-settings-button"
          label={globalShortcutCaption("settings", "Config", compactNavigation)}
          accent={COLORS.focus}
          shortcutsMuted={shortcutsMuted}
          onPress={openSettings}
        />
        <InlineButton
          compact={terminalCompact || LAYOUT.compact}
          label={globalShortcutCaption("quit", translateUi("Sair"), compactNavigation)}
          accent={COLORS.focus}
          shortcutsMuted={shortcutsMuted}
          onPress={onQuit}
        />
      </box>
    </box>
  )
}
