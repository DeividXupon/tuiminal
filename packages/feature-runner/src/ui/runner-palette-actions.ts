import type { InputRenderable } from "@opentui/core"
import { paletteAction } from "@xupon/tuiminal-core/ui/use-action-palette"
import type * as React from "react"
import type { RunnerEnvironmentProfile } from "../model/config"
import type { RunnerExecution } from "../model/execution"
import type { logPreferencesReducer } from "../model/log-preferences"
import type { RunnerCommand } from "../model/types"
import type { RunnerListMode, RunnerViewMode } from "../model/workspace"

export type RunnerPaletteActionsProps = {
  boxSelection: {
    open: boolean
    openSelection: () => void
    overlay: (id: string) => React.ReactNode
    focusNode: React.ReactNode
  }
  toggleCommand: (command?: RunnerCommand) => void
  selectedCommand: RunnerCommand | undefined
  stopSelectedExecution: () => void
  selectedExecution: RunnerExecution | undefined
  setListMode: React.Dispatch<React.SetStateAction<RunnerListMode>>
  setNarrowPane: React.Dispatch<React.SetStateAction<"commands" | "log">>
  manualInputRef: React.RefObject<InputRenderable | null>
  setConfigurationOpen: React.Dispatch<React.SetStateAction<boolean>>
  projectAvailable: boolean | null
  openProjectPicker: () => Promise<void>
  refreshCommands: () => Promise<void>
  loading: boolean
  cycleEnvironmentProfile: () => void
  environmentProfiles: RunnerEnvironmentProfile[]
  deleteSelectedSavedCommand: () => void
  toggleViewMode: () => void
  toggleHistoryPane: () => void
  viewMode: RunnerViewMode
  openLogFilter: () => void
  cycleLogStream: () => void
  dispatchLogPreferences: React.ActionDispatch<
    [action: Parameters<typeof logPreferencesReducer>[1]]
  >
  copySelectedLogs: () => void
  exportSelectedLogs: () => void
  clearSelectedLogs: () => void
  processInputRef: React.RefObject<InputRenderable | null>
  selectedProcessHandle: { interactive: boolean } | undefined
  openSelectedPort: () => void
  selectedPortUrl: string | null
  copySelectedPort: () => void
  sendSelectedPortToHttp: () => void
  onOpenHttp: ((url: string) => void) | undefined
}
export function runnerPaletteActions({
  boxSelection,
  toggleCommand,
  selectedCommand,
  stopSelectedExecution,
  selectedExecution,
  setListMode,
  setNarrowPane,
  manualInputRef,
  setConfigurationOpen,
  projectAvailable,
  openProjectPicker,
  refreshCommands,
  loading,
  cycleEnvironmentProfile,
  environmentProfiles,
  deleteSelectedSavedCommand,
  toggleViewMode,
  toggleHistoryPane,
  viewMode,
  openLogFilter,
  cycleLogStream,
  dispatchLogPreferences,
  copySelectedLogs,
  exportSelectedLogs,
  clearSelectedLogs,
  processInputRef,
  selectedProcessHandle,
  openSelectedPort,
  selectedPortUrl,
  copySelectedPort,
  sendSelectedPortToHttp,
  onOpenHttp,
}: RunnerPaletteActionsProps) {
  return [
    paletteAction(
      "choose-box",
      "[M]",
      "Escolher box",
      "Pressione [Enter] para focar",
      "NAVEGAÇÃO",
      boxSelection.openSelection,
    ),
    paletteAction(
      "open",
      "[Enter/Space]",
      "Iniciar ou parar comando",
      "Inicia o comando selecionado ou para sua execução ativa.",
      "COMANDOS",
      () => toggleCommand(selectedCommand),
      !selectedCommand && "Selecione um comando",
    ),
    paletteAction(
      "stop",
      "",
      "Parar processo",
      "Para a execução selecionada e cancela seus reinícios.",
      "PROCESSOS",
      stopSelectedExecution,
      selectedExecution?.status !== "running" && "Nenhum processo em execução",
    ),
    paletteAction(
      "manual",
      "[/]",
      "Comando manual",
      "Digite um comando sem executá-lo automaticamente.",
      "COMANDOS",
      () => {
        setListMode("commands")
        setNarrowPane("commands")
        setTimeout(() => manualInputRef.current?.focus(), 0)
      },
    ),
    paletteAction(
      "configuration",
      "[Ctrl+Y]",
      "Configuração",
      "Edite comandos, fluxos e perfis no YAML local.",
      "COMANDOS",
      () => setConfigurationOpen(true),
      projectAvailable === false && "Escolha um projeto",
    ),
    paletteAction(
      "project",
      "[N]",
      "Escolher projeto",
      "Abre o seletor de projetos.",
      "NAVEGAÇÃO",
      () => void openProjectPicker(),
    ),
    paletteAction(
      "refresh",
      "[D]",
      "Atualizar",
      "Detecta novamente os comandos do projeto.",
      "COMANDOS",
      () => void refreshCommands(),
      loading && "Carregando…",
    ),
    paletteAction(
      "environment",
      "[E]",
      "Ambiente",
      "Alterna o perfil de ambiente para novas execuções.",
      "COMANDOS",
      cycleEnvironmentProfile,
      !environmentProfiles.length && "Nenhum perfil disponível",
    ),
    paletteAction(
      "remove",
      "[Delete]",
      "Remover salvo",
      "Remove a definição local do comando salvo.",
      "COMANDOS",
      deleteSelectedSavedCommand,
      selectedCommand?.source !== "saved" && "Selecione um comando salvo",
    ),
    paletteAction(
      "multi",
      "[Shift+M]",
      "Multi",
      "Alterna entre um log e vários processos.",
      "NAVEGAÇÃO",
      toggleViewMode,
    ),
    paletteAction(
      "history",
      "[S]",
      "Histórico",
      "Expande ou recolhe o histórico de execuções.",
      "NAVEGAÇÃO",
      toggleHistoryPane,
    ),
    paletteAction(
      "filter",
      viewMode === "multi" ? "[Shift+F]" : "[F]",
      "Filtrar logs",
      "Filtra o texto do log selecionado.",
      "LOG",
      openLogFilter,
      !selectedExecution && "Selecione uma execução",
    ),
    paletteAction(
      "stream",
      "[V]",
      "Stream",
      "Alterna entre stdout, stderr e todos os eventos.",
      "LOG",
      cycleLogStream,
    ),
    paletteAction(
      "timestamps",
      "[T]",
      "Horários",
      "Mostra ou oculta os horários no log.",
      "LOG",
      () => dispatchLogPreferences({ type: "toggle-timestamps" }),
    ),
    paletteAction(
      "copy",
      "[Y]",
      "Copiar log",
      "Copia o log filtrado da execução selecionada.",
      "LOG",
      copySelectedLogs,
      !selectedExecution?.logs.length && "Nenhum log disponível",
    ),
    paletteAction(
      "export",
      "[Ctrl+X]",
      "Exportar log",
      "Salva o log selecionado em tuiminal-logs/.",
      "LOG",
      exportSelectedLogs,
      !selectedExecution?.logs.length && "Nenhum log disponível",
    ),
    paletteAction(
      "clear",
      "[C]",
      "Limpar",
      "Limpa os logs da execução selecionada.",
      "LOG",
      clearSelectedLogs,
      !selectedExecution && "Selecione uma execução",
    ),
    paletteAction(
      "input",
      "[I]",
      "Entrada do processo",
      "Foca a entrada do processo selecionado.",
      "PROCESSOS",
      () => processInputRef.current?.focus(),
      !selectedProcessHandle && "Nenhum processo em execução",
    ),
    paletteAction(
      "port-open",
      "[O]",
      "Abrir URL",
      "Abre a porta detectada no navegador.",
      "PROCESSOS",
      openSelectedPort,
      !selectedPortUrl && "sem porta detectada",
    ),
    paletteAction(
      "port-copy",
      "[U]",
      "Copiar URL",
      "Copia a URL da porta detectada.",
      "PROCESSOS",
      copySelectedPort,
      !selectedPortUrl && "sem porta detectada",
    ),
    paletteAction(
      "port-http",
      "[H]",
      "HTTP",
      "Abre a porta detectada na ferramenta HTTP.",
      "PROCESSOS",
      sendSelectedPortToHttp,
      !selectedPortUrl ? "sem porta detectada" : !onOpenHttp && "HTTP indisponível",
    ),
  ]
}
