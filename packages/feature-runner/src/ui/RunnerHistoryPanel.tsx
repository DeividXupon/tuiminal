import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import { paintRunnerStatusRows } from "../rendering/status-select"
import type { RunnerLogPanelProps } from "./runner-view-types"
export function RunnerHistoryPanel({
  shortRunner,
  historyExpanded,
  historyPanelRef,
  historyPanelHeight,
  focusPane,
  toggleHistoryPane,
  historyOptions,
  historyListRef,
  selectedHistoryIndex,
  setSelectedExecutionId,
  focusLogPane,
  setFocusPane,
  boxSelection,
  projectExecutions,
}: Pick<
  RunnerLogPanelProps,
  | "shortRunner"
  | "historyExpanded"
  | "historyPanelRef"
  | "historyPanelHeight"
  | "focusPane"
  | "toggleHistoryPane"
  | "historyOptions"
  | "historyListRef"
  | "selectedHistoryIndex"
  | "setSelectedExecutionId"
  | "focusLogPane"
  | "setFocusPane"
  | "boxSelection"
  | "projectExecutions"
>) {
  return (
    <>
      {shortRunner ? null : historyExpanded ? (
        <box
          ref={historyPanelRef}
          id="runner-history-panel"
          focusable
          style={{
            position: "relative",
            height: historyPanelHeight,
            flexShrink: 0,
            border: ["top"],
            borderColor: focusPane === "history" ? COLORS.runner : COLORS.border,
          }}
        >
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <text content="HISTÓRICO DO PROJETO" style={{ fg: COLORS.runner }} />
            <InlineButton label="[S] Recolher" accent={COLORS.runner} onPress={toggleHistoryPane} />
          </box>
          {historyOptions.length ? (
            <select
              ref={historyListRef}
              id="runner-history-list"
              options={historyOptions}
              renderAfter={paintRunnerStatusRows}
              selectedIndex={selectedHistoryIndex}
              onChange={(_index, option) => {
                if (typeof option?.value === "string") {
                  setSelectedExecutionId(option.value)
                }
              }}
              onSelect={(_index, option) => {
                if (typeof option?.value === "string") {
                  setSelectedExecutionId(option.value)
                  focusLogPane()
                }
              }}
              onMouseDown={(event) => {
                setFocusPane("history")
                handleSelectMouseDown(event, historyListRef.current, {
                  optionCount: historyOptions.length,
                  showDescription: false,
                })
              }}
              onMouseScroll={(event) => handleSelectMouseScroll(event, historyListRef.current)}
              showDescription={false}
              showScrollIndicator
              style={{
                flexGrow: 1,
                backgroundColor: COLORS.panel,
                focusedBackgroundColor: COLORS.panel,
                textColor: COLORS.muted,
                focusedTextColor: COLORS.text,
                selectedBackgroundColor: COLORS.diffModifiedBg,
                selectedTextColor: COLORS.runner,
              }}
            />
          ) : (
            <text content="Nenhuma execução neste projeto." style={{ fg: COLORS.muted }} />
          )}
          {boxSelection.overlay("runner-history-panel")}
        </box>
      ) : (
        <box
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            justifyContent: "space-between",
            backgroundColor: COLORS.panelRaised,
          }}
        >
          <InlineButton label="[S] Histórico" accent={COLORS.runner} onPress={toggleHistoryPane} />
          <text
            content={`${projectExecutions.length} execuç${projectExecutions.length === 1 ? "ão" : "ões"}`}
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
    </>
  )
}
