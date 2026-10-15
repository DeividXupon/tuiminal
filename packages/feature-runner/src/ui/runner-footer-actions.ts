import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RunnerCommandFooterAction } from "./RunnerCommandFooter"

type FooterOptions = {
  selectedCommandState: string | undefined
  hasCommand: boolean
  savedCommand: boolean
  hasProfiles: boolean
  hasExecution: boolean
  hasLogs: boolean
  historyExpanded: boolean
  shortRunner: boolean
  paletteOpen: boolean
  filterActive: boolean
  streamActive: boolean
  showTimestamps: boolean
  focusLogPane: () => void
  focusCommandPane: () => void
  toggleCommand: () => void
  chooseBox: () => void
  toggleViewMode: () => void
  toggleHistoryPane: () => void
  cycleEnvironmentProfile: () => void
  deleteSelectedSavedCommand: () => void
  openConfiguration: () => void
  openPalette: () => void
  openFilter: () => void
  cycleLogStream: () => void
  toggleTimestamps: () => void
  copySelectedLogs: () => void
  exportSelectedLogs: () => void
  clearSelectedLogs: () => void
}

export function runnerFooterActions(options: FooterOptions) {
  const {
    selectedCommandState,
    hasCommand,
    savedCommand,
    hasProfiles,
    hasExecution,
    hasLogs,
    historyExpanded,
    shortRunner,
    paletteOpen,
    filterActive,
    streamActive,
    showTimestamps,
    focusLogPane,
    focusCommandPane,
    toggleCommand,
    chooseBox,
    toggleViewMode,
    toggleHistoryPane,
    cycleEnvironmentProfile,
    deleteSelectedSavedCommand,
    openConfiguration,
    openPalette,
    openFilter,
    cycleLogStream,
    toggleTimestamps,
    copySelectedLogs,
    exportSelectedLogs,
    clearSelectedLogs,
  } = options
  const selectedCommandActive =
    selectedCommandState === "running" || selectedCommandState === "stopping"
  const output: RunnerCommandFooterAction[] = [
    {
      id: "runner-footer-copy",
      label: "[Y] Copiar log",
      disabled: !hasLogs,
      onPress: copySelectedLogs,
    },
    {
      id: "runner-footer-export",
      label: "[X] Exportar log",
      disabled: !hasLogs,
      onPress: exportSelectedLogs,
    },
    {
      id: "runner-footer-clear",
      label: "[C] Limpar",
      disabled: !hasExecution,
      onPress: clearSelectedLogs,
    },
  ]
  const commands: RunnerCommandFooterAction[] = [
    { id: "runner-footer-log", label: "[L/→] Log", onPress: focusLogPane },
    {
      id: "runner-footer-open",
      label: selectedCommandActive ? "[↵/Spc] Parar" : "[↵/Spc] Rodar",
      accent: selectedCommandActive ? COLORS.danger : COLORS.runner,
      disabled: !hasCommand || selectedCommandState === "stopping",
      onPress: toggleCommand,
    },
    { id: "runner-footer-box", label: "[M] Escolher box", onPress: chooseBox },
    { id: "runner-footer-multi", label: "[Shift+M] Multi", onPress: toggleViewMode },
    {
      id: "runner-footer-history",
      label: historyExpanded ? "[S] Recolher" : "[S] Histórico",
      disabled: shortRunner,
      onPress: toggleHistoryPane,
    },
    {
      id: "runner-footer-environment",
      label: "[E] Ambiente",
      disabled: !hasProfiles,
      onPress: cycleEnvironmentProfile,
    },
    {
      id: "runner-footer-remove",
      label: "[Del] Remover salvo",
      disabled: !savedCommand,
      onPress: deleteSelectedSavedCommand,
    },
    {
      id: "runner-configuration",
      label: "[Ctrl+Y] Config",
      onPress: openConfiguration,
    },
    ...output,
    {
      id: "runner-action-palette-open",
      label: "[?] Ações",
      active: paletteOpen,
      onPress: openPalette,
    },
  ]
  const log: RunnerCommandFooterAction[] = [
    { id: "runner-footer-list", label: "[H/←] Lista", onPress: focusCommandPane },
    { id: "runner-footer-scroll", label: "[J/K] Rolar" },
    {
      id: "runner-footer-filter",
      label: "[F] Filtro",
      active: filterActive,
      disabled: !hasExecution,
      onPress: openFilter,
    },
    {
      id: "runner-footer-stream",
      label: "[V] Stream",
      active: streamActive,
      onPress: cycleLogStream,
    },
    {
      id: "runner-footer-timestamps",
      label: "[T] Horários",
      active: showTimestamps,
      onPress: toggleTimestamps,
    },
    ...output,
    { id: "runner-footer-box", label: "[M] Escolher box", onPress: chooseBox },
    { id: "runner-footer-multi", label: "[Shift+M] Multi", onPress: toggleViewMode },
    ...(shortRunner
      ? []
      : [
          {
            id: "runner-footer-history",
            label: historyExpanded ? "[S] Recolher" : "[S] Histórico",
            onPress: toggleHistoryPane,
          },
        ]),
    {
      id: "runner-action-palette-open",
      label: "[?] Ações",
      active: paletteOpen,
      onPress: openPalette,
    },
  ]
  return { commands, log }
}
