import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RunnerExecution } from "../model/execution"
import { formatDuration, statusMarker } from "../rendering/presentation"
import {
  runnerColoredText,
  runnerExecutionLabel,
  runnerStatusBackground,
  runnerStatusColor,
} from "../rendering/status"

export function RunnerExecutionStatus({
  execution,
  now,
  compact = false,
  width,
}: {
  execution: RunnerExecution
  now: number
  compact?: boolean
  width: number
}) {
  const health = execution.health
  const healthColors = {
    none: COLORS.muted,
    checking: COLORS.warning,
    healthy: COLORS.success,
    unhealthy: COLORS.danger,
  }
  const healthMarkers = { none: "", checking: "◐", healthy: "♥", unhealthy: "!" }
  const healthLabels = {
    none: "",
    checking: "VERIFICANDO",
    healthy: "saudável",
    unhealthy: "SEM SAÚDE",
  }
  const label = compact
    ? statusMarker(execution.status)
    : runnerExecutionLabel({ ...execution, health: "none" })
  const parts = [
    {
      text: ` ${label} `,
      color: runnerStatusColor(execution.status),
      background: runnerStatusBackground(execution.status),
    },
    {
      text:
        health === "none"
          ? ""
          : ` ${healthMarkers[health]}${compact ? "" : ` ${translateUi(healthLabels[health])}`}`,
      color: healthColors[health],
    },
    {
      text: ` ${formatDuration((execution.endedAt ?? now) - execution.startedAt)}${!compact && execution.pid ? ` #${execution.pid}` : ""}`,
      color: COLORS.muted,
    },
  ]
  let remaining = width
  const fitted = parts.map((part) => {
    const text = truncateDisplay(part.text, Math.max(0, remaining))
    remaining -= displayWidth(text)
    return { ...part, text }
  })
  return (
    <text
      id={`runner-execution-status-${execution.id}`}
      content={runnerColoredText(fitted)}
      style={{ width, height: 1, flexShrink: 0 }}
    />
  )
}
