import { RGBA, StyledText } from "@opentui/core"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpDocumentState, HttpResponseSnapshot } from "../model/types"
import { formatHttpBytes, formatHttpDuration } from "./format"
import { HttpPaneTitle } from "./HttpPaneTitle"

function statusColor(status: number) {
  if (status >= 200 && status < 300) return COLORS.success
  if (status >= 300 && status < 400) return COLORS.warning
  return COLORS.danger
}

export function HttpResponseHeader({
  document,
  response,
  onFocus,
}: {
  document: HttpDocumentState
  response: HttpResponseSnapshot | null
  onFocus: () => void
}) {
  return (
    <box
      style={{
        minHeight: 1,
        flexShrink: 0,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
      }}
    >
      <HttpPaneTitle pane="response" requestId={document.request.id} onFocus={onFocus} />
      {response ? (
        <text
          content={
            new StyledText([
              {
                __isChunk: true,
                text: `${response.status} ${response.statusText}`,
                fg: RGBA.fromHex(statusColor(response.status)),
              },
              {
                __isChunk: true,
                text: ` · ${formatHttpDuration(response.timings.totalMs)} · ${formatHttpBytes(response.capturedBytes)}${response.truncated ? ` · ${translateUi("TRUNCADO")}` : ""}`,
                fg: RGBA.fromHex(response.truncated ? COLORS.warning : COLORS.muted),
              },
            ])
          }
          style={{ flexShrink: 1, minWidth: 0 }}
        />
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
