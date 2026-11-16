import { globalShortcutCaption } from "../global-shortcuts"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, LAYOUT, separatorBorder } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { TOOL_LABELS as TAB_LABELS, type ToolId } from "../tool-catalog"

export function IsolatedWorkspaceHeader({
  tool,
  compactNavigation,
  terminalMasterKeyActive,
  openSettings,
  onQuit,
}: {
  tool: ToolId
  compactNavigation: boolean
  terminalMasterKeyActive: boolean
  openSettings: () => void
  onQuit: () => void
}) {
  const compact = tool === "terminal" || LAYOUT.compact
  const headerHeight = compact ? 1 : 2
  const shortcutsMuted = tool === "terminal" && !terminalMasterKeyActive
  return (
    <box
      id="tutorial-app-header"
      style={{
        height: headerHeight,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        ...(tool === "terminal" ? { border: false } : separatorBorder()),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text content="◆ TUIMINAL" style={{ fg: BRAND_COLOR }} />
      <text
        content={`◆ ${translateUi(TAB_LABELS[tool])} · ${translateUi("MODO ISOLADO")}`}
        style={{ fg: COLORS.muted }}
      />
      <box style={{ flexDirection: "row", alignItems: "center" }}>
        <InlineButton
          compact={compact}
          id="tutorial-settings-button"
          label={globalShortcutCaption("settings", "Config", compactNavigation)}
          accent={COLORS.focus}
          shortcutsMuted={shortcutsMuted}
          onPress={openSettings}
        />
        <InlineButton
          compact={compact}
          id="app-exit-button"
          label={globalShortcutCaption("quit", translateUi("Sair"), compactNavigation)}
          accent={COLORS.focus}
          shortcutsMuted={shortcutsMuted}
          onPress={onQuit}
        />
      </box>
    </box>
  )
}
