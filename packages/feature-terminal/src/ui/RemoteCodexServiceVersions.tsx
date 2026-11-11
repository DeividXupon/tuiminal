import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RemoteCodexCompatibilityReport } from "../model/remote-codex"

export function RemoteCodexServiceVersions({ report }: { report: RemoteCodexCompatibilityReport }) {
  return (
    <>
      {report.remoteDaemonVersion && (
        <text
          content={`${translateUi("Serviço remoto")}: ${report.remoteDaemonVersion}`}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      )}
      {report.remoteAppServerVersion && (
        <text
          content={`${translateUi("Serviço conectado")}: ${report.remoteAppServerVersion}`}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      )}
    </>
  )
}
