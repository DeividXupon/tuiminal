import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { TerminalInlineButton } from "./TerminalShortcut"

export function syncActionsStacked(width: number, label: string) {
  return displayWidth(translateUi(label)) + displayWidth(translateUi("[Esc] Cancelar")) + 5 > width
}

export function RemoteProjectSyncActions({
  id,
  confirmId,
  cancelId,
  label,
  width,
  warning,
  inactive = false,
  onConfirm,
  onClose,
}: {
  id: string
  confirmId: string
  cancelId: string
  label: string
  width: number
  warning: boolean
  inactive?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const stacked = syncActionsStacked(width, label)
  return (
    <box
      id={id}
      style={{
        height: stacked ? 2 : 1,
        flexShrink: 0,
        flexDirection: stacked ? "column" : "row",
        justifyContent: "space-between",
      }}
    >
      <TerminalInlineButton
        id={cancelId}
        compact
        label="[Esc] Cancelar"
        disabled={inactive}
        onPress={onClose}
      />
      <box style={{ height: 1, flexDirection: "row", justifyContent: "flex-end" }}>
        <TerminalInlineButton
          id={confirmId}
          compact
          label={label}
          disabled={inactive}
          accent={warning ? COLORS.warning : COLORS.terminal}
          onPress={onConfirm}
        />
      </box>
    </box>
  )
}
