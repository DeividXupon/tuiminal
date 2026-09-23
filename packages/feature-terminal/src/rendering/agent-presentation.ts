import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { AgentActivity, AgentState } from "../model/agent-state"

export const AGENT_WORKING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

const CODEX_ACTIVITY_MARKERS = {
  code: "{}",
  command: ">_",
  plan: "txt",
  tool: "●",
} as const

const STATES: Record<AgentState, { marker: string; label: string }> = {
  working: { marker: "⠋", label: "Trabalhando" },
  blocked: { marker: "!", label: "Aguardando você" },
  done: { marker: "✓", label: "Concluído · não visto" },
  idle: { marker: "○", label: "Ocioso" },
  unknown: { marker: "?", label: "Estado desconhecido" },
}
const ACTIVITIES: Partial<Record<AgentActivity, string>> = {
  reading: "Lendo",
  searching: "Pesquisando",
  thinking: "Pensando",
  writing: "Escrevendo",
  running: "Executando",
}
const SHORT_STATES: Record<AgentState, string> = {
  working: "Trabalhando",
  blocked: "Aguardando",
  done: "Concluído",
  idle: "Ocioso",
  unknown: "Desconhecido",
}

export function agentPresentation(
  state: AgentState,
  frame = 0,
  activity: AgentActivity | null = null,
) {
  const activityLabel = state === "working" && activity ? ACTIVITIES[activity] : undefined
  return {
    marker:
      state === "working"
        ? AGENT_WORKING_FRAMES[frame % AGENT_WORKING_FRAMES.length]!
        : STATES[state].marker,
    label: translateUi(activityLabel ?? STATES[state].label),
    shortLabel: translateUi(activityLabel ?? SHORT_STATES[state]),
    color:
      state === "blocked"
        ? COLORS.warning
        : state === "done"
          ? COLORS.success
          : state === "working"
            ? COLORS.terminal
            : COLORS.muted,
  }
}

export function codexActivityIndicators(
  state: AgentState,
  activity: AgentActivity | null,
  frame = 0,
) {
  const active =
    state === "working"
      ? activity === "coding" || activity === "writing"
        ? "code"
        : activity === "running"
          ? "command"
          : activity === "updating"
            ? "plan"
            : activity === "tooling"
              ? "tool"
              : null
      : null
  const bright = Math.floor(frame / 3) % 2 === 0
  return (Object.keys(CODEX_ACTIVITY_MARKERS) as Array<keyof typeof CODEX_ACTIVITY_MARKERS>).map(
    (key) => ({
      key,
      marker: CODEX_ACTIVITY_MARKERS[key],
      active: key === active,
      bright: key === active && bright,
    }),
  )
}
