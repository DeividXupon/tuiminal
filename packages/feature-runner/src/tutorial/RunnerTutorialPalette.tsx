import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ActionPalette } from "@xupon/tuiminal-core/ui/ActionPalette"
import { orderActionPaletteActions } from "@xupon/tuiminal-core/ui/action-palette"
import { useMemo } from "react"
import { runnerPaletteActions } from "../ui/runner-palette-actions"
import { noop } from "./fixtures"
import { tutorialRefs } from "./refs"
import { tutorialWorkspaceState } from "./workspace-state"

export function TutorialPalette({ width, height }: { width: number; height: number }) {
  const refs = useMemo(tutorialRefs, [])
  const state = tutorialWorkspaceState("palette", { width, height })
  const actions = orderActionPaletteActions(
    runnerPaletteActions({
      ...state,
      ...refs,
      setConfigurationOpen: noop,
      cycleEnvironmentProfile: noop,
      environmentProfiles: [{ id: "local", label: "local", env: { NODE_ENV: "development" } }],
      deleteSelectedSavedCommand: noop,
      openLogFilter: noop,
      cycleLogStream: noop,
      copySelectedLogs: noop,
      exportSelectedLogs: noop,
      clearSelectedLogs: noop,
      openSelectedPort: noop,
      selectedPortUrl: "http://127.0.0.1:3000",
      copySelectedPort: noop,
      sendSelectedPortToHttp: noop,
      onOpenHttp: undefined,
    }),
  )
  return (
    <ActionPalette
      id="tutorial-runner-palette"
      active={false}
      title="AÇÕES DO RUNNER"
      accent={COLORS.runner}
      actions={actions}
      tags={Object.fromEntries(
        actions.flatMap((a) => a.tags.map((tag) => [tag, { label: tag, color: COLORS.runner }])),
      )}
      width={width}
      height={height}
      onRun={noop}
      onClose={noop}
    />
  )
}
