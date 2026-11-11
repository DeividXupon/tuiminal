import { useTerminalDimensions } from "@opentui/react"
import { LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import { useMemo } from "react"
import { MultiProcessPanel } from "../ui/MultiProcessPanel"
import { RunnerCommandPanel } from "../ui/RunnerCommandPanel"
import { RunnerFooter } from "../ui/RunnerFooter"
import { RunnerHeader } from "../ui/RunnerHeader"
import { RunnerCommandColumn, RunnerPanels, RunnerSurface } from "../ui/RunnerLayout"
import { RunnerLogPanel } from "../ui/RunnerLogPanel"
import { noop } from "./fixtures"
import { RunnerTutorialDialog, TutorialProjectPicker } from "./RunnerTutorialDialogs"
import { tutorialRefs } from "./refs"
import { tutorialWorkspaceState } from "./workspace-state"

/** The live presentation with inert callbacks and synthetic data; no live services mount. */
export function RunnerTutorialDemo({ activeTargetId }: { activeTargetId: string | null }) {
  const terminal = useTerminalDimensions()
  const scene = activeTargetId?.replace(/^tutorial-runner-/, "") ?? "workspace"
  useWorkspaceRepaint(scene)
  const state = tutorialWorkspaceState(scene, terminal)
  const refs = useMemo(tutorialRefs, [])
  const { narrowRunner, narrowPane, commandPanelWidth } = state
  const commandTarget = scene === "processes" || scene === "ports" ? scene : "commands"
  const logTarget = ["running", "stopped", "filter", "history", "focus"].includes(scene)
    ? scene
    : "logs"
  return (
    <box
      id="tutorial-runner-workspace"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 900,
        backgroundColor: LAYOUT.workspaceBackground,
      }}
    >
      <RunnerSurface key={scene} id="tutorial-runner-finale">
        <RunnerHeader {...state} />
        {scene === "projects" ? (
          <TutorialProjectPicker terminal={terminal} refs={refs} />
        ) : (
          <RunnerPanels
            narrow={narrowRunner}
            pane={narrowPane}
            focusCommands={noop}
            focusLog={noop}
          >
            {(!narrowRunner || narrowPane === "commands") && (
              <RunnerCommandColumn narrow={narrowRunner} width={commandPanelWidth}>
                <RunnerCommandPanel {...state} {...refs} id={`tutorial-runner-${commandTarget}`} />
              </RunnerCommandColumn>
            )}
            {(!narrowRunner || narrowPane === "log") &&
              (scene === "multi" ? (
                <box id="tutorial-runner-multi" flexGrow={1} flexShrink={1}>
                  <MultiProcessPanel {...state} boxOverlay={state.boxSelection.overlay} />
                </box>
              ) : (
                <RunnerLogPanel {...state} {...refs} id={`tutorial-runner-${logTarget}`} />
              ))}
          </RunnerPanels>
        )}
        <RunnerFooter
          {...state}
          {...refs}
          id={scene === "environment" ? "tutorial-runner-environment" : "tutorial-runner-footer"}
        />
        <RunnerTutorialDialog scene={scene} width={terminal.width} height={terminal.height} />
      </RunnerSurface>
    </box>
  )
}
