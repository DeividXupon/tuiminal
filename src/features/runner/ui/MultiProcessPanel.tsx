import { ShortcutText } from "../../../shared/ui/ShortcutText"
import { Button } from "@tuiparts/react/button"
import type { RunnerExecution } from "../model/execution"
import type { RunnerListeningPort } from "../model/types"
import { COLORS, focusedPanelBorder, LAYOUT, panelBorder } from "../../../core/settings/theme"
import { filterRunnerLogs, runnerLogPresentation } from "../rendering/log-document"
import {
  fitLine,
  portAddress,
  statusMarker,
  formatDuration,
  statusColor,
} from "../rendering/presentation"
type MultiProcessPanelProps = {
  activeExecutions: RunnerExecution[]
  visibleMultiExecutions: RunnerExecution[]
  selectedExecution: RunnerExecution | undefined
  listeningPorts: RunnerListeningPort[]
  multiOffset: number
  hiddenMultiBefore: number
  hiddenMultiAfter: number
  multiRailWidth: number
  multiPaneWidth: number
  multiLogHeight: number
  now: number
  logStream: "all" | "stdout" | "stderr" | "system"
  logFilter: string
  showTimestamps: boolean
  slideMultiWindow: (direction: -1 | 1) => void
  setSelectedExecutionId: (id: string) => void
}

export function MultiProcessPanel({
  activeExecutions,
  multiOffset,
  visibleMultiExecutions,
  hiddenMultiBefore,
  slideMultiWindow,
  multiRailWidth,
  selectedExecution,
  now,
  listeningPorts,
  multiPaneWidth,
  logStream,
  logFilter,
  multiLogHeight,
  setSelectedExecutionId,
  showTimestamps,
  hiddenMultiAfter,
}: MultiProcessPanelProps) {
  return (
    <box
      key={LAYOUT.compact ? "runner-multi-compact" : "runner-multi-framed"}
      style={{ flexGrow: 1, flexShrink: 1 }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text content="▣ MULTI" style={{ fg: COLORS.runner }} />
        <text
          content={
            activeExecutions.length
              ? `${activeExecutions.length} ATIVO${activeExecutions.length === 1 ? "" : "S"}  ·  ${multiOffset + 1}–${multiOffset + visibleMultiExecutions.length}/${activeExecutions.length}`
              : "0 ATIVOS  ·  0/0"
          }
          style={{ fg: COLORS.muted }}
        />
      </box>
      {visibleMultiExecutions.length ? (
        <box
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexDirection: "row",
            gap: LAYOUT.gap,
          }}
        >
          {hiddenMultiBefore ? (
            <Button onPress={() => slideMultiWindow(-1)} width={multiRailWidth} flexShrink={0}>
              <box
                style={{
                  width: multiRailWidth,
                  flexGrow: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  ...panelBorder(COLORS.runner),
                  backgroundColor: COLORS.panelRaised,
                }}
              >
                <text content="<" style={{ fg: COLORS.runner }} />
                <text content={`+${hiddenMultiBefore}`} style={{ fg: COLORS.text }} />
              </box>
            </Button>
          ) : null}
          {visibleMultiExecutions.map((execution, index) => {
            const selected = execution.id === selectedExecution?.id
            const duration = (execution.endedAt ?? now) - execution.startedAt
            const executionPorts = listeningPorts.filter((port) => port.groupId === execution.pid)
            const paneLogWidth = Math.max(12, multiPaneWidth - 4)
            const paneLogs = filterRunnerLogs(execution.logs, logStream, logFilter).slice(
              -multiLogHeight,
            )
            const paneNumber = multiOffset + index + 1
            return (
              <Button
                key={execution.id}
                onPress={() => setSelectedExecutionId(execution.id)}
                width={multiPaneWidth}
                flexGrow={1}
              >
                <box
                  key={LAYOUT.compact ? "multi-compact" : "multi-framed"}
                  style={{
                    width: multiPaneWidth,
                    flexGrow: 1,
                    flexShrink: 1,
                    ...focusedPanelBorder(selected, COLORS.runner),
                    backgroundColor: index % 2 === 0 ? COLORS.panel : LAYOUT.alternatePanel,
                    paddingLeft: 1,
                    paddingRight: 1,
                  }}
                >
                  <box
                    style={{
                      height: 3,
                      flexShrink: 0,
                      border: ["bottom"],
                      borderColor: COLORS.border,
                    }}
                  >
                    <box
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <text
                        content={fitLine(`${paneNumber}  ${execution.label}`, paneLogWidth - 12)}
                        style={{ fg: selected ? COLORS.runner : COLORS.text }}
                      />
                      <text
                        content={`${statusMarker(execution.status)} ${formatDuration(duration)}`}
                        style={{ fg: statusColor(execution.status) }}
                      />
                    </box>
                    <text
                      content={fitLine(
                        `${executionPorts.length ? `◉ ${executionPorts.map(portAddress).join(" ")}  ` : ""}${execution.projectName}`,
                        paneLogWidth,
                      )}
                      style={{
                        fg: executionPorts.length ? COLORS.success : COLORS.muted,
                      }}
                    />
                  </box>
                  <box
                    style={{
                      flexGrow: 1,
                      flexShrink: 1,
                      backgroundColor: COLORS.canvas,
                    }}
                  >
                    {paneLogs.map((log) => {
                      const presentation = runnerLogPresentation(log, COLORS)
                      return (
                        <text
                          key={log.id}
                          content={fitLine(
                            `${showTimestamps ? `${new Date(log.at).toLocaleTimeString("pt-BR", { hour12: false })} ` : ""}${presentation.prefix} ${log.text}`,
                            paneLogWidth,
                          )}
                          style={{
                            fg: presentation.color,
                            bg: COLORS.canvas,
                          }}
                        />
                      )
                    })}
                  </box>
                </box>
              </Button>
            )
          })}
          {hiddenMultiAfter ? (
            <Button onPress={() => slideMultiWindow(1)} width={multiRailWidth} flexShrink={0}>
              <box
                style={{
                  width: multiRailWidth,
                  flexGrow: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  ...panelBorder(COLORS.runner),
                  backgroundColor: COLORS.panelRaised,
                }}
              >
                <text content={`+${hiddenMultiAfter}`} style={{ fg: COLORS.text }} />
                <text content=">" style={{ fg: COLORS.runner }} />
              </box>
            </Button>
          ) : null}
        </box>
      ) : (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <text content="Nenhum processo ativo para monitorar." style={{ fg: COLORS.text }} />
          <ShortcutText
            content="Pressione [M] para voltar ao modo único."
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
    </box>
  )
}
