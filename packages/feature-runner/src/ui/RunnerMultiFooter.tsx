import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { RunnerFooterProps } from "./runner-view-types"
export function RunnerMultiFooter({
  cycleActiveExecution,
  selectedExecution,
  stopSelectedExecution,
}: Pick<
  RunnerFooterProps,
  "cycleActiveExecution" | "selectedExecution" | "stopSelectedExecution"
>) {
  return (
    <>
      <InlineButton
        label="[←] Foco"
        accent={COLORS.runner}
        onPress={() => cycleActiveExecution(-1)}
      />
      <InlineButton
        label="[→] Foco"
        accent={COLORS.runner}
        onPress={() => cycleActiveExecution(1)}
      />
      <InlineButton
        label="Parar"
        accent={COLORS.danger}
        disabled={selectedExecution?.status !== "running"}
        onPress={stopSelectedExecution}
      />
    </>
  )
}
