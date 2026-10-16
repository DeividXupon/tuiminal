import { Button } from "@tuiparts/react/button"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { RunnerProject } from "../model/types"
import type { RunnerVisualStatus } from "../model/status"
import { runnerStatusColor } from "../rendering/status"

export function RunnerProjectTab({
  project,
  index,
  shortcut,
  selected,
  status,
  width,
  closeLabel,
  closeWidth,
  onSelect,
  onClose,
}: {
  project: RunnerProject
  index: number
  shortcut: string
  selected: boolean
  status: RunnerVisualStatus
  width: number
  closeLabel: string
  closeWidth: number
  onSelect: () => void
  onClose: () => void
}) {
  const labelWidth = Math.max(5, width - closeWidth)
  const nameWidth = Math.max(0, labelWidth - 4)
  const nameColor =
    status === "idle" ? (selected ? COLORS.text : COLORS.muted) : runnerStatusColor(status)
  return (
    <box style={{ width, flexShrink: 0, flexDirection: "row" }}>
      <Button
        id={`runner-project-tab-${index}`}
        width={labelWidth}
        height={1}
        flexShrink={0}
        onPress={onSelect}
      >
        {({ focused, pressed }) => (
          <box
            style={{
              width: "100%",
              height: 1,
              flexDirection: "row",
              gap: 1,
              backgroundColor: selected || focused || pressed ? COLORS.panelRaised : COLORS.panel,
            }}
          >
            <ShortcutText content={`[${shortcut}]`} style={{ flexShrink: 0 }} />
            {nameWidth ? (
              <text
                id={`runner-project-status-${index}`}
                content={truncateDisplay(project.name, nameWidth)}
                style={{ fg: nameColor, flexShrink: 0 }}
              />
            ) : null}
          </box>
        )}
      </Button>
      <InlineButton label={closeLabel} accent={COLORS.danger} onPress={onClose} />
    </box>
  )
}
