import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { RunnerFooterProps } from "./runner-view-types"
export function RunnerProcessFooter({
  focusLogPane,
  selectedExecution,
  narrowRunner,
  setNarrowPane,
  stopSelectedExecution,
  toggleViewMode,
  actionPalette,
}: Pick<
  RunnerFooterProps,
  | "focusLogPane"
  | "selectedExecution"
  | "narrowRunner"
  | "setNarrowPane"
  | "stopSelectedExecution"
  | "toggleViewMode"
  | "actionPalette"
>) {
  return (
    <>
      <InlineButton label="[L/→] Log" accent={COLORS.runner} onPress={focusLogPane} />
      <InlineButton
        label="[↵] Ver log"
        accent={COLORS.runner}
        disabled={!selectedExecution}
        onPress={() => {
          if (narrowRunner) setNarrowPane("log")
        }}
      />
      <InlineButton
        label="Parar"
        accent={COLORS.danger}
        disabled={selectedExecution?.status !== "running"}
        onPress={stopSelectedExecution}
      />
      <InlineButton label="[Shift+M] Multi" accent={COLORS.runner} onPress={toggleViewMode} />
      <InlineButton
        id="runner-action-palette-open"
        label="[?] Ações"
        accent={COLORS.runner}
        active={actionPalette.isOpen}
        onPress={() => actionPalette.open()}
      />
    </>
  )
}
