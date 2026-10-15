import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { TerminalInlineButton } from "./TerminalShortcut"

export function RemoteProjectSyncAutomaticControl({
  automatic,
  onToggle,
}: {
  automatic: boolean
  onToggle: () => void
}) {
  return (
    <box
      id="terminal-project-sync-automatic-control"
      style={{
        height: 3,
        flexShrink: 0,
      }}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <TerminalInlineButton
          id="terminal-project-sync-automatic"
          compact
          active={automatic}
          label={automatic ? "[A] Sincronização automática ON" : "[A] Sincronização automática OFF"}
          onPress={onToggle}
        />
      </box>
      <text
        content={translateUi(
          automatic
            ? "O remoto substituirá alterações locais após cada resposta concluída."
            : "Sincroniza após cada resposta concluída.",
        )}
        wrapMode="word"
        style={{ height: 2, flexShrink: 0, fg: COLORS.muted }}
      />
    </box>
  )
}
