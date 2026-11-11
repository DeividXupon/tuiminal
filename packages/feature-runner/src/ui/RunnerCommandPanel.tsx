import { COLORS, focusedPanelBorder } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { RunnerLoadingOverlay } from "../ui/RunnerLoadingOverlay"
import { RunnerCommandDetails } from "./RunnerCommandDetails"
import { RunnerCommandHeader } from "./RunnerCommandHeader"
import { RunnerCommandList } from "./RunnerCommandList"
import type { RunnerCommandPanelProps } from "./runner-view-types"

export function RunnerCommandPanel({
  id,
  commandPanelRef,
  focusPane,
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
  commandPanelWidth,
  setFocusPane,
  manualInputRef,
  manualCommand,
  setManualCommand,
  runManualCommand,
  openSaveCommandModal,
  processOptions,
  selectedExecution,
  narrowRunner,
  setNarrowPane,
  discoveryError,
  commandOptions,
  selectedCommandIndex,
  selectCommand,
  toggleCommand,
  openProjectPicker,
  selectedCommand,
  showCommandDetails,
  selectedCommandExecution,
  boxSelection,
}: RunnerCommandPanelProps) {
  return (
    <box
      ref={commandPanelRef}
      id={id ?? "runner-command-panel"}
      focusable
      style={{
        position: "relative",
        height: "100%",
        flexShrink: 0,
        ...focusedPanelBorder(focusPane === "commands", COLORS.runner),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <RunnerCommandHeader
        {...{
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
        }}
      />
      {listMode === "commands" ? (
        <>
          <box
            id="runner-command-input-row"
            style={{
              height: 1,
              width: commandPanelWidth - 4,
              flexDirection: "row",
              flexShrink: 0,
              backgroundColor: COLORS.panelRaised,
            }}
          >
            <InlineButton
              id="runner-command-input-shortcut"
              label="[/]"
              accent={COLORS.runner}
              backgroundColor={COLORS.panelRaised}
              onPress={() => {
                setFocusPane("commands")
                manualInputRef.current?.focus()
              }}
            />
            <input
              ref={manualInputRef}
              id="runner-command-input"
              value={manualCommand}
              placeholder="❯ Digite qualquer comando…"
              onInput={setManualCommand}
              onMouseDown={() => {
                setFocusPane("commands")
                manualInputRef.current?.focus()
              }}
              onSubmit={() => runManualCommand()}
              style={{
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 1,
                backgroundColor: COLORS.panelRaised,
                focusedBackgroundColor: COLORS.panelRaised,
                textColor: COLORS.text,
                focusedTextColor: COLORS.text,
                cursorColor: COLORS.runner,
              }}
            />
          </box>
          {manualCommand.trim() ? (
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                backgroundColor: COLORS.diffModifiedBg,
              }}
            >
              <InlineButton
                label="◆ Salvar comando [Ctrl+S]"
                accent={COLORS.warning}
                active
                onPress={openSaveCommandModal}
              />
            </box>
          ) : null}
        </>
      ) : null}
      <RunnerCommandList
        {...{
          listMode,
          processOptions,
          processListRef,
          activeExecutions,
          selectedExecution,
          setSelectedExecutionId,
          narrowRunner,
          setNarrowPane,
          setFocusPane,
          commandPanelWidth,
          discoveryError,
          commandOptions,
          commandListRef,
          selectedCommandIndex,
          selectCommand,
          toggleCommand,
          commands,
        }}
      />
      {listMode === "commands" ? (
        <InlineButton
          id="runner-open-project"
          label="[N] EXECUTAR EM OUTRO PROJETO…"
          accent={COLORS.runner}
          onPress={() => void openProjectPicker()}
        />
      ) : null}
      <RunnerCommandDetails
        {...{
          selectedCommand,
          showCommandDetails,
          focusPane,
          commandPanelWidth,
          selectedCommandExecution,
        }}
      />
      <RunnerLoadingOverlay active={listMode === "commands" && loading} kind="commands" />
      {boxSelection.overlay("runner-command-panel")}
    </box>
  )
}
