import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { TerminalInlineButton } from "./TerminalShortcut"

export function RemoteProjectSyncAutomaticControl({
  automatic,
  onToggle,
  compact = false,
  inactive = false,
}: {
  automatic: boolean
  onToggle: () => void
  compact?: boolean
  inactive?: boolean
}) {
  return (
    <box
      id="terminal-project-sync-automatic-control"
      style={{
        flexShrink: 0,
      }}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <TerminalInlineButton
          id="terminal-project-sync-automatic"
          compact
          active={automatic}
          disabled={inactive}
          label={automatic ? "[A] Sincronização automática ON" : "[A] Sincronização automática OFF"}
          onPress={onToggle}
        />
      </box>
      {!compact && <RemoteProjectSyncAutomaticHint automatic={automatic} />}
    </box>
  )
}

export function RemoteProjectSyncAutomaticHint({ automatic }: { automatic: boolean }) {
  return (
    <text
      content={translateUi(
        automatic
          ? "O remoto substituirá alterações locais após cada resposta concluída."
          : "Sincroniza após cada resposta concluída.",
      )}
      wrapMode="word"
      style={{ flexShrink: 0, fg: COLORS.muted }}
    />
  )
}
