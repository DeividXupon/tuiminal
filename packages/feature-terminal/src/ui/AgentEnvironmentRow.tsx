import { Button } from "@tuiparts/react/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { AgentProjectTarget } from "../model/agent-project"

export function AgentEnvironmentRow({
  target,
  index,
  selected,
  current,
  compact,
  width,
  disabled,
  onPress,
}: {
  target: AgentProjectTarget
  index: number
  selected: boolean
  current: boolean
  compact: boolean
  width: number
  disabled: boolean
  onPress: () => void
}) {
  const local = target.kind === "local"
  const accent = local ? COLORS.success : COLORS.database
  const title = local ? translateUi("Local") : target.profile.name
  const description = local ? translateUi("Neste computador") : `ssh ${target.profile.host}`
  const badge = current ? translateUi("Em uso") : ""
  const background = selected ? COLORS.diffModifiedBg : COLORS.panel
  return (
    <Button
      id={`terminal-dialog-project-environment-${index}`}
      height={compact ? 1 : 2}
      flexShrink={0}
      disabled={disabled}
      onPress={onPress}
    >
      <box
        style={{
          width: "100%",
          height: compact ? 1 : 2,
          border: ["left"],
          borderColor: selected ? accent : COLORS.border,
          backgroundColor: background,
        }}
      >
        <box style={{ height: 1, flexDirection: "row" }}>
          <text content={selected ? " › " : "   "} style={{ width: 3, fg: accent }} />
          <text
            id={`terminal-dialog-project-environment-name-${index}`}
            content={truncateDisplay(title, Math.max(1, width - displayWidth(badge) - 6))}
            wrapMode="none"
            style={{ flexGrow: 1, fg: disabled ? COLORS.muted : COLORS.text }}
          />
          <text content={` ${badge} `} style={{ fg: accent }} />
        </box>
        {!compact && (
          <text
            content={`   ${truncateDisplay(description, Math.max(1, width - 5))}`}
            wrapMode="none"
            style={{ height: 1, fg: COLORS.muted }}
          />
        )}
      </box>
    </Button>
  )
}
