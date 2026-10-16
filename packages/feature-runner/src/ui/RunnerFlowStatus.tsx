import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RunnerNodeStatus } from "../model/plan"
import type { RunnerCommand } from "../model/types"
import { runnerColoredText, runnerFlowColor, runnerFlowMarker } from "../rendering/status"

const stateLabels: Record<RunnerNodeStatus, string> = {
  pending: "aguardando",
  starting: "iniciando",
  started: "iniciado",
  healthy: "saudável",
  success: "sucesso",
  failed: "falhou",
  stopped: "parado",
  blocked: "bloqueado",
}

export function RunnerFlowStatus({
  states,
  commands,
}: {
  states: readonly [string, RunnerNodeStatus][]
  commands: readonly RunnerCommand[]
}) {
  const parts = states.map(([id, state], index) => ({
    text: `${index ? " · " : ""}${runnerFlowMarker(state)} ${commands.find((command) => command.id === id)?.label ?? id}: ${translateUi(stateLabels[state])}`,
    color: runnerFlowColor(state),
  }))
  return (
    <text
      id="runner-flow-status"
      content={runnerColoredText(
        parts.length ? parts : [{ text: `◐ ${translateUi("aguardando")}`, color: COLORS.warning }],
      )}
      height={3}
    />
  )
}
