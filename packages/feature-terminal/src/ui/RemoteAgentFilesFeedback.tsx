import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RemoteAgentFilesState } from "../hooks/use-remote-agent-files"

export function RemoteAgentFilesFeedback({ state }: { state: RemoteAgentFilesState }) {
  if (state.phase !== "uploading")
    return (
      <text
        id="terminal-agent-files-feedback"
        content={translateUi(
          state.error ??
            (state.phase === "checking"
              ? "Verificando anexo…"
              : "O caminho entra no prompt. Você envia a mensagem."),
        )}
        wrapMode="word"
        style={{
          height: 2,
          flexShrink: 0,
          fg: state.error ? COLORS.danger : COLORS.muted,
        }}
      />
    )
  const files = [...state.completed, ...state.files]
  const total = files.reduce((sum, file) => sum + file.size, 0)
  const sent = state.completed.reduce((sum, file) => sum + file.size, 0) + state.transferred
  const percent = total ? Math.min(100, Math.floor((sent * 100) / total)) : 0
  return (
    <box style={{ height: 2, flexShrink: 0 }}>
      <text
        content={`${translateUi("Enviando arquivos…")} ${state.completed.length}/${files.length} · ${percent}%`}
        style={{ height: 1, fg: COLORS.terminal }}
      />
      <box style={{ height: 1, width: "100%", backgroundColor: COLORS.panelRaised }}>
        <box style={{ height: 1, width: `${percent}%`, backgroundColor: COLORS.terminal }} />
      </box>
    </box>
  )
}
