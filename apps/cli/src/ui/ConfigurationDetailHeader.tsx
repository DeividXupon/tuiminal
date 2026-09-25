import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { ConfigurationSection } from "../model/configuration-context"
import { CONFIGURATION_SECTION_LABELS } from "./configuration-modal-types"

export function ConfigurationDetailHeader({
  section,
  notice,
  action = false,
  hint,
  compact = false,
  contentWidth,
}: {
  section: ConfigurationSection
  notice: string
  action?: boolean
  hint?: string
  compact?: boolean
  contentWidth: number
}) {
  const status = translateUi(notice || "SALVAMENTO AUTOMÁTICO")
  return (
    <box style={{ height: 3, flexShrink: 0 }}>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={translateUi(CONFIGURATION_SECTION_LABELS[section])}
          style={{ fg: COLORS.focus }}
        />
        {compact && contentWidth < 40 && !notice ? null : (
          <text
            content={truncateDisplay(status, Math.max(10, contentWidth - 24))}
            style={{ fg: notice ? COLORS.success : COLORS.muted }}
          />
        )}
      </box>
      <ShortcutText
        content={translateUi(hint ?? (action ? "[Enter] abrir" : "[H/L/←/→] alterar"))}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <text
        content={"─".repeat(contentWidth)}
        style={{ height: 1, flexShrink: 0, fg: COLORS.border }}
      />
    </box>
  )
}
