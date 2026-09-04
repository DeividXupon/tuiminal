import { Tabs } from "@tuiparts/react/tabs"
import type { ToolId as AppTab } from "../tool-catalog"
import { COLORS } from "../../core/settings/theme"
import { translateUi } from "../../shared/i18n/index"
import { ShortcutText } from "../../shared/ui/ShortcutText"
import { BRAND_COLOR } from "../../shared/ui/brand"

export function NavigationTab({
  value,
  label,
  shortcut,
  minimal = false,
}: {
  value: AppTab
  label: string
  shortcut: string
  minimal?: boolean
}) {
  const symbol = shortcut.slice(1, -1)
  return (
    <Tabs.Tab value={value} flexShrink={0}>
      {(state) => (
        <ShortcutText
          content={
            minimal
              ? ` ${state.selected ? "◆" : "◇"}${symbol} `
              : ` ${state.selected ? "◆" : "◇"} ${translateUi(label)} ${shortcut} `
          }
          style={{
            fg: minimal ? BRAND_COLOR : state.selected ? COLORS.text : COLORS.muted,
            bg: state.selected ? COLORS.panelRaised : COLORS.canvas,
          }}
        />
      )}
    </Tabs.Tab>
  )
}
