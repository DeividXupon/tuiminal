import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { runnerVisualStatus } from "../model/status"
import { fitLine } from "../rendering/presentation"
import { runnerExecutionLabel, runnerStatusColor } from "../rendering/status"
import type { RunnerCommandPanelProps } from "./runner-view-types"
export function RunnerCommandDetails({
  selectedCommand,
  showCommandDetails,
  focusPane,
  commandPanelWidth,
  selectedCommandExecution,
}: Pick<
  RunnerCommandPanelProps,
  | "selectedCommand"
  | "showCommandDetails"
  | "focusPane"
  | "commandPanelWidth"
  | "selectedCommandExecution"
>) {
  return (
    <>
      {selectedCommand && showCommandDetails ? (
        <box
          style={{
            height: 3,
            flexShrink: 0,
            border:
              LAYOUT.compact && focusPane === "history"
                ? (["top", "left"] as const)
                : (["top"] as const),
            borderColor: COLORS.border,
          }}
        >
          <text
            id="runner-command-detail"
            content={fitLine(`❯ ${selectedCommand.displayCommand}`, commandPanelWidth - 4)}
            style={{ fg: COLORS.text }}
          />
          <ShortcutText
            id="runner-command-detail-meta"
            highlight={Boolean(selectedCommandExecution)}
            content={fitLine(
              selectedCommandExecution
                ? `${runnerExecutionLabel(selectedCommandExecution)}${selectedCommandExecution.pid ? ` #${selectedCommandExecution.pid}` : ""}`
                : `${selectedCommand.description} · ${selectedCommand.source ?? "detectado"}${selectedCommand.interactive ? " · PTY" : ""}`,
              commandPanelWidth - 4,
            )}
            style={{
              fg: runnerStatusColor(runnerVisualStatus(selectedCommandExecution)),
            }}
          />
        </box>
      ) : null}
    </>
  )
}
