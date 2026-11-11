import { COLORS, focusedPanelBorder, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { fitLine } from "../rendering/presentation"
import { runnerNoticeColor } from "../rendering/status"
import { RunnerExecutionStatus } from "../ui/RunnerExecutionStatus"
import { RunnerHistoryPanel } from "./RunnerHistoryPanel"
import type { RunnerLogPanelProps } from "./runner-view-types"

export function RunnerLogPanel({
  id,
  focusPane,
  shortRunner,
  runnerNotice,
  logWidth,
  selectedExecution,
  now,
  logFilterOpen,
  attachLogFilter,
  logFilter,
  dispatchLogPreferences,
  submitLogFilter,
  logFilterRef,
  logStream,
  logScrollRef,
  selectedLogs,
  selectedLogDocument,
  logHeight,
  boxSelection,
  selectedProcessHandle,
  processInputRef,
  processInput,
  setProcessInput,
  submitProcessInput,
  setFocusPane,
  historyExpanded,
  historyPanelRef,
  historyPanelHeight,
  toggleHistoryPane,
  historyOptions,
  historyListRef,
  selectedHistoryIndex,
  setSelectedExecutionId,
  focusLogPane,
  projectExecutions,
}: RunnerLogPanelProps) {
  return (
    <box
      id={id ?? "runner-log-surface"}
      key={LAYOUT.compact ? "runner-log-compact" : "runner-log-framed"}
      style={{
        flexGrow: 1,
        ...focusedPanelBorder(focusPane === "log", COLORS.runner),
        backgroundColor: LAYOUT.alternatePanel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{
          height: shortRunner ? 1 : 2,
          flexShrink: 0,
          flexDirection: "column",
          backgroundColor: COLORS.panelRaised,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        {!shortRunner ? (
          <text
            content={
              runnerNotice
                ? fitLine(runnerNotice.message, logWidth)
                : selectedExecution
                  ? fitLine(
                      `LOG  /  ${selectedExecution.projectName}  /  ${selectedExecution.label}`,
                      logWidth,
                    )
                  : "LOG DO PROCESSO"
            }
            style={{
              height: 1,
              fg: runnerNotice ? runnerNoticeColor(runnerNotice.kind) : COLORS.runner,
            }}
          />
        ) : null}
        {selectedExecution ? (
          <RunnerExecutionStatus
            execution={selectedExecution}
            now={now}
            compact={shortRunner}
            width={logWidth}
          />
        ) : (
          <text content="◇ AGUARDANDO" style={{ fg: COLORS.muted }} />
        )}
      </box>

      {logFilterOpen ? (
        <input
          ref={attachLogFilter}
          id="runner-log-filter"
          value={logFilter}
          placeholder="Filtrar log…"
          onInput={(value) => dispatchLogPreferences({ type: "filter", value })}
          onSubmit={submitLogFilter}
          onMouseDown={() => logFilterRef.current?.focus()}
          width={Math.max(8, logWidth)}
          style={{
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.runner,
          }}
        />
      ) : null}

      <box id="runner-log-panel" style={{ position: "relative", flexGrow: 1, flexShrink: 1 }}>
        <scrollbox
          key={`${selectedExecution?.id ?? "empty"}:${logStream}:${logFilter}`}
          ref={logScrollRef}
          id="runner-log-scroll"
          focusable
          scrollY
          stickyScroll
          stickyStart="bottom"
          viewportCulling
          style={{
            flexGrow: 1,
            flexShrink: 1,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: COLORS.canvas,
              foregroundColor: COLORS.border,
            },
          }}
        >
          {selectedLogs.length ? (
            <text
              content={selectedLogDocument}
              wrapMode="none"
              style={{
                width: "100%",
                height: selectedLogs.length,
                flexShrink: 0,
                bg: COLORS.canvas,
              }}
            />
          ) : (
            <box
              style={{
                height: logHeight,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShortcutText
                content="Selecione um comando e pressione [Enter]."
                style={{ fg: COLORS.text }}
              />
              <text content="A saída aparecerá aqui em tempo real." style={{ fg: COLORS.muted }} />
            </box>
          )}
        </scrollbox>
        {boxSelection.overlay("runner-log-panel")}
      </box>

      {selectedProcessHandle ? (
        <input
          ref={processInputRef}
          id="runner-process-input"
          value={processInput}
          placeholder={
            selectedProcessHandle.interactive ? "⌨ Entrada PTY…" : "⌨ Enviar para stdin…"
          }
          onInput={setProcessInput}
          onSubmit={submitProcessInput}
          onMouseDown={() => {
            setFocusPane("log")
            processInputRef.current?.focus()
          }}
          width={Math.max(8, logWidth)}
          style={{
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.runner,
          }}
        />
      ) : null}

      <RunnerHistoryPanel
        {...{
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
        }}
      />
    </box>
  )
}
