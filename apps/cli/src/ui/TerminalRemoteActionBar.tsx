import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

export type TerminalRemoteStatus = { message: string; ok?: boolean } | null

function actionLabels(short: boolean, loading: boolean, testing: boolean, checking: boolean) {
  return {
    back: short ? "[Esc]" : translateUi("[Esc] Voltar"),
    reload: translateUi(
      loading ? "Carregando…" : short ? "[R] Recarregar" : "[R] Recarregar config",
    ),
    activate: translateUi(short ? "[A] Ativo" : "[A] Tornar ativo"),
    test: translateUi(testing ? "Testando…" : short ? "[T] Testar" : "[T] Testar conexão"),
    verify: translateUi(
      checking ? "Verificando…" : short ? "[V] Verificar" : "[V] Verificar servidor",
    ),
    configure: translateUi(short ? "[C] Configurar" : "[C] Configurar servidor"),
  }
}

function statusColor(status: TerminalRemoteStatus) {
  if (status?.ok === undefined) return COLORS.muted
  return status.ok ? COLORS.success : COLORS.danger
}

export function TerminalRemoteActionBar({
  contentWidth,
  dense,
  status,
  loading,
  testing,
  checkingReadiness,
  hasSelection,
  onBack,
  onReload,
  onActivate,
  onTest,
  onVerify,
  onConfigure,
}: {
  contentWidth: number
  dense: boolean
  status: TerminalRemoteStatus
  loading: boolean
  testing: boolean
  checkingReadiness: boolean
  hasSelection: boolean
  onBack: () => void
  onReload: () => void
  onActivate: () => void
  onTest: () => void
  onVerify: () => void
  onConfigure: () => void
}) {
  const short = contentWidth < 44
  const busy = loading || testing || checkingReadiness
  const labels = actionLabels(short, loading, testing, checkingReadiness)
  return (
    <box style={{ flexShrink: 0 }}>
      {status || !dense ? (
        <text
          id="configuration-terminal-remote-status"
          content={status?.message ?? " "}
          style={{ height: 1, flexShrink: 0, fg: statusColor(status) }}
        />
      ) : null}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="configuration-terminal-remote-back"
          label={labels.back}
          accent={COLORS.terminal}
          onPress={onBack}
        />
        <InlineButton
          id="configuration-terminal-remote-reload"
          label={labels.reload}
          accent={COLORS.terminal}
          disabled={busy}
          onPress={onReload}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="configuration-terminal-remote-activate"
          label={labels.activate}
          accent={COLORS.terminal}
          disabled={!hasSelection}
          onPress={onActivate}
        />
        <InlineButton
          id="configuration-terminal-remote-test"
          label={labels.test}
          accent={COLORS.terminal}
          disabled={busy || !hasSelection}
          onPress={onTest}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="configuration-terminal-remote-verify"
          label={labels.verify}
          accent={COLORS.terminal}
          disabled={busy || !hasSelection}
          onPress={onVerify}
        />
        <InlineButton
          id="configuration-terminal-remote-configure"
          label={labels.configure}
          accent={COLORS.terminal}
          disabled={busy || !hasSelection}
          onPress={onConfigure}
        />
      </box>
    </box>
  )
}
