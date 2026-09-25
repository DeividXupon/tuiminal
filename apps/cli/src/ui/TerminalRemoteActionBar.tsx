import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

export type TerminalRemoteStatus = { message: string; ok?: boolean } | null

export function TerminalRemoteActionBar({
  contentWidth,
  dense,
  status,
  testing,
  checkingReadiness,
  canActivate,
  canConfigure,
  onBack,
  onNew,
  onSave,
  onActivate,
  onTest,
  onVerify,
  onConfigure,
}: {
  contentWidth: number
  dense: boolean
  status: TerminalRemoteStatus
  testing: boolean
  checkingReadiness: boolean
  canActivate: boolean
  canConfigure: boolean
  onBack: () => void
  onNew: () => void
  onSave: () => void
  onActivate: () => void
  onTest: () => void
  onVerify: () => void
  onConfigure: () => void
}) {
  const short = contentWidth < 44
  const statusColor =
    status?.ok === undefined ? COLORS.muted : status.ok ? COLORS.success : COLORS.danger
  return (
    <box style={{ flexShrink: 0 }}>
      {status || !dense ? (
        <text
          id="configuration-terminal-remote-status"
          content={status?.message ?? " "}
          style={{ height: 1, flexShrink: 0, fg: statusColor }}
        />
      ) : null}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="configuration-terminal-remote-back"
          label={short ? "[Esc]" : "[Esc] Voltar"}
          accent={COLORS.terminal}
          onPress={onBack}
        />
        <InlineButton
          id="configuration-terminal-remote-new"
          label={short ? "[N] Novo" : "[N] Novo perfil"}
          accent={COLORS.terminal}
          onPress={onNew}
        />
        <InlineButton
          id="configuration-terminal-remote-save"
          label="[S] Salvar"
          accent={COLORS.terminal}
          onPress={onSave}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="configuration-terminal-remote-activate"
          label={short ? "[A] Ativo" : "[A] Tornar ativo"}
          accent={COLORS.terminal}
          disabled={!canActivate}
          onPress={onActivate}
        />
        <InlineButton
          id="configuration-terminal-remote-test"
          label={testing ? "Testando…" : short ? "[T] Testar" : "[T] Testar conexão"}
          accent={COLORS.terminal}
          disabled={testing}
          onPress={onTest}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="configuration-terminal-remote-verify"
          label={
            checkingReadiness ? "Verificando…" : short ? "[V] Verificar" : "[V] Verificar servidor"
          }
          accent={COLORS.terminal}
          disabled={checkingReadiness || testing || !canConfigure}
          onPress={onVerify}
        />
        <InlineButton
          id="configuration-terminal-remote-configure"
          label={short ? "[C] Configurar" : "[C] Configurar servidor"}
          accent={COLORS.terminal}
          disabled={checkingReadiness || testing || !canConfigure}
          onPress={onConfigure}
        />
      </box>
    </box>
  )
}
