import { AppContext, useAppContext } from "@opentui/react"
import { WorkspaceRepaintBoundary } from "@xupon/tuiminal-core/ui/workspace-repaint"
import { type ComponentType, createElement, useMemo, useRef } from "react"
import type { RunnerWorkspaceProps } from "../model/workspace"
import { RunnerTutorialDemo } from "./RunnerTutorialDemo"

/** Retain live sessions; a tour-only mount never initializes Runner services. */
export function withRunnerTutorial(Live: ComponentType<RunnerWorkspaceProps>) {
  return function Runner({ tutorial = null, ...props }: RunnerWorkspaceProps) {
    const liveMounted = useRef(false)
    if (!tutorial) liveMounted.current = true
    const context = useAppContext()
    const tourOpen = Boolean(tutorial)
    const liveContext = useMemo(
      () => ({ ...context, keyHandler: tourOpen ? null : context.keyHandler }),
      [context, tourOpen],
    )
    return (
      <WorkspaceRepaintBoundary transitionKey={tutorial ? "runner-tour" : "runner-live"}>
        <box style={{ flexGrow: 1, position: "relative" }}>
          {liveMounted.current && (
            <AppContext.Provider value={liveContext}>
              {createElement(Live, { ...props, active: props.active && !tutorial })}
            </AppContext.Provider>
          )}
          {tutorial && <RunnerTutorialDemo activeTargetId={tutorial.targetId} />}
        </box>
      </WorkspaceRepaintBoundary>
    )
  }
}
