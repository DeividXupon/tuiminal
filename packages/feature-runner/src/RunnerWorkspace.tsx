import { homedir } from "node:os"
import { basename, dirname } from "node:path"
import type {
  BoxRenderable,
  InputRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
} from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, LAYOUT, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { isActionPaletteKey } from "@xupon/tuiminal-core/ui/action-palette"
import { directionalShortcutDirection } from "@xupon/tuiminal-core/ui/directional-shortcut"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { MountWhen } from "@xupon/tuiminal-core/ui/MountWhen"
import { useActionPalette } from "@xupon/tuiminal-core/ui/use-action-palette"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { useRunnerAutostart } from "./hooks/use-runner-autostart"
import { useRunnerBoxSelection } from "./hooks/use-runner-box-selection"
import { useRunnerExecution } from "./hooks/use-runner-execution"
import { useRunnerLogBuffer } from "./hooks/use-runner-log-buffer"
import { useRunnerLogFilter } from "./hooks/use-runner-log-filter"
import { useRunnerNotifications } from "./hooks/use-runner-notifications"
import { useRunnerPlans } from "./hooks/use-runner-plans"
import type { ExecutionLog, RunnerExecution } from "./model/execution"
import { INITIAL_LOG_PREFERENCES, logPreferencesReducer } from "./model/log-preferences"
import {
  type RunnerFocusPane,
  runnerFocusDestination,
  runnerHistoryPanelHeight,
  runnerLogIsAtBottom,
  runnerProjectCloseResult,
  runnerProjectPickerShortcut,
} from "./model/navigation"
import type { RunnerNotice } from "./model/notice"
import type { RunnerFlow } from "./model/plan"
import {
  EMPTY_RUNNER_SUMMARY,
  latestRunnerExecutions,
  runnerProjectSummaries,
  runnerVisualStatus,
} from "./model/status"
import {
  type ProjectPickerMode,
  RUNNER_CATEGORY_ICONS,
  RUNNER_DIRECTORY_PICKER_OPTION,
  RUNNER_PROJECT_TAB_SHORTCUTS,
  RUNNER_USE_DIRECTORY_OPTION,
  type RunnerListMode,
  type RunnerViewMode,
  type RunnerWorkspaceProps,
} from "./model/workspace"
import {
  buildRunnerLogDocument,
  filterRunnerLogs,
  serializeRunnerLogs,
} from "./rendering/log-document"
import { commandKey, fitLine, formatDuration, portAddress } from "./rendering/presentation"
import { runnerExecutionLabel, runnerStatusMarker, runnerSummaryParts } from "./rendering/status"
import type { RunnerStatusOption } from "./rendering/status-select"
import {
  createShellRunnerCommand,
  discoverRunnerListeningPorts,
  discoverRunnerProjects,
  listRunnerDirectories,
  openRunnerUrl,
  RUNNER_WORKING_DIRECTORY,
  type RunnerCommand,
  type RunnerDirectoryEntry,
  type RunnerListeningPort,
  type RunnerOutputStream,
  type RunnerProject,
  resolveRunnerProjectContext,
  resolveRunnerSessionScope,
} from "./services/runner"
import { restoredRunnerExecution } from "./state/restored-execution"
import {
  exportRunnerLog,
  loadRunnerStartupState,
  normalizeRunnerManualCommand,
  type RunnerEnvironmentProfile,
  type RunnerSessionState,
  removeSavedRunnerCommand,
  runnerPortUrl,
  saveRunnerCommand,
  saveRunnerSession,
} from "./storage/runner-config"
import { withRunnerTutorial } from "./tutorial/RunnerTutorialBoundary"
import { MultiProcessPanel } from "./ui/MultiProcessPanel"
import { RunnerAutostartTrustModal } from "./ui/RunnerAutostartTrustModal"
import { runnerCommandFooterHeight } from "./ui/RunnerCommandFooter"
import { RunnerCommandPanel } from "./ui/RunnerCommandPanel"
import { RunnerConfiguration } from "./ui/RunnerConfiguration"
import { RunnerFooter } from "./ui/RunnerFooter"
import { RunnerHeader } from "./ui/RunnerHeader"
import { RunnerCommandColumn, RunnerPanels, RunnerSurface } from "./ui/RunnerLayout"
import { RunnerLogPanel } from "./ui/RunnerLogPanel"
import { RunnerProjectPicker } from "./ui/RunnerProjectPicker"
import { type RunnerCommandSaveInput, RunnerSaveCommandModal } from "./ui/RunnerSaveCommandModal"
import { runnerFooterActions } from "./ui/runner-footer-actions"
import {
  runnerCommandWidth,
  runnerContentHeight,
  runnerHeaderLayout,
  runnerLogWidth,
  runnerMultiCapacity,
  runnerMultiLayout,
} from "./ui/runner-layout"
import { runnerPaletteActions } from "./ui/runner-palette-actions"
export const Runner = withRunnerTutorial(RunnerLive)
function RunnerLive({ active, onOpenHttp }: RunnerWorkspaceProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const shortRunner = terminal.height < 24
  const narrowRunner = terminal.width < 72
  const commandListRef = useRef<SelectRenderable | null>(null)
  const processListRef = useRef<SelectRenderable | null>(null)
  const manualInputRef = useRef<InputRenderable | null>(null)
  const processInputRef = useRef<InputRenderable | null>(null)
  const commandPanelRef = useRef<BoxRenderable | null>(null)
  const logScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const historyPanelRef = useRef<BoxRenderable | null>(null)
  const historyListRef = useRef<SelectRenderable | null>(null)
  const projectListRef = useRef<SelectRenderable | null>(null)
  const directoryListRef = useRef<SelectRenderable | null>(null)
  const projectSearchRef = useRef<InputRenderable | null>(null)
  const logSequence = useRef(0)
  const discoverySequence = useRef(0)
  const discoveredProjectRootRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const [initialProjectRoot] = useState(() => resolveRunnerSessionScope(RUNNER_WORKING_DIRECTORY))
  const [initialState] = useState(() => loadRunnerStartupState(initialProjectRoot))
  const initialSession: RunnerSessionState = initialState.session
  const [projectRoot, setProjectRoot] = useState(initialProjectRoot)
  const [openedProjects, setOpenedProjects] = useState<RunnerProject[]>(() => {
    const paths = [
      initialProjectRoot,
      ...initialSession.openedProjects.filter((path) => path !== initialProjectRoot),
    ]
    return paths.slice(0, RUNNER_PROJECT_TAB_SHORTCUTS.length).map((path) => ({
      path,
      name: basename(path),
      displayPath: path,
    }))
  })
  const [configurationOpen, setConfigurationOpen] = useState(false)
  const [flows, setFlows] = useState<RunnerFlow[]>([])
  const [commands, setCommands] = useState<RunnerCommand[]>([])
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null)
  const [executions, setExecutions] = useState<RunnerExecution[]>(() =>
    initialState.history.map(restoredRunnerExecution),
  )
  const {
    begin: beginLogs,
    append: bufferLog,
    finish: finishLogs,
    clear: clearLogs,
  } = useRunnerLogBuffer(setExecutions)
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectAvailable, setProjectAvailable] = useState<boolean | null>(null)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [manualCommand, setManualCommand] = useState("")
  const [saveCommandModalOpen, setSaveCommandModalOpen] = useState(false)
  const focusSuspendedRef = useRef(false)
  focusSuspendedRef.current = configurationOpen || saveCommandModalOpen
  const [viewMode, setViewMode] = useState<RunnerViewMode>("single")
  const [listMode, setListMode] = useState<RunnerListMode>("commands")
  const [focusPane, setFocusPane] = useState<RunnerFocusPane>("commands")
  const actionPalette = useActionPalette({
    id: "runner-action-palette",
    active: Boolean(active) && !configurationOpen && !saveCommandModalOpen,
    restoreFocus: () => {
      if (focusPane === "log") focusLogPane()
      else if (focusPane === "history") focusHistoryPane()
      else focusCommandPane()
    },
  })
  focusSuspendedRef.current ||= actionPalette.isOpen
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [environmentProfiles, setEnvironmentProfiles] = useState<RunnerEnvironmentProfile[]>([])
  const [profileSelections, setProfileSelections] = useState<Record<string, string>>(
    initialSession.environmentProfiles,
  )
  const [
    { filter: logFilter, stream: logStream, timestamps: showTimestamps },
    dispatchLogPreferences,
  ] = useReducer(logPreferencesReducer, INITIAL_LOG_PREFERENCES)
  const [logFilterOpen, setLogFilterOpen] = useState(false)
  const {
    inputRef: logFilterRef,
    attach: attachLogFilter,
    focused: logFilterFocused,
    open: openLogFilter,
  } = useRunnerLogFilter(setLogFilterOpen)
  const [processInput, setProcessInput] = useState("")
  const [runnerNotice, setRunnerNotice] = useState<RunnerNotice | null>(null)
  const [multiOffset, setMultiOffset] = useState(0)
  const [listeningPorts, setListeningPorts] = useState<RunnerListeningPort[]>([])
  const [pickerMode, setPickerMode] = useState<ProjectPickerMode>("closed")
  const [projects, setProjects] = useState<RunnerProject[]>([])
  const [projectSearch, setProjectSearch] = useState("")
  const [narrowPane, setNarrowPane] = useState<"commands" | "log">("commands")
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectPickerError, setProjectPickerError] = useState<string | null>(null)
  useWorkspaceRepaint(
    JSON.stringify([
      projectRoot,
      configurationOpen,
      pickerMode,
      viewMode,
      listMode,
      historyExpanded,
      narrowPane,
    ]),
  )
  const [browserDirectory, setBrowserDirectory] = useState(homedir())
  const [directoryEntries, setDirectoryEntries] = useState<RunnerDirectoryEntry[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [now, setNow] = useState(Date.now())
  const notify = useRunnerNotifications(runnerNotice, discoveryError, projectPickerError)

  const refreshCommands = useCallback(async () => {
    const sequence = discoverySequence.current + 1
    discoverySequence.current = sequence
    setLoading(true)
    setDiscoveryError(null)
    try {
      const context = await resolveRunnerProjectContext(projectRoot)
      if (!mountedRef.current || discoverySequence.current !== sequence) return
      if (!context) {
        discoveredProjectRootRef.current = projectRoot
        setProjectAvailable(false)
        setCommands([])
        setFlows([])
        setEnvironmentProfiles([])
        setSelectedCommandId(null)
        setDiscoveryError(
          "Nenhum projeto encontrado nesta pasta. Entre em um projeto ou escolha uma pasta.",
        )
        return
      }
      const resolvedRoot = context.root
      discoveredProjectRootRef.current = resolvedRoot
      setProjectAvailable(true)
      if (resolvedRoot !== projectRoot) {
        setProjectRoot(resolvedRoot)
        setOpenedProjects((current) => {
          const replaced = current.map((project) =>
            project.path === projectRoot
              ? { path: resolvedRoot, name: basename(resolvedRoot), displayPath: resolvedRoot }
              : project,
          )
          return replaced.filter(
            (project, index) =>
              replaced.findIndex((candidate) => candidate.path === project.path) === index,
          )
        })
      }
      setCommands(context.commands)
      setFlows(context.flows)
      setEnvironmentProfiles(context.environmentProfiles)
      setSelectedCommandId((current) =>
        context.commands.some((command) => command.id === current)
          ? current
          : (context.commands[0]?.id ?? null),
      )
    } catch (error) {
      if (!mountedRef.current || discoverySequence.current !== sequence) return
      setDiscoveryError(
        error instanceof Error ? error.message : "Não foi possível detectar os comandos.",
      )
    } finally {
      if (mountedRef.current && discoverySequence.current === sequence) {
        setLoading(false)
      }
    }
  }, [projectRoot])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    saveRunnerSession(initialProjectRoot, {
      openedProjects: openedProjects.map((project) => project.path),
      activeProject: projectRoot,
      viewMode,
      environmentProfiles: profileSelections,
    })
  }, [initialProjectRoot, openedProjects, profileSelections, projectRoot, viewMode])

  useEffect(() => {
    if (!active || discoveredProjectRootRef.current === projectRoot) return
    void refreshCommands()
  }, [active, projectRoot, refreshCommands])

  useEffect(() => {
    if (!active || focusSuspendedRef.current) return
    if (pickerMode === "projects") {
      if (projectsLoading) projectSearchRef.current?.focus()
      else projectListRef.current?.focus()
      return
    }
    if (pickerMode === "directories") {
      if (directoryLoading) projectSearchRef.current?.focus()
      else directoryListRef.current?.focus()
      return
    }
    if (viewMode === "single" && !loading) commandListRef.current?.focus()
    setFocusPane("commands")
  }, [active, directoryLoading, loading, pickerMode, projectsLoading, viewMode])

  const hasRunningExecutions = executions.some(
    (execution) => execution.status === "running" || execution.status === "stopping",
  )
  useEffect(() => {
    if (!active || !hasRunningExecutions) return
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [active, hasRunningExecutions])

  const runningProcessGroupKey = executions
    .filter(
      (execution) =>
        execution.pid && (execution.status === "running" || execution.status === "stopping"),
    )
    .map((execution) => execution.pid as number)
    .join(":")

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const runningProcessGroupIds = runningProcessGroupKey
      .split(":")
      .filter(Boolean)
      .map((pid) => Number.parseInt(pid, 10))
    if (!runningProcessGroupIds.length) {
      setListeningPorts([])
      return
    }
    const refreshPorts = async () => {
      try {
        const ports = await discoverRunnerListeningPorts(runningProcessGroupIds, controller.signal)
        if (!controller.signal.aborted && mountedRef.current) setListeningPorts(ports)
      } catch {
        // A background probe failure must not hide the last known ports.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refreshPorts(), 1500)
      }
    }
    void refreshPorts()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [active, runningProcessGroupKey])

  const appendLog = useCallback(
    (executionId: string, text: string, stream: RunnerOutputStream | "system") => {
      if (!mountedRef.current) return
      if (!text.trim()) return
      const log: ExecutionLog = {
        id: logSequence.current,
        text,
        stream,
        at: Date.now(),
      }
      logSequence.current += 1
      bufferLog(executionId, log)
    },
    [bufferLog],
  )

  const onExecutionStarted = useCallback(
    (id: string) => {
      setSelectedExecutionId(id)
      if (narrowRunner) setNarrowPane("log")
    },
    [narrowRunner],
  )
  const { launchCommand, handlesRef } = useRunnerExecution({
    projectRoot,
    environmentProfiles,
    profileSelections,
    setExecutions,
    setNow,
    appendLog,
    beginLogs,
    finishLogs,
    logSequence,
    notify,
    onStarted: onExecutionStarted,
  })
  const { runCommand, runTargets, runFlow, stopFlow, restartFlow, flowStates } = useRunnerPlans({
    projectRoot,
    commands,
    launchCommand,
    notify,
  })

  const runManualCommand = useCallback(
    (value = manualCommand) => {
      const command = normalizeRunnerManualCommand(value)
      if (!command) return
      runCommand(createShellRunnerCommand(command))
      setManualCommand("")
      if (manualInputRef.current) manualInputRef.current.value = ""
      commandListRef.current?.focus()
    },
    [manualCommand, runCommand],
  )

  const openSaveCommandModal = useCallback(() => {
    if (!manualCommand.trim()) return
    setRunnerNotice(null)
    setSaveCommandModalOpen(true)
  }, [manualCommand])

  const confirmSaveManualCommand = useCallback(
    (input: RunnerCommandSaveInput) => {
      const saved = saveRunnerCommand(projectRoot, input)
      setSaveCommandModalOpen(false)
      setManualCommand("")
      if (manualInputRef.current) manualInputRef.current.value = ""
      setRunnerNotice({ message: `Comando salvo: ${saved.label}`, kind: "success" })
      setSelectedCommandId(saved.id)
      void refreshCommands()
      setTimeout(() => commandListRef.current?.focus(), 0)
    },
    [projectRoot, refreshCommands],
  )

  const selectedProfileId = profileSelections[projectRoot]
  const selectedProfile = environmentProfiles.find((profile) => profile.id === selectedProfileId)
  const {
    pendingReview: pendingAutostartReview,
    approve: approveAutostart,
    dismiss: dismissAutostart,
  } = useRunnerAutostart({
    active: active && !configurationOpen && !saveCommandModalOpen && !actionPalette.isOpen,
    loading,
    projectRoot,
    discoveredProjectRoot: discoveredProjectRootRef.current,
    commands,
    selectedProfile,
    flows,
    profiles: environmentProfiles,
    runFlow,
    runTargets,
    notify,
    setRunnerNotice,
    focusCommands: () => commandListRef.current?.focus(),
  })

  const openProjectPicker = useCallback(async () => {
    setPickerMode("projects")
    setProjectsLoading(true)
    setProjectPickerError(null)
    setProjectSearch("")
    try {
      const discovered = await discoverRunnerProjects(projectRoot)
      if (mountedRef.current) setProjects(discovered)
    } catch (error) {
      if (!mountedRef.current) return
      setProjectPickerError(
        error instanceof Error ? error.message : "Não foi possível procurar projetos Git.",
      )
    } finally {
      if (mountedRef.current) setProjectsLoading(false)
    }
  }, [projectRoot])

  const loadDirectory = useCallback(async (directory: string) => {
    setDirectoryLoading(true)
    setProjectPickerError(null)
    try {
      const entries = await listRunnerDirectories(directory)
      if (!mountedRef.current) return
      setBrowserDirectory(directory)
      setDirectoryEntries(entries)
      setPickerMode("directories")
    } catch (error) {
      if (!mountedRef.current) return
      setProjectPickerError(
        error instanceof Error ? error.message : "Não foi possível abrir essa pasta.",
      )
    } finally {
      if (mountedRef.current) setDirectoryLoading(false)
    }
  }, [])

  const activateProject = useCallback(
    (root: string) => {
      setProjectRoot(root)
      setSelectedCommandId(null)
      setProjectAvailable(null)
      setSelectedExecutionId(
        executions.find((execution) => execution.projectRoot === root)?.id ?? null,
      )
      setPickerMode("closed")
      setViewMode("single")
      setListMode("commands")
      setHistoryExpanded(false)
      setFocusPane("commands")
      setNarrowPane("commands")
      setProjectSearch("")
    },
    [executions],
  )

  const switchProject = useCallback(
    (root: string) => {
      setOpenedProjects((current) => {
        if (current.some((project) => project.path === root)) return current
        return [...current, { path: root, name: basename(root), displayPath: root }].slice(
          -RUNNER_PROJECT_TAB_SHORTCUTS.length,
        )
      })
      activateProject(root)
    },
    [activateProject],
  )

  const closeProject = useCallback(
    (root: string) => {
      const closeResult = runnerProjectCloseResult(
        openedProjects.map((project) => project.path),
        root,
        projectRoot,
      )
      if (!closeResult.closed) return
      const remainingProjects = closeResult.openedProjects
        .map((path) => openedProjects.find((project) => project.path === path))
        .filter((project): project is RunnerProject => Boolean(project))
      setOpenedProjects(remainingProjects)
      if (closeResult.activeProject === projectRoot) {
        setFocusPane("commands")
        setTimeout(() => {
          const list = listMode === "active" ? processListRef.current : commandListRef.current
          ;(list ?? commandPanelRef.current)?.focus()
        }, 0)
        return
      }

      const nextProject = remainingProjects.find(
        (project) => project.path === closeResult.activeProject,
      )
      if (nextProject) {
        activateProject(nextProject.path)
        return
      }

      setCommands([])
      setEnvironmentProfiles([])
      setSelectedCommandId(null)
      setSelectedExecutionId(null)
      setProjectAvailable(false)
      setDiscoveryError(null)
      setHistoryExpanded(false)
      setFocusPane("commands")
      setNarrowPane("commands")
      void openProjectPicker()
    },
    [activateProject, listMode, openProjectPicker, openedProjects, projectRoot],
  )

  const selectedCommand = commands.find((command) => command.id === selectedCommandId)
  const selectedExecution =
    executions.find((execution) => execution.id === selectedExecutionId) ??
    executions.find((execution) => execution.projectRoot === projectRoot)
  const cycleEnvironmentProfile = useCallback(() => {
    const options = [undefined, ...environmentProfiles.map((profile) => profile.id)]
    const currentIndex = options.indexOf(profileSelections[projectRoot])
    const next = options[(currentIndex + 1) % options.length]
    setProfileSelections((current) => {
      const updated = { ...current }
      if (next) updated[projectRoot] = next
      else delete updated[projectRoot]
      return updated
    })
    setRunnerNotice({
      message: next
        ? `Perfil ativo: ${environmentProfiles.find((profile) => profile.id === next)?.label ?? next}`
        : "Perfil de ambiente: padrão",
      kind: "info",
    })
  }, [environmentProfiles, profileSelections, projectRoot])

  const deleteSelectedSavedCommand = useCallback(() => {
    if (selectedCommand?.source !== "saved") return
    removeSavedRunnerCommand(projectRoot, selectedCommand.id)
    setRunnerNotice({ message: `Comando removido: ${selectedCommand.label}`, kind: "success" })
    void refreshCommands()
  }, [projectRoot, refreshCommands, selectedCommand])

  const stopExecution = useCallback(
    (executionId: string) => {
      const handle = handlesRef.current.get(executionId)
      if (!handle) return
      appendLog(executionId, "encerrando processo…", "system")
      setExecutions((current) =>
        current.map((execution) =>
          execution.id === executionId ? { ...execution, status: "stopping" } : execution,
        ),
      )
      void handle.stop().catch((error) => {
        const message = error instanceof Error ? error.message : "O processo não encerrou."
        appendLog(executionId, message, "system")
        notify({ source: "Runner", kind: "error", message })
      })
    },
    [appendLog, handlesRef, notify],
  )

  const stopSelectedExecution = useCallback(() => {
    if (selectedExecution?.status === "running") stopExecution(selectedExecution.id)
  }, [selectedExecution, stopExecution])

  const clearSelectedLogs = useCallback(() => {
    if (!selectedExecution) return
    clearLogs(selectedExecution.id)
  }, [clearLogs, selectedExecution])

  const submitProcessInput = useCallback(() => {
    if (!selectedExecution || !processInput) return
    const handle = handlesRef.current.get(selectedExecution.id)
    if (!handle) return
    handle.write(`${processInput}\n`)
    appendLog(selectedExecution.id, `⌨ ${processInput}`, "system")
    setProcessInput("")
    if (processInputRef.current) processInputRef.current.value = ""
  }, [appendLog, handlesRef, processInput, selectedExecution])

  const cycleLogStream = useCallback(() => {
    dispatchLogPreferences({ type: "cycle-stream" })
  }, [])

  const copySelectedLogs = useCallback(() => {
    const selectedLogText = serializeRunnerLogs(selectedExecution?.logs ?? [])
    if (!selectedLogText) return
    const copied = renderer.copyToClipboardOSC52(selectedLogText)
    setRunnerNotice({
      message: copied ? "Log copiado." : "O terminal não aceitou a cópia OSC52.",
      kind: copied ? "success" : "warning",
    })
  }, [renderer, selectedExecution?.logs])

  const exportSelectedLogs = useCallback(() => {
    if (!selectedExecution) return
    const selectedLogText = serializeRunnerLogs(selectedExecution.logs)
    if (!selectedLogText) return
    const path = exportRunnerLog(
      selectedExecution.projectRoot,
      selectedExecution.label,
      selectedLogText,
    )
    setRunnerNotice({ message: `Log exportado: ${path}`, kind: "success" })
  }, [selectedExecution])

  const selectedPort = listeningPorts.find((port) => port.groupId === selectedExecution?.pid)
  const selectedPortUrl = selectedPort ? runnerPortUrl(selectedPort.host, selectedPort.port) : null
  const openSelectedPort = useCallback(() => {
    if (!selectedPortUrl) return
    openRunnerUrl(selectedPortUrl)
    setRunnerNotice({ message: `Abrindo ${selectedPortUrl}`, kind: "info" })
  }, [selectedPortUrl])
  const copySelectedPort = useCallback(() => {
    if (!selectedPortUrl) return
    const copied = renderer.copyToClipboardOSC52(selectedPortUrl)
    setRunnerNotice({
      message: copied ? `URL copiada: ${selectedPortUrl}` : "O terminal não aceitou a cópia OSC52.",
      kind: copied ? "success" : "warning",
    })
  }, [renderer, selectedPortUrl])
  const sendSelectedPortToHttp = useCallback(() => {
    if (!selectedPortUrl || !onOpenHttp) return
    onOpenHttp(selectedPortUrl)
  }, [onOpenHttp, selectedPortUrl])

  const cycleExecution = useCallback(
    (direction: number) => {
      if (!executions.length) return
      const currentIndex = Math.max(
        0,
        executions.findIndex((execution) => execution.id === selectedExecution?.id),
      )
      const nextIndex = (currentIndex + direction + executions.length) % executions.length
      setSelectedExecutionId(executions[nextIndex]?.id ?? null)
    },
    [executions, selectedExecution?.id],
  )

  const selectCommand = useCallback(
    (commandId: string) => {
      setSelectedCommandId(commandId)
      const selectedCommandKey = commandKey(projectRoot, commandId)
      const activeExecution = executions.find(
        (execution) =>
          execution.commandKey === selectedCommandKey &&
          (execution.status === "running" || execution.status === "stopping"),
      )
      const latestExecution =
        activeExecution ??
        executions.find((execution) => execution.commandKey === selectedCommandKey)
      if (latestExecution) setSelectedExecutionId(latestExecution.id)
    },
    [executions, projectRoot],
  )

  const toggleCommand = useCallback(
    (command?: RunnerCommand) => {
      if (!command) return
      const selectedCommandKey = commandKey(projectRoot, command.id)
      const activeExecution = executions.find(
        (execution) =>
          execution.commandKey === selectedCommandKey &&
          (execution.status === "running" || execution.status === "stopping"),
      )
      if (activeExecution) {
        setSelectedExecutionId(activeExecution.id)
        if (activeExecution.status === "running") stopExecution(activeExecution.id)
        return
      }
      runCommand(command)
    },
    [executions, projectRoot, runCommand, stopExecution],
  )

  const activeExecutions = useMemo(
    () =>
      executions.filter(
        (execution) => execution.status === "running" || execution.status === "stopping",
      ),
    [executions],
  )
  const projectExecutions = useMemo(
    () => executions.filter((execution) => execution.projectRoot === projectRoot),
    [executions, projectRoot],
  )

  const focusCommandPane = useCallback(() => {
    setFocusPane("commands")
    if (narrowRunner) setNarrowPane("commands")
    setTimeout(() => {
      const list = listMode === "active" ? processListRef.current : commandListRef.current
      ;(list ?? commandPanelRef.current)?.focus()
    }, 0)
  }, [listMode, narrowRunner])

  const focusLogPane = useCallback(() => {
    if (viewMode !== "single") return
    setFocusPane("log")
    if (narrowRunner) setNarrowPane("log")
    setTimeout(() => logScrollRef.current?.focus(), 0)
  }, [narrowRunner, viewMode])

  const submitLogFilter = useCallback(() => {
    logFilterRef.current?.blur()
    focusLogPane()
  }, [focusLogPane, logFilterRef])

  const closeLogFilter = useCallback(() => {
    logFilterRef.current?.blur()
    setLogFilterOpen(false)
    commandListRef.current?.focus()
  }, [logFilterRef])

  const focusHistoryPane = useCallback(() => {
    setFocusPane("history")
    if (narrowRunner) setNarrowPane("log")
    setTimeout(() => {
      ;(historyListRef.current ?? historyPanelRef.current)?.focus()
    }, 0)
  }, [narrowRunner])

  const toggleProcessList = useCallback(() => {
    const nextMode = listMode === "active" ? "commands" : "active"
    if (nextMode === "active") setSelectedExecutionId(activeExecutions[0]?.id ?? null)
    setListMode(nextMode)
    setFocusPane("commands")
    if (narrowRunner) setNarrowPane("commands")
    setTimeout(() => {
      if (nextMode === "active") processListRef.current?.focus()
      else commandListRef.current?.focus()
    }, 0)
  }, [activeExecutions, listMode, narrowRunner])

  const toggleHistoryPane = useCallback(() => {
    if (viewMode !== "single" || shortRunner) return
    if (historyExpanded) {
      setHistoryExpanded(false)
      focusLogPane()
      return
    }
    setHistoryExpanded(true)
    focusHistoryPane()
  }, [focusHistoryPane, focusLogPane, historyExpanded, shortRunner, viewMode])

  const multiPaneCapacity = runnerMultiCapacity(terminal.width)
  const maxMultiOffset = Math.max(0, activeExecutions.length - multiPaneCapacity)
  const visibleMultiExecutions = activeExecutions.slice(
    multiOffset,
    multiOffset + multiPaneCapacity,
  )
  const hiddenMultiBefore = multiOffset
  const hiddenMultiAfter = Math.max(
    0,
    activeExecutions.length - multiOffset - visibleMultiExecutions.length,
  )

  useEffect(() => {
    if (multiOffset > maxMultiOffset) setMultiOffset(maxMultiOffset)
    if (
      viewMode === "multi" &&
      activeExecutions.length &&
      !activeExecutions.some((execution) => execution.id === selectedExecutionId)
    ) {
      setSelectedExecutionId(activeExecutions[0]?.id ?? null)
    }
  }, [activeExecutions, maxMultiOffset, multiOffset, selectedExecutionId, viewMode])

  const toggleViewMode = useCallback(() => {
    setViewMode((current) => (current === "single" ? "multi" : "single"))
    if (activeExecutions.length) {
      const selectedIndex = Math.max(
        0,
        activeExecutions.findIndex((execution) => execution.id === selectedExecutionId),
      )
      setMultiOffset(Math.min(selectedIndex, maxMultiOffset))
      setSelectedExecutionId(activeExecutions[selectedIndex]?.id ?? null)
    }
  }, [activeExecutions, maxMultiOffset, selectedExecutionId])

  const cycleActiveExecution = useCallback(
    (direction: number) => {
      if (!activeExecutions.length) return
      const currentIndex = Math.max(
        0,
        activeExecutions.findIndex((execution) => execution.id === selectedExecutionId),
      )
      const nextIndex =
        (currentIndex + direction + activeExecutions.length) % activeExecutions.length
      setSelectedExecutionId(activeExecutions[nextIndex]?.id ?? null)
      if (nextIndex < multiOffset) setMultiOffset(nextIndex)
      else if (nextIndex >= multiOffset + multiPaneCapacity) {
        setMultiOffset(nextIndex - multiPaneCapacity + 1)
      }
    },
    [activeExecutions, multiOffset, multiPaneCapacity, selectedExecutionId],
  )

  const slideMultiWindow = useCallback(
    (direction: number) => {
      const nextOffset = Math.max(0, Math.min(maxMultiOffset, multiOffset + direction))
      if (nextOffset === multiOffset) return
      setMultiOffset(nextOffset)
      const enteringIndex =
        direction > 0
          ? Math.min(activeExecutions.length - 1, nextOffset + multiPaneCapacity - 1)
          : nextOffset
      setSelectedExecutionId(activeExecutions[enteringIndex]?.id ?? null)
    },
    [activeExecutions, maxMultiOffset, multiOffset, multiPaneCapacity],
  )

  const boxSelection = useRunnerBoxSelection({
    active:
      active &&
      !actionPalette.isOpen &&
      pickerMode === "closed" &&
      !configurationOpen &&
      !saveCommandModalOpen &&
      !pendingAutostartReview,
    current:
      viewMode === "multi" && focusPane === "log" && selectedExecution
        ? `runner-multi-${selectedExecution.id}`
        : `runner-${focusPane === "commands" ? "command" : focusPane}-panel`,
    targets: [
      { id: "runner-command-panel", onFocus: focusCommandPane },
      ...(viewMode === "single"
        ? [
            { id: "runner-log-panel", onFocus: focusLogPane },
            ...(historyExpanded && !shortRunner
              ? [{ id: "runner-history-panel", onFocus: focusHistoryPane }]
              : []),
          ]
        : visibleMultiExecutions.map((execution) => ({
            id: `runner-multi-${execution.id}`,
            onFocus: () => {
              setSelectedExecutionId(execution.id)
              setFocusPane("log")
              renderer.root.findDescendantById(`runner-multi-${execution.id}`)?.focus()
            },
          }))),
    ],
  })

  useKeyboard((key) => {
    if (!active || key.defaultPrevented || actionPalette.isOpen || boxSelection.open) return
    if ([configurationOpen, saveCommandModalOpen, Boolean(pendingAutostartReview)].includes(true))
      return
    const focusedId = renderer.currentFocusedRenderable?.id
    const editingText =
      focusedId === "runner-command-input" ||
      focusedId === "runner-project-search" ||
      focusedId === "runner-log-filter" ||
      focusedId === "runner-process-input"
    if (editingText) {
      if (focusedId === "runner-command-input" && key.ctrl && key.name === "s") {
        key.preventDefault()
        key.stopPropagation()
        openSaveCommandModal()
        return
      }
      if (key.name === "escape") {
        key.preventDefault()
        if (focusedId === "runner-command-input") {
          manualInputRef.current?.blur()
          commandListRef.current?.focus()
        } else if (focusedId === "runner-log-filter") {
          closeLogFilter()
        } else if (focusedId === "runner-process-input") {
          processInputRef.current?.blur()
          commandListRef.current?.focus()
        } else {
          projectSearchRef.current?.blur()
          if (pickerMode === "directories") directoryListRef.current?.focus()
          else projectListRef.current?.focus()
        }
      }
      return
    }
    if (pickerMode !== "closed") {
      if (key.name === "escape" || key.name === "q") {
        setPickerMode("closed")
        setProjectSearch("")
      } else if (key.name === "/") {
        key.preventDefault()
        projectSearchRef.current?.focus()
      }
      return
    }
    if (key.name === "m" && !key.meta && !key.option && !key.super) {
      key.preventDefault()
      key.stopPropagation()
      if (key.ctrl || key.shift) toggleViewMode()
      else boxSelection.openSelection()
      return
    }
    if (isActionPaletteKey(key)) {
      key.preventDefault()
      key.stopPropagation()
      actionPalette.open()
      return
    }
    if (key.ctrl && key.name === "y") {
      key.preventDefault()
      key.stopPropagation()
      setConfigurationOpen(true)
      return
    }
    if (runnerProjectPickerShortcut(key)) {
      key.preventDefault()
      key.stopPropagation()
      void openProjectPicker()
      return
    }
    if (key.name === "x" && !key.ctrl && !key.meta && !key.option && !key.super) {
      key.preventDefault()
      key.stopPropagation()
      closeProject(projectRoot)
      return
    }
    const keyboardPane: RunnerFocusPane | null =
      focusedId === "runner-log-scroll"
        ? "log"
        : focusedId === "runner-history-panel" || focusedId === "runner-history-list"
          ? "history"
          : focusedId === "runner-command-list" ||
              focusedId === "runner-process-list" ||
              focusedId === "runner-command-panel"
            ? "commands"
            : null
    const focusDestination =
      viewMode === "single" && keyboardPane
        ? runnerFocusDestination(keyboardPane, key.name, {
            historyIndex:
              focusedId === "runner-history-list"
                ? (historyListRef.current?.getSelectedIndex() ?? 0)
                : 0,
            historyAvailable: historyExpanded && projectExecutions.length > 0,
            logAtBottom: logScrollRef.current
              ? runnerLogIsAtBottom(
                  logScrollRef.current.scrollTop,
                  logScrollRef.current.scrollHeight,
                  logScrollRef.current.viewport.height,
                )
              : false,
          })
        : null
    if (focusDestination) {
      key.preventDefault()
      key.stopPropagation()
      if (focusDestination === "commands") focusCommandPane()
      else if (focusDestination === "history") focusHistoryPane()
      else focusLogPane()
      return
    }
    if (key.name === "p" && projectAvailable === false) {
      void openProjectPicker()
      return
    }
    const multiWindowDirection = viewMode === "multi" ? directionalShortcutDirection(key) : null
    if (multiWindowDirection) {
      key.preventDefault()
      slideMultiWindow(multiWindowDirection)
      return
    }
    if (
      key.name === "a" &&
      !key.ctrl &&
      !key.option &&
      !key.meta &&
      (viewMode !== "multi" || key.shift)
    ) {
      actionPalette.open()
      return
    }
    if (key.name === "s") {
      toggleHistoryPane()
      return
    }
    if (key.name === "e") {
      cycleEnvironmentProfile()
      return
    }
    if (
      key.name === "f" &&
      !key.ctrl &&
      !key.option &&
      !key.meta &&
      (viewMode !== "multi" || key.shift)
    ) {
      openLogFilter()
      return
    }
    if (key.name === "v") {
      cycleLogStream()
      return
    }
    if (key.name === "t") {
      dispatchLogPreferences({ type: "toggle-timestamps" })
      return
    }
    if (key.name === "y") {
      copySelectedLogs()
      return
    }
    if (key.ctrl && key.name === "x") {
      key.preventDefault()
      key.stopPropagation()
      exportSelectedLogs()
      return
    }
    if (key.name === "i" && selectedExecution && handlesRef.current.has(selectedExecution.id)) {
      processInputRef.current?.focus()
      return
    }
    if (key.name === "o") {
      openSelectedPort()
      return
    }
    if (key.name === "u") {
      copySelectedPort()
      return
    }
    if (key.name === "h") {
      sendSelectedPortToHttp()
      return
    }
    if (key.name === "delete") {
      deleteSelectedSavedCommand()
      return
    }
    if (viewMode === "multi") {
      if (key.name === "left") {
        cycleActiveExecution(-1)
        return
      }
      if (key.name === "right") {
        cycleActiveExecution(1)
        return
      }
    }
    const projectShortcutIndex = RUNNER_PROJECT_TAB_SHORTCUTS.findIndex(
      (shortcut) =>
        ![key.ctrl, key.meta, key.option, key.shift, key.super].some(Boolean) &&
        key.name === shortcut,
    )
    const shortcutProject = openedProjects[projectShortcutIndex]
    if (shortcutProject) {
      key.preventDefault()
      switchProject(shortcutProject.path)
      return
    }
    if (key.name === "/") {
      key.preventDefault()
      if (narrowRunner) setNarrowPane("commands")
      setListMode("commands")
      manualInputRef.current?.focus()
    } else if (key.name === "p" && (activeExecutions.length || listMode === "active")) {
      toggleProcessList()
    } else if (key.name === "c") clearSelectedLogs()
    else if (key.name === "d") void refreshCommands()
    else if (key.name === "tab" && narrowRunner) {
      key.preventDefault()
      if (narrowPane === "commands") focusLogPane()
      else focusCommandPane()
    } else if (key.name === "[") cycleExecution(-1)
    else if (key.name === "]") cycleExecution(1)
  })

  const latestByCommand = useMemo(() => latestRunnerExecutions(executions), [executions])
  const projectSummaries = useMemo(
    () => runnerProjectSummaries(executions, latestByCommand),
    [executions, latestByCommand],
  )
  const currentSummary = projectSummaries.get(projectRoot) ?? EMPTY_RUNNER_SUMMARY
  const commandOptions = useMemo<RunnerStatusOption[]>(
    () =>
      commands.map((command) => {
        const key = commandKey(projectRoot, command.id)
        const execution = latestByCommand.get(key)
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
    [latestByCommand, commands, projectRoot],
  )
  const normalizedProjectSearch = projectSearch.trim().toLocaleLowerCase()
  const filteredProjects = projects.filter(
    (project) =>
      !normalizedProjectSearch ||
      `${project.name} ${project.displayPath}`
        .toLocaleLowerCase()
        .includes(normalizedProjectSearch),
  )
  const projectOptions = [
    ...filteredProjects.map((project) => ({
      name: `${project.path === projectRoot ? "●" : "◇"} ${project.name}`,
      description: project.displayPath,
      value: project.path,
    })),
    {
      name: "⌕ PROCURAR NOS ARQUIVOS…",
      description: "Navegar até qualquer pasta do computador",
      value: RUNNER_DIRECTORY_PICKER_OPTION,
    },
  ]
  const filteredDirectoryEntries = directoryEntries.filter(
    (entry) =>
      !normalizedProjectSearch || entry.name.toLocaleLowerCase().includes(normalizedProjectSearch),
  )
  const directoryOptions = [
    {
      name: "✓ USAR ESTA PASTA",
      description: browserDirectory,
      value: RUNNER_USE_DIRECTORY_OPTION,
    },
    ...(browserDirectory !== dirname(browserDirectory)
      ? [
          {
            name: "↰ ..",
            description: dirname(browserDirectory),
            value: dirname(browserDirectory),
          },
        ]
      : []),
    ...filteredDirectoryEntries.map((entry) => ({
      name: `${entry.git ? "◆" : "◇"} ${entry.name}/`,
      description: entry.git ? "Repositório Git" : entry.path,
      value: entry.path,
    })),
  ]
  const selectedCommandIndex = Math.max(
    0,
    commands.findIndex((command) => command.id === selectedCommandId),
  )
  const commandPanelWidth = runnerCommandWidth(terminal.width)
  const compactCommandHeader = commandPanelWidth < 42
  const selectedCommandState = selectedCommand
    ? latestByCommand.get(commandKey(projectRoot, selectedCommand.id))?.status
    : undefined
  const footerActions = runnerFooterActions({
    selectedCommandState,
    hasCommand: Boolean(selectedCommand),
    savedCommand: selectedCommand?.source === "saved",
    hasProfiles: environmentProfiles.length > 0,
    hasExecution: Boolean(selectedExecution),
    hasLogs: Boolean(selectedExecution?.logs.length),
    historyExpanded,
    shortRunner,
    paletteOpen: actionPalette.isOpen,
    filterActive: logFilterOpen || Boolean(logFilter),
    streamActive: logStream !== "all",
    showTimestamps,
    focusLogPane,
    focusCommandPane,
    toggleCommand: () => toggleCommand(selectedCommand),
    toggleViewMode,
    chooseBox: boxSelection.openSelection,
    toggleHistoryPane,
    cycleEnvironmentProfile,
    deleteSelectedSavedCommand,
    openConfiguration: () => setConfigurationOpen(true),
    openPalette: actionPalette.open,
    openFilter: openLogFilter,
    submitFilter: submitLogFilter,
    closeFilter: closeLogFilter,
    cycleLogStream,
    toggleTimestamps: () => dispatchLogPreferences({ type: "toggle-timestamps" }),
    copySelectedLogs,
    exportSelectedLogs,
    clearSelectedLogs,
  })
  const showCommandFooter =
    pickerMode === "closed" &&
    projectAvailable !== false &&
    viewMode === "single" &&
    listMode === "commands" &&
    focusPane !== "log" &&
    !(focusPane === "history" && historyExpanded)
  const logFooterActions =
    logFilterOpen && logFilterFocused ? footerActions.filter : footerActions.log
  const showLogFooter =
    pickerMode === "closed" &&
    projectAvailable !== false &&
    viewMode === "single" &&
    focusPane === "log"
  const footerHeight =
    showCommandFooter || showLogFooter
      ? runnerCommandFooterHeight(
          showLogFooter ? logFooterActions : footerActions.commands,
          terminal.width - LAYOUT.outerPadding * 2,
        )
      : 1
  const runnerPanelHeight = runnerContentHeight(terminal, footerHeight)
  const commandPanelHeight = runnerPanelHeight
  const { multiRailWidth, multiPaneWidth } = runnerMultiLayout(
    terminal.width,
    commandPanelWidth,
    visibleMultiExecutions.length,
    hiddenMultiBefore,
    hiddenMultiAfter,
  )
  const multiLogHeight = Math.max(4, runnerPanelHeight - 6)
  const showCommandDetails =
    listMode === "commands" && terminal.height >= 28 && commandPanelHeight >= 10
  const logWidth = runnerLogWidth(terminal.width, commandPanelWidth)
  const selectedProcessHandle = selectedExecution
    ? handlesRef.current.get(selectedExecution.id)
    : undefined
  const logControlsHeight = (logFilterOpen ? 1 : 0) + (selectedProcessHandle ? 1 : 0)
  const historyPanelHeight = historyExpanded
    ? runnerHistoryPanelHeight(projectExecutions.length, shortRunner)
    : shortRunner
      ? 0
      : 1
  const logHeight = Math.max(
    shortRunner ? 2 : 5,
    runnerPanelHeight - 4 - logControlsHeight - historyPanelHeight,
  )
  const selectedLogs = useMemo(
    () => filterRunnerLogs(selectedExecution?.logs ?? [], logStream, logFilter),
    [logFilter, logStream, selectedExecution?.logs],
  )
  const runnerLogPaletteKey = [
    COLORS.canvas,
    COLORS.danger,
    COLORS.runner,
    COLORS.success,
    COLORS.text,
    COLORS.warning,
  ].join("\u0000")
  const selectedLogDocument = useMemo(() => {
    // COLORS is mutated in place when the palette changes.
    void runnerLogPaletteKey
    return buildRunnerLogDocument(selectedLogs, {
      width: logWidth,
      showTimestamps,
      palette: COLORS,
    })
  }, [selectedLogs, logWidth, showTimestamps, runnerLogPaletteKey])
  const historyOptions: RunnerStatusOption[] = historyExpanded
    ? projectExecutions.map((execution) => {
        const duration = (execution.endedAt ?? now) - execution.startedAt
        return {
          name: fitLine(
            `${runnerExecutionLabel(execution)} · ${execution.label}  ${formatDuration(duration)}`,
            logWidth,
          ),
          description: "",
          value: execution.id,
          status: runnerVisualStatus(execution),
        }
      })
    : []
  const selectedHistoryIndex = Math.max(
    0,
    projectExecutions.findIndex((execution) => execution.id === selectedExecution?.id),
  )
  const selectedCommandExecution = selectedCommand
    ? latestByCommand.get(commandKey(projectRoot, selectedCommand.id))
    : undefined
  const summaryParts =
    projectAvailable === false
      ? [{ text: translateUi("SEM PROJETO"), color: COLORS.muted }]
      : runnerSummaryParts(
          commands.length,
          currentSummary,
          narrowRunner ? 0 : Math.floor(terminal.width / 2),
        )
  const displayedRunnerSummary = summaryParts.map((part) => part.text).join("")
  const processOptions: RunnerStatusOption[] = activeExecutions.map((execution) => {
    const ports = listeningPorts.filter((port) => port.groupId === execution.pid)
    return {
      name: `${runnerExecutionLabel(execution)} · ${execution.projectName}/${execution.label}${ports.length ? `  ·  ◉ ${ports.map(portAddress).join(" ")}` : ""}`,
      description: "",
      value: execution.id,
      status: runnerVisualStatus(execution),
    }
  })
  const { newProjectLabel, newProjectWidth, projectTabAreaWidth, projectTabWidth } =
    runnerHeaderLayout(terminal.width, displayedRunnerSummary, openedProjects.length)

  return (
    <RunnerSurface id="runner-workspace">
      <RunnerHeader
        {...{
          projectTabAreaWidth,
          openedProjects,
          projectRoot,
          projectSummaries,
          projectTabWidth,
          switchProject,
          closeProject,
          newProjectWidth,
          newProjectLabel,
          openProjectPicker,
          summaryParts,
        }}
      />

      {pickerMode !== "closed" ? (
        <RunnerProjectPicker
          homeDirectory={homedir()}
          {...{
            pickerMode,
            filteredProjects,
            filteredDirectoryEntries,
            projectSearchRef,
            projectSearch,
            setProjectSearch,
            directoryListRef,
            projectListRef,
            terminal,
            projectPickerError,
            projectOptions,
            loadDirectory,
            switchProject,
            directoryOptions,
            browserDirectory,
            projectsLoading,
            directoryLoading,
          }}
        />
      ) : projectAvailable === false ? (
        <box
          style={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
            ...panelBorder(COLORS.runner),
            backgroundColor: COLORS.panel,
            paddingLeft: 2,
            paddingRight: 2,
          }}
        >
          <text content="◇" style={{ fg: COLORS.runner }} />
          <text content="Nenhum projeto encontrado nesta pasta." style={{ fg: COLORS.text }} />
          <text
            content={fitLine(projectRoot, Math.max(20, terminal.width - 10))}
            style={{ fg: COLORS.muted }}
          />
          <text
            content="Entre em uma pasta de projeto ou escolha uma para usar o Runner."
            style={{ fg: COLORS.muted }}
          />
          <InlineButton
            label="[N] Escolher projeto"
            accent={COLORS.runner}
            onPress={() => void openProjectPicker()}
          />
        </box>
      ) : (
        <RunnerPanels
          narrow={narrowRunner}
          pane={narrowPane}
          focusCommands={focusCommandPane}
          focusLog={focusLogPane}
        >
          {!narrowRunner || narrowPane === "commands" ? (
            <RunnerCommandColumn narrow={narrowRunner} width={commandPanelWidth}>
              <RunnerCommandPanel
                {...{
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
                }}
              />
            </RunnerCommandColumn>
          ) : null}

          {!narrowRunner || narrowPane === "log" ? (
            viewMode === "multi" ? (
              <MultiProcessPanel
                boxOverlay={boxSelection.overlay}
                activeExecutions={activeExecutions}
                multiOffset={multiOffset}
                visibleMultiExecutions={visibleMultiExecutions}
                hiddenMultiBefore={hiddenMultiBefore}
                slideMultiWindow={slideMultiWindow}
                multiRailWidth={multiRailWidth}
                selectedExecution={selectedExecution}
                now={now}
                listeningPorts={listeningPorts}
                multiPaneWidth={multiPaneWidth}
                logStream={logStream}
                logFilter={logFilter}
                multiLogHeight={multiLogHeight}
                setSelectedExecutionId={setSelectedExecutionId}
                showTimestamps={showTimestamps}
                hiddenMultiAfter={hiddenMultiAfter}
              />
            ) : (
              <RunnerLogPanel
                {...{
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
                }}
              />
            )
          ) : null}
        </RunnerPanels>
      )}

      <RunnerFooter
        {...{
          footerHeight,
          pickerMode,
          projectAvailable,
          focusPane,
          actionPalette,
          projectSearchRef,
          setPickerMode,
          setProjectSearch,
          openProjectPicker,
          historyExpanded,
          focusCommandPane,
          focusLogPane,
          toggleHistoryPane,
          viewMode,
          logFooterActions,
          boxSelection,
          toggleViewMode,
          activeExecutions,
          cycleActiveExecution,
          selectedExecution,
          stopSelectedExecution,
          listMode,
          narrowRunner,
          setNarrowPane,
          footerActions,
        }}
      />
      {boxSelection.focusNode}
      {actionPalette.isOpen
        ? actionPalette.render({
            title: "AÇÕES DO RUNNER",
            accent: COLORS.runner,
            actions: runnerPaletteActions({
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
            }),
          })
        : null}
      {configurationOpen ? (
        <RunnerConfiguration
          root={projectRoot}
          commands={commands}
          profiles={environmentProfiles}
          flows={flows}
          flowStates={flowStates}
          runFlow={runFlow}
          stopFlow={stopFlow}
          restartFlow={restartFlow}
          onChanged={() => void refreshCommands()}
          onClose={() => {
            setConfigurationOpen(false)
            setTimeout(() => commandListRef.current?.focus(), 0)
          }}
        />
      ) : null}
      <MountWhen when={saveCommandModalOpen}>
        <RunnerSaveCommandModal
          open
          command={manualCommand}
          availableWidth={terminal.width}
          onClose={() => {
            setSaveCommandModalOpen(false)
            setTimeout(() => manualInputRef.current?.focus(), 0)
          }}
          onSave={confirmSaveManualCommand}
        />
      </MountWhen>
      {pendingAutostartReview ? (
        <RunnerAutostartTrustModal
          review={pendingAutostartReview}
          onApprove={approveAutostart}
          onClose={dismissAutostart}
        />
      ) : null}
    </RunnerSurface>
  )
}
