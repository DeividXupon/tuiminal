import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import { displayWidth, translateUi, type LanguageId } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RunnerExecution } from "../model/execution"
import type { RunnerNotice } from "../model/notice"
import type { RunnerNodeStatus } from "../model/plan"
import {
  runnerVisualStatus,
  type RunnerProjectSummary,
  type RunnerVisualStatus,
} from "../model/status"
import { statusColor, statusLabel, statusMarker } from "./presentation"

export function runnerStatusColor(status: RunnerVisualStatus) {
  if (status === "idle") return COLORS.muted
  if (status === "checking") return COLORS.warning
  if (status === "unhealthy") return COLORS.danger
  return statusColor(status)
}

export function runnerStatusBackground(status: RunnerVisualStatus) {
  if (status === "failed" || status === "unhealthy") return COLORS.diffRemovedBg
  if (status === "success") return COLORS.diffAddedBg
  if (status === "checking" || status === "stopping") return COLORS.diffModifiedBg
  return COLORS.panelRaised
}

export function runnerStatusMarker(status: RunnerVisualStatus) {
  if (status === "idle") return "◇"
  if (status === "checking") return "◐"
  if (status === "unhealthy") return "!"
  return statusMarker(status)
}

export function runnerStatusLabel(status: RunnerVisualStatus) {
  if (status === "idle") return "NUNCA EXECUTADO"
  if (status === "checking") return "VERIFICANDO"
  if (status === "unhealthy") return "SEM SAÚDE"
  return statusLabel(status)
}

export function runnerExecutionLabel(execution: RunnerExecution, language?: LanguageId) {
  const state = runnerVisualStatus(execution)
  const code =
    execution.exitCode !== null && execution.exitCode !== 0
      ? ` · ${translateUi("SAÍDA", language)} ${execution.exitCode}`
      : ""
  return `${runnerStatusMarker(state)} ${translateUi(runnerStatusLabel(state), language)}${code}`
}

export type RunnerColorPart = { text: string; color: string; background?: string }

export function runnerColoredText(parts: readonly RunnerColorPart[]) {
  return new StyledText(
    parts.map(
      ({ text, color, background }): TextChunk => ({
        __isChunk: true,
        text,
        fg: RGBA.fromHex(color),
        ...(background ? { bg: RGBA.fromHex(background) } : {}),
      }),
    ),
  )
}

export function runnerSummaryParts(count: number, summary: RunnerProjectSummary, width: number) {
  if (width <= 0) return []
  const metrics = [
    { value: count, label: "COMANDOS", short: translateUi("CMD"), color: COLORS.muted },
    {
      value: summary.running,
      label: "RODANDO",
      short: "●",
      color: summary.running ? COLORS.runner : COLORS.muted,
    },
    {
      value: summary.failed,
      label: summary.failed === 1 ? "FALHA" : "FALHAS",
      short: "×",
      color: COLORS.danger,
    },
    { value: summary.stopping, label: "ENCERRANDO", short: "◐", color: COLORS.warning },
    {
      value: summary.success,
      label: summary.success === 1 ? "CONCLUÍDO" : "CONCLUÍDOS",
      short: "✓",
      color: COLORS.success,
    },
  ].filter((metric, index) => index < 2 || metric.value > 0)
  const parts = (compact: boolean): RunnerColorPart[] =>
    metrics.map((metric, index) => ({
      text: `${index ? " · " : ""}${metric.value} ${compact ? metric.short : translateUi(metric.label)}`,
      color: metric.color,
    }))
  const full = parts(false)
  return displayWidth(full.map((part) => part.text).join("")) <= width ? full : parts(true)
}

export function runnerNoticeColor(kind: RunnerNotice["kind"]) {
  return {
    info: COLORS.runner,
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.danger,
  }[kind]
}

export function runnerFlowColor(state: RunnerNodeStatus) {
  if (state === "failed") return COLORS.danger
  if (["blocked", "starting", "pending"].includes(state)) return COLORS.warning
  if (state === "healthy" || state === "success") return COLORS.success
  return state === "stopped" ? COLORS.muted : COLORS.runner
}

export function runnerFlowMarker(state: RunnerNodeStatus) {
  if (state === "failed") return "×"
  if (state === "blocked") return "⊘"
  if (state === "healthy" || state === "success") return "✓"
  if (state === "stopped") return "■"
  return state === "started" ? "●" : "◐"
}
