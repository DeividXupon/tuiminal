import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpDocumentState, HttpResponseSnapshot } from "../model/types"
import { formatHttpBytes, formatHttpDuration } from "./format"

function statusColor(status: number) {
  if (status >= 200 && status < 300) return COLORS.success
  if (status >= 300 && status < 400) return COLORS.warning
  return COLORS.danger
}

export function HttpResponseHeader({
  document,
  response,
}: {
  document: HttpDocumentState
  response: HttpResponseSnapshot | null
}) {
  return (
    <box
      style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
    >
      <text content={translateUi("RESPOSTA")} style={{ fg: COLORS.http }} />
      {response ? (
        <box style={{ flexDirection: "row" }}>
          <text
            content={`${response.status} ${response.statusText}`}
            style={{ fg: statusColor(response.status) }}
          />
          <text
            content={` · ${formatHttpDuration(response.timings.totalMs)} · ${formatHttpBytes(response.capturedBytes)}${response.truncated ? ` · ${translateUi("TRUNCADO")}` : ""}`}
            style={{ fg: response.truncated ? COLORS.warning : COLORS.muted }}
          />
        </box>
      ) : (
        <text
          content={translateUi(
            document.execution.status === "running" ? "ENVIANDO" : "SEM RESPOSTA",
          )}
          style={{ fg: document.execution.status === "error" ? COLORS.danger : COLORS.muted }}
        />
      )}
    </box>
  )
}
