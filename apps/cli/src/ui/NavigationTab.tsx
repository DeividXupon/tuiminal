import { Tabs } from "@tuiparts/react/tabs"
import type { ToolId as AppTab } from "../tool-catalog"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"

export function NavigationTab({
  value,
  label,
  shortcut,
  minimal = false,
  shortcutColor,
}: {
  value: AppTab
  label: string
  shortcut: string
  minimal?: boolean
  shortcutColor?: string | undefined
}) {
  return (
    <Tabs.Tab value={value} flexShrink={0}>
      {(state) => (
        <ShortcutText
          shortcutColor={shortcutColor}
          content={
            minimal
              ? ` ${state.selected ? "◆" : "◇"} ${shortcut} `
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
