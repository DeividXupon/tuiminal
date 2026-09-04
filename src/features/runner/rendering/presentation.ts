import type { RunnerExecution, ExecutionStatus } from "../model/execution"
import type { RunnerListeningPort } from "../model/types"
import { COLORS } from "../../../core/settings/theme"
import { padDisplayEnd, truncateDisplay, translateUi } from "../../../shared/i18n/index"
export function fitLine(line: string, width: number) {
  const clean = translateUi(line)
    .replace(/\t/g, "  ")
    .replace(/[\r\n]/g, "")
  return padDisplayEnd(truncateDisplay(clean, width), width)
}

export function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

export function statusMarker(status: ExecutionStatus) {
  switch (status) {
    case "running":
      return "●"
    case "stopping":
      return "◐"
    case "success":
      return "✓"
    case "failed":
      return "×"
    case "stopped":
      return "■"
  }
}

export function statusLabel(status: ExecutionStatus) {
  switch (status) {
    case "running":
      return "RODANDO"
    case "stopping":
      return "ENCERRANDO"
    case "success":
      return "CONCLUÍDO"
    case "failed":
      return "FALHOU"
    case "stopped":
      return "INTERROMPIDO"
  }
}

export function statusColor(status: ExecutionStatus) {
  switch (status) {
    case "running":
      return COLORS.runner
    case "stopping":
      return COLORS.warning
    case "success":
      return COLORS.success
    case "failed":
      return COLORS.danger
    case "stopped":
      return COLORS.muted
  }
}

export function healthLabel(health: RunnerExecution["health"]) {
  switch (health) {
    case "checking":
      return " · ◐ SAÚDE"
    case "healthy":
      return " · ♥ OK"
    case "unhealthy":
      return " · ! SEM SAÚDE"
    default:
      return ""
  }
}

export function commandKey(projectRoot: string, commandId: string) {
  return `${projectRoot}\u0000${commandId}`
}

export function portAddress(port: RunnerListeningPort) {
  return `${port.host}:${port.port}`
}
