import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { RunnerCommandPanelProps } from "./runner-view-types"
export function RunnerCommandHeader({
  compactCommandHeader,
  listMode,
  commands,
  setListMode,
  commandListRef,
  activeExecutions,
  setSelectedExecutionId,
  processListRef,
  loading,
  refreshCommands,
}: Pick<
  RunnerCommandPanelProps,
  | "compactCommandHeader"
  | "listMode"
  | "commands"
  | "setListMode"
  | "commandListRef"
  | "activeExecutions"
  | "setSelectedExecutionId"
  | "processListRef"
  | "loading"
  | "refreshCommands"
>) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <InlineButton
        id="runner-command-mode"
        label={
          compactCommandHeader
            ? `${listMode === "active" ? "[P] " : ""}CMD ${commands.length}`
            : `${listMode === "active" ? "[P] " : ""}COMANDOS ${commands.length}`
        }
        accent={COLORS.runner}
        active={listMode === "commands"}
        onPress={() => {
          setListMode("commands")
          setTimeout(() => commandListRef.current?.focus(), 0)
        }}
      />
      <InlineButton
        id="runner-active-mode"
        label={
          compactCommandHeader
            ? `${listMode === "commands" ? "[P] " : ""}ATIV ${activeExecutions.length}`
            : `${listMode === "commands" ? "[P] " : ""}ATIVOS ${activeExecutions.length}`
        }
        accent={COLORS.success}
        active={listMode === "active"}
        onPress={() => {
          setListMode("active")
          setSelectedExecutionId(activeExecutions[0]?.id ?? null)
          setTimeout(() => processListRef.current?.focus(), 0)
        }}
      />
      {listMode === "commands" ? (
        <InlineButton
          id="runner-scan"
          label={compactCommandHeader ? "[D]" : "[D] Scan"}
          accent={COLORS.runner}
          disabled={loading}
          onPress={() => void refreshCommands()}
        />
      ) : null}
    </box>
  )
}
