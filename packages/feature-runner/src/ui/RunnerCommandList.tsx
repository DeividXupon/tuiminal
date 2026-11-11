import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import { paintRunnerStatusRows } from "../rendering/status-select"
import type { RunnerCommandPanelProps } from "./runner-view-types"
export function RunnerCommandList({
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
}: Pick<
  RunnerCommandPanelProps,
  | "listMode"
  | "processOptions"
  | "processListRef"
  | "activeExecutions"
  | "selectedExecution"
  | "setSelectedExecutionId"
  | "narrowRunner"
  | "setNarrowPane"
  | "setFocusPane"
  | "commandPanelWidth"
  | "discoveryError"
  | "commandOptions"
  | "commandListRef"
  | "selectedCommandIndex"
  | "selectCommand"
  | "toggleCommand"
  | "commands"
>) {
  return (
    <>
      {listMode === "active" ? (
        processOptions.length ? (
          <select
            ref={processListRef}
            id="runner-process-list"
            options={processOptions}
            renderAfter={paintRunnerStatusRows}
            keyBindings={[]}
            selectedIndex={Math.max(
              0,
              activeExecutions.findIndex((execution) => execution.id === selectedExecution?.id),
            )}
            onChange={(_index, option) => {
              if (typeof option?.value === "string") {
                setSelectedExecutionId(option.value)
              }
            }}
            onSelect={(_index, option) => {
              if (typeof option?.value === "string") {
                setSelectedExecutionId(option.value)
                if (narrowRunner) setNarrowPane("log")
              }
            }}
            onMouseDown={(event) => {
              setFocusPane("commands")
              handleSelectMouseDown(event, processListRef.current, {
                optionCount: processOptions.length,
              })
            }}
            onMouseScroll={(event) => handleSelectMouseScroll(event, processListRef.current)}
            showDescription={false}
            showScrollIndicator
            wrapSelection
            style={{
              width: commandPanelWidth - 4,
              flexGrow: 1,
              backgroundColor: COLORS.panel,
              focusedBackgroundColor: COLORS.panel,
              textColor: COLORS.muted,
              focusedTextColor: COLORS.text,
              selectedBackgroundColor: COLORS.diffModifiedBg,
              selectedTextColor: COLORS.text,
            }}
          />
        ) : (
          <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
            <text content="Nenhum processo ativo." style={{ fg: COLORS.text }} />
            <text content="Volte a Comandos para iniciar um." style={{ fg: COLORS.muted }} />
          </box>
        )
      ) : discoveryError ? (
        <text content={discoveryError} style={{ fg: COLORS.danger }} />
      ) : commandOptions.length ? (
        <select
          ref={commandListRef}
          id="runner-command-list"
          options={commandOptions}
          renderAfter={paintRunnerStatusRows}
          selectedIndex={selectedCommandIndex}
          keyBindings={[{ name: "space", action: "select-current" }]}
          onChange={(_index, option) => {
            if (typeof option?.value === "string") {
              selectCommand(option.value)
            }
          }}
          onSelect={(_index, option) => {
            if (typeof option?.value !== "string") return
            toggleCommand(commands.find((command) => command.id === option.value))
          }}
          onMouseDown={(event) => {
            setFocusPane("commands")
            handleSelectMouseDown(event, commandListRef.current, {
              optionCount: commandOptions.length,
              showDescription: true,
              activateOnClick: true,
            })
          }}
          onMouseScroll={(event) => handleSelectMouseScroll(event, commandListRef.current)}
          showDescription
          showScrollIndicator
          wrapSelection
          style={{
            width: commandPanelWidth - 4,
            flexGrow: 1,
            flexShrink: 1,
            backgroundColor: COLORS.panel,
            focusedBackgroundColor: COLORS.panel,
            textColor: COLORS.muted,
            focusedTextColor: COLORS.text,
            selectedBackgroundColor: COLORS.diffModifiedBg,
            selectedTextColor: COLORS.text,
            descriptionColor: COLORS.muted,
            selectedDescriptionColor: COLORS.text,
          }}
        />
      ) : (
        <box style={{ flexGrow: 1, justifyContent: "center" }}>
          <text content="Nenhum comando detectado." style={{ fg: COLORS.text }} />
          <ShortcutText
            content="Digite um comando acima ou pressione [D] para redetectar."
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
    </>
  )
}
