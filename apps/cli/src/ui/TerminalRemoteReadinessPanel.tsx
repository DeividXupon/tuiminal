import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RemoteServerReadinessReport } from "@xupon/tuiminal-feature-terminal"
import { readinessCodeMessage } from "./terminal-remote-settings"

export function TerminalRemoteReadinessPanel({
  report,
  checking,
  dense,
}: {
  report: RemoteServerReadinessReport | null
  checking: boolean
  dense: boolean
}) {
  const rows = [
    { id: "githubSsh" as const, label: "GitHub via SSH" },
    { id: "codex" as const, label: "Codex CLI" },
  ]
  return (
    <box
      id="configuration-terminal-remote-readiness"
      style={{ height: dense ? 1 : 3, flexShrink: 0 }}
    >
      {dense ? null : (
        <text content={translateUi("PRONTIDÃO DO SERVIDOR")} style={{ fg: COLORS.terminal }} />
      )}
      <box style={{ height: dense ? 1 : 2, flexDirection: dense ? "row" : "column" }}>
        {rows.map(({ id, label }) => {
          const barrier = report?.[id]
          const message = checking
            ? translateUi("Verificando…")
            : barrier
              ? translateUi(readinessCodeMessage(barrier.code))
              : translateUi("Não verificado")
          return (
            <text
              key={id}
              id={`configuration-terminal-remote-readiness-${id}`}
              content={`${barrier?.ready ? "●" : "○"} ${translateUi(label)}: ${message}  `}
              style={{
                fg: barrier?.ready ? COLORS.success : barrier ? COLORS.warning : COLORS.muted,
              }}
            />
          )
        })}
      </box>
    </box>
  )
}
