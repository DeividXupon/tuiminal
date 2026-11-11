import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { FocusSelectionOverlay } from "@xupon/tuiminal-core/ui/FocusSelectionOverlay"
import { runnerHistoryPanelHeight } from "../model/navigation"
import {
  EMPTY_RUNNER_SUMMARY,
  latestRunnerExecutions,
  runnerProjectSummaries,
  runnerVisualStatus,
} from "../model/status"
import { RUNNER_CATEGORY_ICONS } from "../model/workspace"
import { buildRunnerLogDocument, filterRunnerLogs } from "../rendering/log-document"
import { commandKey, fitLine, formatDuration, portAddress } from "../rendering/presentation"
import { runnerExecutionLabel, runnerStatusMarker, runnerSummaryParts } from "../rendering/status"
import { runnerCommandFooterHeight } from "../ui/RunnerCommandFooter"
import { runnerFooterActions } from "../ui/runner-footer-actions"
import {
  runnerCommandWidth,
  runnerContentHeight,
  runnerHeaderLayout,
  runnerLogWidth,
  runnerMultiCapacity,
  runnerMultiLayout,
} from "../ui/runner-layout"
import { noop, TUTORIAL_COMMANDS, TUTORIAL_NOW, TUTORIAL_ROOT, tutorialExecution } from "./fixtures"

function tutorialScene(scene: string, terminal: { width: number; height: number }) {
  const narrowRunner = terminal.width < 72
  const shortRunner = terminal.height < 24
  const idle = ["workspace", "commands", "projects", "manual", "finale"].includes(scene)
  const historyExpanded = scene === "history" && !shortRunner
  const listMode =
    scene === "processes" || scene === "ports" ? ("active" as const) : ("commands" as const)
  const viewMode = scene === "multi" ? ("multi" as const) : ("single" as const)
  const focusPane = ["running", "stopped", "logs", "filter", "history", "focus"].includes(scene)
    ? ("log" as const)
    : ("commands" as const)
  const narrowPane = scene === "multi" ? "log" : focusPane
  return {
    narrowRunner,
    shortRunner,
    idle,
    historyExpanded,
    listMode,
    viewMode,
    focusPane,
    narrowPane,
  }
}

export function tutorialWorkspaceState(scene: string, terminal: { width: number; height: number }) {
  const {
    narrowRunner,
    shortRunner,
    idle,
    historyExpanded,
    listMode,
    viewMode,
    focusPane,
    narrowPane,
  } = tutorialScene(scene, terminal)
  const executions = idle
    ? []
    : TUTORIAL_COMMANDS.map((_, i) => tutorialExecution(i, scene === "stopped" && i === 0))
  const activeExecutions = executions.filter((e) => e.status === "running")
  const selectedExecution = executions[scene === "history" ? 2 : 0]
  const latest = latestRunnerExecutions(executions)
  const projectSummaries = runnerProjectSummaries(executions, latest)
  const projectRoot = TUTORIAL_ROOT
  const commands = TUTORIAL_COMMANDS
  const selectedCommand = commands[0]
  const selectedCommandExecution = executions[0]
  const commandPanelWidth = runnerCommandWidth(terminal.width)
  const logWidth = runnerLogWidth(terminal.width, commandPanelWidth)
  const { footerActions, logFooterActions, footerHeight } = tutorialFooter(scene, terminal, {
    idle,
    historyExpanded,
    viewMode,
    focusPane,
    listMode,
  })
  const runnerPanelHeight = runnerContentHeight(terminal, footerHeight)
  const historyPanelHeight = historyExpanded
    ? runnerHistoryPanelHeight(executions.length, shortRunner)
    : shortRunner
      ? 0
      : 1
  const selectedLogs = filterRunnerLogs(
    selectedExecution?.logs ?? [],
    "all",
    scene === "filter" ? "GET" : "",
  )
  const summaryParts = runnerSummaryParts(
    commands.length,
    projectSummaries.get(projectRoot) ?? EMPTY_RUNNER_SUMMARY,
    narrowRunner ? 0 : Math.floor(terminal.width / 2),
  )
  const header = runnerHeaderLayout(terminal.width, summaryParts.map((p) => p.text).join(""), 1)
  const project = { path: projectRoot, name: "runner-project", displayPath: projectRoot }
  const listeningPorts = activeExecutions.map((e, i) => ({
    groupId: e.pid ?? 0,
    pid: e.pid ?? 0,
    port: 3000 + i,
    host: "127.0.0.1",
    processName: e.label,
  }))
  const boxSelection = {
    open: scene === "focus",
    openSelection: noop,
    focusNode: null,
    overlay: (id: string) =>
      scene === "focus" ? (
        <FocusSelectionOverlay
          id={`tutorial-${id}`}
          selected={id === "runner-log-panel"}
          onFocus={noop}
        />
      ) : null,
  }
  const visibleMultiExecutions = activeExecutions.slice(0, runnerMultiCapacity(terminal.width))
  const hiddenMultiAfter = activeExecutions.length - visibleMultiExecutions.length
  const multiLayout = runnerMultiLayout(
    terminal.width,
    commandPanelWidth,
    visibleMultiExecutions.length,
    0,
    hiddenMultiAfter,
  )
  return {
    terminal,
    narrowRunner,
    shortRunner,
    narrowPane,
    focusPane,
    viewMode,
    listMode,
    commands,
    projectRoot,
    openedProjects: [project],
    projectSummaries,
    summaryParts,
    ...header,
    switchProject: noop,
    closeProject: noop,
    openProjectPicker: async () => {},
    commandPanelWidth,
    compactCommandHeader: commandPanelWidth < 42,
    activeExecutions,
    selectedExecution,
    selectedCommand,
    selectedCommandExecution,
    commandOptions: commands.map((command) => {
      const execution = latest.get(commandKey(projectRoot, command.id))
      const status = runnerVisualStatus(execution)
      const marker = execution
        ? runnerStatusMarker(status)
        : RUNNER_CATEGORY_ICONS[command.category]
      return {
        name: `${marker} ${command.label}`,
        marker,
        description: command.displayCommand,
        value: command.id,
        status,
      }
    }),
    processOptions: activeExecutions.map((e) => ({
      name: `${runnerExecutionLabel(e)} · ${e.projectName}/${e.label}  ·  ◉ ${listeningPorts
        .filter((p) => p.groupId === e.pid)
        .map(portAddress)
        .join(" ")}`,
      description: "",
      value: e.id,
      status: runnerVisualStatus(e),
    })),
    selectedCommandIndex: 0,
    manualCommand: scene === "manual" ? "bun run smoke" : "",
    loading: false,
    discoveryError: "",
    setListMode: noop,
    setSelectedExecutionId: noop,
    refreshCommands: async () => {},
    setFocusPane: noop,
    setManualCommand: noop,
    runManualCommand: noop,
    openSaveCommandModal: noop,
    setNarrowPane: noop,
    selectCommand: noop,
    toggleCommand: noop,
    showCommandDetails: listMode === "commands" && terminal.height >= 28 && runnerPanelHeight >= 10,
    boxSelection,
    logWidth,
    now: TUTORIAL_NOW,
    runnerNotice:
      scene === "environment" ? { kind: "info" as const, message: "Perfil ativo: local" } : null,
    logFilterOpen: scene === "filter",
    logFilter: scene === "filter" ? "GET" : "",
    logStream: "all" as const,
    attachLogFilter: () => undefined,
    dispatchLogPreferences: noop,
    submitLogFilter: noop,
    selectedLogs,
    selectedLogDocument: buildRunnerLogDocument(selectedLogs, {
      width: logWidth,
      showTimestamps: true,
      palette: COLORS,
    }),
    ...tutorialLogControls(
      scene,
      selectedExecution?.status,
      shortRunner,
      runnerPanelHeight,
      historyPanelHeight,
    ),
    processInput: "",
    setProcessInput: noop,
    submitProcessInput: noop,
    historyExpanded,
    historyPanelHeight,
    toggleHistoryPane: noop,
    historyOptions: executions.map((e) => ({
      name: fitLine(
        `${runnerExecutionLabel(e)} · ${e.label}  ${formatDuration((e.endedAt ?? TUTORIAL_NOW) - e.startedAt)}`,
        logWidth,
      ),
      description: "",
      value: e.id,
      status: runnerVisualStatus(e),
    })),
    selectedHistoryIndex: scene === "history" ? 2 : 0,
    focusLogPane: noop,
    focusCommandPane: noop,
    projectExecutions: executions,
    footerHeight,
    footerActions,
    logFooterActions,
    pickerMode: scene === "projects" ? ("projects" as const) : ("closed" as const),
    projectAvailable: true,
    actionPalette: { isOpen: false, open: noop },
    setPickerMode: noop,
    setProjectSearch: noop,
    toggleViewMode: noop,
    cycleActiveExecution: noop,
    stopSelectedExecution: noop,
    visibleMultiExecutions,
    listeningPorts,
    multiOffset: 0,
    hiddenMultiBefore: 0,
    hiddenMultiAfter,
    ...multiLayout,
    multiLogHeight: Math.max(4, runnerPanelHeight - 6),
    slideMultiWindow: noop,
    showTimestamps: true,
  }
}

function tutorialLogControls(
  scene: string,
  status: string | undefined,
  short: boolean,
  height: number,
  history: number,
) {
  const selectedProcessHandle = status === "running" ? { interactive: false } : undefined
  return {
    selectedProcessHandle,
    logHeight: Math.max(
      short ? 2 : 5,
      height - 4 - (scene === "filter" ? 1 : 0) - (selectedProcessHandle ? 1 : 0) - history,
    ),
  }
}

function tutorialFooter(
  scene: string,
  terminal: { width: number; height: number },
  state: Pick<
    ReturnType<typeof tutorialScene>,
    "idle" | "historyExpanded" | "viewMode" | "focusPane" | "listMode"
  >,
) {
  const { idle, historyExpanded, viewMode, focusPane, listMode } = state
  const footerActions = runnerFooterActions({
    selectedCommandState: idle ? undefined : scene === "stopped" ? "stopped" : "running",
    hasCommand: true,
    savedCommand: false,
    hasProfiles: true,
    hasExecution: !idle,
    hasLogs: !idle,
    historyExpanded: historyExpanded,
    shortRunner: terminal.height < 24,
    paletteOpen: false,
    filterActive: scene === "filter",
    streamActive: false,
    showTimestamps: true,
    focusLogPane: noop,
    focusCommandPane: noop,
    toggleCommand: noop,
    chooseBox: noop,
    toggleViewMode: noop,
    toggleHistoryPane: noop,
    cycleEnvironmentProfile: noop,
    deleteSelectedSavedCommand: noop,
    openConfiguration: noop,
    openPalette: noop,
    openFilter: noop,
    submitFilter: noop,
    closeFilter: noop,
    cycleLogStream: noop,
    toggleTimestamps: noop,
    copySelectedLogs: noop,
    exportSelectedLogs: noop,
    clearSelectedLogs: noop,
  })
  const logFooterActions = scene === "filter" ? footerActions.filter : footerActions.log
  const footerHeight =
    viewMode === "single" && (focusPane === "log" || listMode === "commands")
      ? runnerCommandFooterHeight(
          focusPane === "log" ? logFooterActions : footerActions.commands,
          terminal.width - LAYOUT.outerPadding * 2,
        )
      : 1
  return { footerActions, logFooterActions, footerHeight }
}
