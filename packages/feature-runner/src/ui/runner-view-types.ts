import type {
  BoxRenderable,
  InputRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  StyledText,
} from "@opentui/core"
import type * as React from "react"
import type { RunnerExecution } from "../model/execution"
import type { RunnerLogEntry, RunnerLogStreamFilter } from "../model/log"
import type { logPreferencesReducer } from "../model/log-preferences"
import type { RunnerFocusPane } from "../model/navigation"
import type { RunnerNotice } from "../model/notice"
import type { RunnerCommand } from "../model/types"
import type { ProjectPickerMode, RunnerListMode, RunnerViewMode } from "../model/workspace"
import type { RunnerStatusOption } from "../rendering/status-select"
import type { RunnerCommandFooterAction } from "./RunnerCommandFooter"
export type RunnerCommandPanelProps = {
  id?: string
  commandPanelRef: React.RefObject<BoxRenderable | null>
  focusPane: RunnerFocusPane
  compactCommandHeader: boolean
  listMode: RunnerListMode
  commands: RunnerCommand[]
  setListMode: React.Dispatch<React.SetStateAction<RunnerListMode>>
  commandListRef: React.RefObject<SelectRenderable | null>
  activeExecutions: RunnerExecution[]
  setSelectedExecutionId: React.Dispatch<React.SetStateAction<string | null>>
  processListRef: React.RefObject<SelectRenderable | null>
  loading: boolean
  refreshCommands: () => Promise<void>
  commandPanelWidth: number
  setFocusPane: React.Dispatch<React.SetStateAction<RunnerFocusPane>>
  manualInputRef: React.RefObject<InputRenderable | null>
  manualCommand: string
  setManualCommand: React.Dispatch<React.SetStateAction<string>>
  runManualCommand: (value?: string) => void
  openSaveCommandModal: () => void
  processOptions: RunnerStatusOption[]
  selectedExecution: RunnerExecution | undefined
  narrowRunner: boolean
  setNarrowPane: React.Dispatch<React.SetStateAction<"commands" | "log">>
  discoveryError: string | null
  commandOptions: RunnerStatusOption[]
  selectedCommandIndex: number
  selectCommand: (commandId: string) => void
  toggleCommand: (command?: RunnerCommand) => void
  openProjectPicker: () => Promise<void>
  selectedCommand: RunnerCommand | undefined
  showCommandDetails: boolean
  selectedCommandExecution: RunnerExecution | undefined
  boxSelection: {
    open: boolean
    openSelection: () => void
    overlay: (id: string) => React.ReactNode
    focusNode: React.ReactNode
  }
}
export type RunnerLogPanelProps = {
  id?: string
  focusPane: RunnerFocusPane
  shortRunner: boolean
  runnerNotice: RunnerNotice | null
  logWidth: number
  selectedExecution: RunnerExecution | undefined
  now: number
  logFilterOpen: boolean
  attachLogFilter: (input: InputRenderable | null) => (() => void) | undefined
  logFilter: string
  dispatchLogPreferences: React.ActionDispatch<
    [action: Parameters<typeof logPreferencesReducer>[1]]
  >
  submitLogFilter: () => void
  logFilterRef: React.RefObject<InputRenderable | null>
  logStream: RunnerLogStreamFilter
  logScrollRef: React.RefObject<ScrollBoxRenderable | null>
  selectedLogs: RunnerLogEntry[]
  selectedLogDocument: StyledText
  logHeight: number
  boxSelection: {
    open: boolean
    openSelection: () => void
    overlay: (id: string) => React.ReactNode
    focusNode: React.ReactNode
  }
  selectedProcessHandle: { interactive: boolean } | undefined
  processInputRef: React.RefObject<InputRenderable | null>
  processInput: string
  setProcessInput: React.Dispatch<React.SetStateAction<string>>
  submitProcessInput: () => void
  setFocusPane: React.Dispatch<React.SetStateAction<RunnerFocusPane>>
  historyExpanded: boolean
  historyPanelRef: React.RefObject<BoxRenderable | null>
  historyPanelHeight: number
  toggleHistoryPane: () => void
  historyOptions: RunnerStatusOption[]
  historyListRef: React.RefObject<SelectRenderable | null>
  selectedHistoryIndex: number
  setSelectedExecutionId: React.Dispatch<React.SetStateAction<string | null>>
  focusLogPane: () => void
  projectExecutions: RunnerExecution[]
}
export type RunnerFooterProps = {
  id?: string
  footerHeight: number
  pickerMode: ProjectPickerMode
  projectAvailable: boolean | null
  focusPane: RunnerFocusPane
  actionPalette: { isOpen: boolean; open: () => void }
  projectSearchRef: React.RefObject<InputRenderable | null>
  setPickerMode: React.Dispatch<React.SetStateAction<ProjectPickerMode>>
  setProjectSearch: React.Dispatch<React.SetStateAction<string>>
  openProjectPicker: () => Promise<void>
  historyExpanded: boolean
  focusCommandPane: () => void
  focusLogPane: () => void
  toggleHistoryPane: () => void
  viewMode: RunnerViewMode
  logFooterActions: RunnerCommandFooterAction[]
  boxSelection: {
    open: boolean
    openSelection: () => void
    overlay: (id: string) => React.ReactNode
    focusNode: React.ReactNode
  }
  toggleViewMode: () => void
  activeExecutions: RunnerExecution[]
  cycleActiveExecution: (direction: number) => void
  selectedExecution: RunnerExecution | undefined
  stopSelectedExecution: () => void
  listMode: RunnerListMode
  narrowRunner: boolean
  setNarrowPane: React.Dispatch<React.SetStateAction<"commands" | "log">>
  footerActions: {
    commands: RunnerCommandFooterAction[]
    log: RunnerCommandFooterAction[]
    filter: RunnerCommandFooterAction[]
  }
}
