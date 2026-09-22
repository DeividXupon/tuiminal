import { translateUi } from "@xupon/tuiminal-core/i18n/index"

/** Explains the capability boundary when selecting an externally running agent. */
export function tmuxAgentNotice(agent: { label: string } | null) {
  if (!agent) return null
  return {
    source: "Terminal",
    kind: "info" as const,
    title: translateUi("Agente no tmux"),
    message: translateUi("Execute este agente no Tuiminal para mais funcionalidades."),
  }
}
