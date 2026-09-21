import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { AgentActivity, AgentState } from "../model/agent-state"

export const AGENT_WORKING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

const STATES: Record<AgentState, { marker: string; label: string }> = {
  working: { marker: "⠋", label: "Trabalhando" },
  blocked: { marker: "!", label: "Aguardando você" },
  done: { marker: "✓", label: "Concluído · não visto" },
  idle: { marker: "○", label: "Ocioso" },
  unknown: { marker: "?", label: "Estado desconhecido" },
}
const ACTIVITIES: Record<AgentActivity, string> = {
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
  activity: AgentActivity | null = null,
  frame = 0,
) {
  return {
    marker:
      state === "working"
        ? AGENT_WORKING_FRAMES[frame % AGENT_WORKING_FRAMES.length]!
        : STATES[state].marker,
    label: translateUi(
      state === "working" && activity ? ACTIVITIES[activity] : STATES[state].label,
    ),
    shortLabel: translateUi(
      state === "working" && activity ? ACTIVITIES[activity] : SHORT_STATES[state],
    ),
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
