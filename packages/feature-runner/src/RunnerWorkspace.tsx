import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { homedir } from "node:os"
import { basename, dirname } from "node:path"
import type {
  BoxRenderable,
  InputRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
} from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { INITIAL_LOG_PREFERENCES, logPreferencesReducer } from "./model/log-preferences"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
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
import { RunnerConfiguration } from "./ui/RunnerConfiguration"
import type { RunnerFlow } from "./model/plan"
import { RunnerLoadingOverlay } from "./ui/RunnerLoadingOverlay"
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
import {
  buildRunnerLogDocument,
  filterRunnerLogs,
  serializeRunnerLogs,
} from "./rendering/log-document"
import { useRunnerLogBuffer } from "./hooks/use-runner-log-buffer"
import {
  type RunnerFocusPane,
  runnerFocusDestination,
  runnerHistoryPanelHeight,
  runnerLogIsAtBottom,
  runnerProjectCloseResult,
  runnerProjectPickerShortcut,
} from "./model/navigation"
import {
  COLORS,
  focusedPanelBorder,
  LAYOUT,
  panelBorder,
} from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { MountWhen } from "@xupon/tuiminal-core/ui/MountWhen"
import { directionalShortcutDirection } from "@xupon/tuiminal-core/ui/directional-shortcut"
import { type RunnerCommandSaveInput, RunnerSaveCommandModal } from "./ui/RunnerSaveCommandModal"
import { RunnerAutostartTrustModal } from "./ui/RunnerAutostartTrustModal"
import {
  type ProjectPickerMode,
  RUNNER_CATEGORY_ICONS,
  RUNNER_DIRECTORY_PICKER_OPTION,
  type RunnerListMode,
  RUNNER_PROJECT_TAB_SHORTCUTS,
  RUNNER_USE_DIRECTORY_OPTION,
  runnerLogFilterLabel,
  type RunnerViewMode,
  type RunnerWorkspaceProps,
} from "./model/workspace"
import { useRunnerExecution } from "./hooks/use-runner-execution"
import { useRunnerPlans } from "./hooks/use-runner-plans"
import { useRunnerAutostart } from "./hooks/use-runner-autostart"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import type { ExecutionLog, RunnerExecution } from "./model/execution"
import { useRunnerNotifications } from "./hooks/use-runner-notifications"
import { restoredRunnerExecution } from "./state/restored-execution"

import {
  fitLine,
  formatDuration,
  statusMarker,
  statusLabel,
  statusColor,
  healthLabel,
  commandKey,
  portAddress,
} from "./rendering/presentation"
import { MultiProcessPanel } from "./ui/MultiProcessPanel"

export function Runner({ active, onOpenHttp }: RunnerWorkspaceProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const shortRunner = terminal.height < 24
  const narrowRunner = terminal.width < 72
  const commandListRef = useRef<SelectRenderable | null>(null)
  const processListRef = useRef<SelectRenderable | null>(null)
  const manualInputRef = useRef<InputRenderable | null>(null)
  const logFilterRef = useRef<InputRenderable | null>(null)
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
  const [groupSelectionMode, setGroupSelectionMode] = useState(false)
  const [moreActionsOpen, setMoreActionsOpen] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [environmentProfiles, setEnvironmentProfiles] = useState<RunnerEnvironmentProfile[]>([])
  const [profileSelections, setProfileSelections] = useState<Record<string, string>>(
    initialSession.environmentProfiles,
  )
  const [selectedCommandKeys, setSelectedCommandKeys] = useState<Set<string>>(() => new Set())
  const [
    { filter: logFilter, stream: logStream, timestamps: showTimestamps },
    dispatchLogPreferences,
  ] = useReducer(logPreferencesReducer, INITIAL_LOG_PREFERENCES)
  const [logFilterOpen, setLogFilterOpen] = useState(false)
  const [processInput, setProcessInput] = useState("")
  const [runnerNotice, setRunnerNotice] = useState("")
  const [multiOffset, setMultiOffset] = useState(0)
  const [listeningPorts, setListeningPorts] = useState<RunnerListeningPort[]>([])
  const [pickerMode, setPickerMode] = useState<ProjectPickerMode>("closed")
  const [projects, setProjects] = useState<RunnerProject[]>([])
  const [projectSearch, setProjectSearch] = useState("")
  const [narrowPane, setNarrowPane] = useState<"commands" | "log">("commands")
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectPickerError, setProjectPickerError] = useState<string | null>(null)
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
  const { runCommand, runTargets, stopTargets, runFlow, stopFlow, restartFlow, flowStates } =
    useRunnerPlans({
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
    setRunnerNotice("")
    setSaveCommandModalOpen(true)
  }, [manualCommand])

  const confirmSaveManualCommand = useCallback(
    (input: RunnerCommandSaveInput) => {
      const saved = saveRunnerCommand(projectRoot, input)
      setSaveCommandModalOpen(false)
      setManualCommand("")
      if (manualInputRef.current) manualInputRef.current.value = ""
      setRunnerNotice(`Comando salvo: ${saved.label}`)
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
    active: active && !configurationOpen && !saveCommandModalOpen,
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
      setGroupSelectionMode(false)
      setSelectedCommandKeys(new Set())
      setMoreActionsOpen(false)
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
    setRunnerNotice(
      next
        ? `Perfil ativo: ${environmentProfiles.find((profile) => profile.id === next)?.label ?? next}`
        : "Perfil de ambiente: padrão",
    )
  }, [environmentProfiles, profileSelections, projectRoot])

  const toggleCommandGroup = useCallback(
    (commandId: string) => {
      setGroupSelectionMode(true)
      setMoreActionsOpen(false)
      const key = commandKey(projectRoot, commandId)
      setSelectedCommandKeys((current) => {
        const next = new Set(current)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    },
    [projectRoot],
  )

  const toggleSelectedCommandGroup = useCallback(() => {
    if (!selectedCommand) return
    toggleCommandGroup(selectedCommand.id)
  }, [selectedCommand, toggleCommandGroup])

  const exitGroupSelection = useCallback(() => {
    setGroupSelectionMode(false)
    setSelectedCommandKeys(new Set())
  }, [])

  const groupCommands = useMemo(
    () =>
      commands.filter((command) => selectedCommandKeys.has(commandKey(projectRoot, command.id))),
    [commands, projectRoot, selectedCommandKeys],
  )

  const runCommandGroup = useCallback(() => {
    const targets = groupCommands.length ? groupCommands : selectedCommand ? [selectedCommand] : []
    runTargets(targets)
  }, [groupCommands, runTargets, selectedCommand])

  const stopCommandGroup = useCallback(() => {
    const targets = groupCommands.length ? groupCommands : selectedCommand ? [selectedCommand] : []
    void stopTargets(targets).catch((error) =>
      notify({ source: "Runner", kind: "error", message: String(error) }),
    )
  }, [groupCommands, notify, selectedCommand, stopTargets])

  const restartCommandGroup = useCallback(() => {
    const targets = groupCommands.length ? groupCommands : selectedCommand ? [selectedCommand] : []
    void stopTargets(targets)
      .then(() => {
        if (mountedRef.current) runTargets(targets)
      })
      .catch((error) => notify({ source: "Runner", kind: "error", message: String(error) }))
  }, [groupCommands, notify, runTargets, selectedCommand, stopTargets])

  const deleteSelectedSavedCommand = useCallback(() => {
    if (selectedCommand?.source !== "saved") return
    removeSavedRunnerCommand(projectRoot, selectedCommand.id)
    setRunnerNotice(`Comando removido: ${selectedCommand.label}`)
    void refreshCommands()
  }, [projectRoot, refreshCommands, selectedCommand])

  const stopSelectedExecution = useCallback(() => {
    if (!selectedExecution) return
    const handle = handlesRef.current.get(selectedExecution.id)
    if (!handle) return
    void handle.stop().catch((error) => {
      const message = error instanceof Error ? error.message : "O processo não encerrou."
      appendLog(selectedExecution.id, message, "system")
      notify({ source: "Runner", kind: "error", message })
    })
    appendLog(selectedExecution.id, "encerrando processo…", "system")
    setExecutions((current) =>
      current.map((execution) =>
        execution.id === selectedExecution.id ? { ...execution, status: "stopping" } : execution,
      ),
    )
  }, [appendLog, handlesRef, notify, selectedExecution])

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
    setRunnerNotice(copied ? "Log copiado." : "O terminal não aceitou a cópia OSC52.")
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
    setRunnerNotice(`Log exportado: ${path}`)
  }, [selectedExecution])

  const selectedPort = listeningPorts.find((port) => port.groupId === selectedExecution?.pid)
  const selectedPortUrl = selectedPort ? runnerPortUrl(selectedPort.host, selectedPort.port) : null
  const openSelectedPort = useCallback(() => {
    if (!selectedPortUrl) return
    openRunnerUrl(selectedPortUrl)
    setRunnerNotice(`Abrindo ${selectedPortUrl}`)
  }, [selectedPortUrl])
  const copySelectedPort = useCallback(() => {
    if (!selectedPortUrl) return
    const copied = renderer.copyToClipboardOSC52(selectedPortUrl)
    setRunnerNotice(
      copied ? `URL copiada: ${selectedPortUrl}` : "O terminal não aceitou a cópia OSC52.",
    )
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

  const openOrRunCommand = useCallback(
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
        if (narrowRunner) setNarrowPane("log")
        return
      }
      runCommand(command)
    },
    [executions, narrowRunner, projectRoot, runCommand],
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

  const focusHistoryPane = useCallback(() => {
    setFocusPane("history")
    setTimeout(() => {
      ;(historyListRef.current ?? historyPanelRef.current)?.focus()
    }, 0)
  }, [])

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

  const multiPaneCapacity = terminal.width >= 126 ? 3 : terminal.width >= 72 ? 2 : 1
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

  useKeyboard((key) => {
    if (!active) return
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
          logFilterRef.current?.blur()
          setLogFilterOpen(false)
          commandListRef.current?.focus()
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
    if (key.ctrl && key.name === "x") {
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
    if (key.name === "escape" && moreActionsOpen) {
      setMoreActionsOpen(false)
      return
    }
    if (key.name === "escape" && groupSelectionMode) {
      exitGroupSelection()
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
      !groupSelectionMode &&
      !key.ctrl &&
      !key.option &&
      !key.meta &&
      (viewMode !== "multi" || key.shift)
    ) {
      setMoreActionsOpen((current) => !current)
      return
    }
    if (key.name === "s") {
      toggleHistoryPane()
      return
    }
    if (key.name === "space" && listMode === "commands") {
      key.preventDefault()
      toggleSelectedCommandGroup()
      return
    }
    if (groupSelectionMode && key.name === "g" && !key.shift) {
      runCommandGroup()
      return
    }
    if (groupSelectionMode && key.name === "g" && key.shift) {
      stopCommandGroup()
      return
    }
    if (groupSelectionMode && key.name === "r" && key.shift) {
      restartCommandGroup()
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
      setLogFilterOpen(true)
      setTimeout(() => logFilterRef.current?.focus(), 0)
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
    if (key.name === "x") {
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
      if (key.name === "m") {
        toggleViewMode()
        return
      }
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
      (shortcut) => !key.shift && key.name === shortcut,
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
      const nextMode = listMode === "active" ? "commands" : "active"
      if (nextMode === "active") {
        exitGroupSelection()
        setSelectedExecutionId(activeExecutions[0]?.id ?? null)
      }
      setListMode(nextMode)
      if (narrowRunner) setNarrowPane("commands")
      setTimeout(() => {
        if (nextMode === "active") processListRef.current?.focus()
        else commandListRef.current?.focus()
      }, 0)
    } else if (key.name === "m") toggleViewMode()
    else if (key.name === "r") runCommand(selectedCommand)
    else if (key.name === "k" && key.shift) stopSelectedExecution()
    else if (key.name === "c") clearSelectedLogs()
    else if (key.name === "d") void refreshCommands()
    else if (key.name === "tab" && narrowRunner) {
      key.preventDefault()
      if (narrowPane === "commands") focusLogPane()
      else focusCommandPane()
    } else if (key.name === "[") cycleExecution(-1)
    else if (key.name === "]") cycleExecution(1)
  })

  const activeExecutionByCommandId = useMemo(() => {
    const activeByCommand = new Map<string, RunnerExecution>()
    for (const execution of executions) {
      const active = execution.status === "running" || execution.status === "stopping"
      if (active && !activeByCommand.has(execution.commandKey)) {
        activeByCommand.set(execution.commandKey, execution)
      }
    }
    return activeByCommand
  }, [executions])
  const commandOptions = useMemo(
    () =>
      commands.map((command) => {
        const key = commandKey(projectRoot, command.id)
        const commandIsActive = activeExecutionByCommandId.has(key)
        const selection = selectedCommandKeys.has(key)
        return {
          name: groupSelectionMode
            ? `${selection ? "☑" : "☐"} ${commandIsActive ? "● RODANDO ·" : ""} ${command.label}`
            : `${commandIsActive ? "● RODANDO ·" : RUNNER_CATEGORY_ICONS[command.category]} ${command.label}`,
          description: command.displayCommand,
          value: command.id,
        }
      }),
    [activeExecutionByCommandId, commands, groupSelectionMode, projectRoot, selectedCommandKeys],
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
  const commandPanelWidth = narrowRunner
    ? Math.max(1, terminal.width - 2)
    : Math.min(42, Math.max(30, Math.floor(terminal.width * 0.31)))
  const compactCommandHeader = commandPanelWidth < 42
  const actionMenuHeight =
    moreActionsOpen && pickerMode === "closed" && projectAvailable !== false ? 4 : 0
  const appHeaderHeight = LAYOUT.compact ? 1 : 2
  const runnerChromeHeight = appHeaderHeight + LAYOUT.outerPadding + 3 + LAYOUT.headerSpacing + 1
  const runnerMainHeight = Math.max(6, terminal.height - runnerChromeHeight - actionMenuHeight)
  const runnerPanelHeight = Math.max(
    4,
    runnerMainHeight - (narrowRunner ? 1 + LAYOUT.headerSpacing : 0),
  )
  const commandPanelHeight = runnerPanelHeight
  const multiRailWidth = narrowRunner ? 5 : 7
  const visibleMultiRailCount = (hiddenMultiBefore ? 1 : 0) + (hiddenMultiAfter ? 1 : 0)
  const multiItemCount = visibleMultiExecutions.length + visibleMultiRailCount
  const multiContentWidth = narrowRunner
    ? Math.max(24, terminal.width - 2)
    : Math.max(24, terminal.width - commandPanelWidth - LAYOUT.gap - 4)
  const multiPaneWidth = Math.max(
    18,
    Math.floor(
      (multiContentWidth -
        visibleMultiRailCount * multiRailWidth -
        Math.max(0, multiItemCount - 1) * LAYOUT.gap) /
        Math.max(1, visibleMultiExecutions.length),
    ),
  )
  const multiLogHeight = Math.max(4, runnerPanelHeight - 6)
  const showCommandDetails =
    listMode === "commands" && terminal.height >= 28 && commandPanelHeight >= 10
  const logWidth = narrowRunner
    ? Math.max(8, terminal.width - 6)
    : Math.max(20, terminal.width - commandPanelWidth - 11)
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
  const historyOptions = historyExpanded
    ? projectExecutions.map((execution) => {
        const duration = (execution.endedAt ?? now) - execution.startedAt
        return {
          name: fitLine(
            `${statusMarker(execution.status)} ${statusLabel(execution.status)} · ${execution.label}  ${formatDuration(duration)}`,
            logWidth,
          ),
          description: "",
          value: execution.id,
        }
      })
    : []
  const selectedHistoryIndex = Math.max(
    0,
    projectExecutions.findIndex((execution) => execution.id === selectedExecution?.id),
  )
  const elapsed = selectedExecution
    ? (selectedExecution.endedAt ?? now) - selectedExecution.startedAt
    : 0
  const runningCount = executions.filter((execution) => execution.status === "running").length
  const selectedCommandExecution = selectedCommand
    ? activeExecutionByCommandId.get(commandKey(projectRoot, selectedCommand.id))
    : undefined
  const runnerSummary =
    projectAvailable === false
      ? "SEM PROJETO · ESCOLHA UMA PASTA"
      : groupSelectionMode
        ? `SELEÇÃO EM GRUPO  ·  ${groupCommands.length} MARCADO${groupCommands.length === 1 ? "" : "S"}`
        : `${commands.length} COMANDOS  ·  ${runningCount} ATIVO${runningCount === 1 ? "" : "S"}`
  const processOptions = activeExecutions.map((execution) => {
    const ports = listeningPorts.filter((port) => port.groupId === execution.pid)
    return {
      name: `● RODANDO · ${execution.projectName}/${execution.label}${ports.length ? `  ·  ◉ ${ports.map(portAddress).join(" ")}` : ""}`,
      description: "",
      value: execution.id,
    }
  })
  const compactRunnerSummary =
    projectAvailable === false ? "SEM PROJETO" : `${commands.length} CMD  ·  ${runningCount} ATIV`
  const displayedRunnerSummary = narrowRunner
    ? ""
    : terminal.width < 90
      ? compactRunnerSummary
      : runnerSummary
  const projectTabAreaWidth = Math.max(10, terminal.width - displayedRunnerSummary.length - 18)
  const projectTabWidth = Math.max(
    11,
    Math.min(30, Math.floor(projectTabAreaWidth / Math.max(1, openedProjects.length))),
  )
  const compactProjectClose = projectTabWidth < 18
  const projectCloseLabel = compactProjectClose ? "[⌃X]" : "[Ctrl+X]"
  const projectCloseControlWidth = compactProjectClose ? 6 : 10
  const compactActions = terminal.width < 110

  return (
    <box
      id="runner-workspace"
      style={{
        flexGrow: 1,
        backgroundColor: LAYOUT.workspaceBackground,
        paddingTop: LAYOUT.outerPadding,
        paddingLeft: LAYOUT.outerPadding,
        paddingRight: LAYOUT.outerPadding,
        paddingBottom: 0,
      }}
    >
      <box
        key={LAYOUT.compact ? "runner-header-compact" : "runner-header-framed"}
        style={{
          height: 3,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          ...panelBorder(),
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
          marginBottom: LAYOUT.headerSpacing,
        }}
      >
        <box style={{ flexGrow: 1, flexDirection: "row", alignItems: "center" }}>
          <text content="▶ RUNNER / " style={{ fg: COLORS.runner }} />
          {openedProjects.map((project, index) => {
            const shortcut = RUNNER_PROJECT_TAB_SHORTCUTS[index]
            if (!shortcut) return null
            const selected = project.path === projectRoot
            return (
              <box
                key={project.path}
                style={{
                  width: projectTabWidth,
                  flexShrink: 0,
                  flexDirection: "row",
                }}
              >
                <InlineButton
                  label={fitLine(
                    `[${shortcut}] ${project.name}`,
                    Math.max(3, projectTabWidth - projectCloseControlWidth - 2),
                  )}
                  accent={COLORS.runner}
                  active={selected}
                  onPress={() => switchProject(project.path)}
                />
                <InlineButton
                  label={projectCloseLabel}
                  accent={COLORS.danger}
                  onPress={() => closeProject(project.path)}
                />
              </box>
            )
          })}
        </box>
        <text
          content={displayedRunnerSummary}
          style={{
            fg: runningCount ? COLORS.success : COLORS.muted,
          }}
        />
      </box>

      {pickerMode !== "closed" ? (
        <box
          key={LAYOUT.compact ? "runner-picker-compact" : "runner-picker-framed"}
          style={{
            position: "relative",
            flexGrow: 1,
            ...panelBorder(COLORS.runner),
            backgroundColor: COLORS.panel,
            paddingLeft: 2,
            paddingRight: 2,
          }}
        >
          <box
            style={{
              height: 2,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <text
              content={pickerMode === "projects" ? "◆ PROJETOS" : "◇ NAVEGADOR DE PASTAS"}
              style={{ fg: COLORS.runner }}
            />
            <text
              content={
                pickerMode === "projects"
                  ? `${filteredProjects.length} REPOSITÓRIOS GIT`
                  : `${filteredDirectoryEntries.length} PASTAS`
              }
              style={{ fg: COLORS.muted }}
            />
          </box>
          <input
            ref={projectSearchRef}
            id="runner-project-search"
            value={projectSearch}
            placeholder="⌕ Filtrar por nome ou caminho…"
            onInput={setProjectSearch}
            onMouseDown={() => projectSearchRef.current?.focus()}
            onSubmit={() => {
              if (pickerMode === "directories") directoryListRef.current?.focus()
              else projectListRef.current?.focus()
            }}
            width={Math.max(30, terminal.width - 10)}
            style={{
              backgroundColor: COLORS.panelRaised,
              focusedBackgroundColor: COLORS.panelRaised,
              textColor: COLORS.text,
              focusedTextColor: COLORS.text,
              cursorColor: COLORS.runner,
              marginBottom: 1,
            }}
          />
          {projectPickerError ? (
            <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
              <text content={projectPickerError} style={{ fg: COLORS.danger }} />
            </box>
          ) : pickerMode === "projects" ? (
            <select
              ref={projectListRef}
              id="runner-project-list"
              options={projectOptions}
              onSelect={(_index, option) => {
                if (typeof option?.value !== "string") return
                if (option.value === RUNNER_DIRECTORY_PICKER_OPTION) {
                  setProjectSearch("")
                  void loadDirectory(homedir())
                  return
                }
                switchProject(option.value)
              }}
              onMouseDown={(event) =>
                handleSelectMouseDown(event, projectListRef.current, {
                  optionCount: projectOptions.length,
                  showDescription: true,
                  activateOnClick: true,
                })
              }
              onMouseScroll={(event) => handleSelectMouseScroll(event, projectListRef.current)}
              showDescription
              showScrollIndicator
              wrapSelection
              style={{
                flexGrow: 1,
                backgroundColor: COLORS.panel,
                focusedBackgroundColor: COLORS.panel,
                textColor: COLORS.muted,
                focusedTextColor: COLORS.text,
                selectedBackgroundColor: COLORS.panelRaised,
                selectedTextColor: COLORS.runner,
                descriptionColor: COLORS.muted,
                selectedDescriptionColor: COLORS.text,
              }}
            />
          ) : (
            <select
              ref={directoryListRef}
              id="runner-directory-list"
              options={directoryOptions}
              onSelect={(_index, option) => {
                if (typeof option?.value !== "string") return
                if (option.value === RUNNER_USE_DIRECTORY_OPTION) {
                  switchProject(browserDirectory)
                  return
                }
                setProjectSearch("")
                void loadDirectory(option.value)
              }}
              onMouseDown={(event) =>
                handleSelectMouseDown(event, directoryListRef.current, {
                  optionCount: directoryOptions.length,
                  showDescription: true,
                  activateOnClick: true,
                })
              }
              onMouseScroll={(event) => handleSelectMouseScroll(event, directoryListRef.current)}
              showDescription
              showScrollIndicator
              wrapSelection
              style={{
                flexGrow: 1,
                backgroundColor: COLORS.panel,
                focusedBackgroundColor: COLORS.panel,
                textColor: COLORS.muted,
                focusedTextColor: COLORS.text,
                selectedBackgroundColor: COLORS.panelRaised,
                selectedTextColor: COLORS.runner,
                descriptionColor: COLORS.muted,
                selectedDescriptionColor: COLORS.text,
              }}
            />
          )}
          <RunnerLoadingOverlay
            active={projectsLoading || directoryLoading}
            kind={projectsLoading ? "projects" : "directory"}
          />
        </box>
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
        <box
          style={{
            flexGrow: 1,
            flexDirection: narrowRunner ? "column" : "row",
            gap: narrowRunner ? 0 : LAYOUT.gap,
          }}
        >
          {narrowRunner ? (
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                backgroundColor: COLORS.panel,
                marginBottom: LAYOUT.headerSpacing,
              }}
            >
              <InlineButton
                label="[Tab] Comandos"
                accent={COLORS.runner}
                active={narrowPane === "commands"}
                onPress={focusCommandPane}
              />
              <InlineButton
                label="[Tab] Log"
                accent={COLORS.runner}
                active={narrowPane === "log"}
                onPress={focusLogPane}
              />
              <text content=" · um painel por vez" style={{ fg: COLORS.muted }} />
            </box>
          ) : null}
          {!narrowRunner || narrowPane === "commands" ? (
            <box
              style={{
                width: narrowRunner ? "100%" : commandPanelWidth,
                flexGrow: narrowRunner ? 1 : 0,
                flexShrink: narrowRunner ? 1 : 0,
              }}
            >
              <box
                ref={commandPanelRef}
                id="runner-command-panel"
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
                <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                  <InlineButton
                    id="runner-command-mode"
                    label={
                      compactCommandHeader
                        ? `${listMode === "active" ? "[P] " : ""}CMD ${commands.length}`
                        : `${listMode === "active" ? "[P] " : ""}COMANDOS ${commands.length}`
                    }
                    accent={COLORS.runner}
                    active={listMode === "commands"}
                    onPress={() => {
                      setListMode("commands")
                      setTimeout(() => commandListRef.current?.focus(), 0)
                    }}
                  />
                  <InlineButton
                    id="runner-active-mode"
                    label={
                      compactCommandHeader
                        ? `${listMode === "commands" ? "[P] " : ""}ATIV ${activeExecutions.length}`
                        : `${listMode === "commands" ? "[P] " : ""}ATIVOS ${activeExecutions.length}`
                    }
                    accent={COLORS.success}
                    active={listMode === "active"}
                    onPress={() => {
                      exitGroupSelection()
                      setListMode("active")
                      setSelectedExecutionId(activeExecutions[0]?.id ?? null)
                      setTimeout(() => processListRef.current?.focus(), 0)
                    }}
                  />
                  {listMode === "commands" ? (
                    <InlineButton
                      id="runner-scan"
                      label={compactCommandHeader ? "[D]" : "[D] Scan"}
                      accent={COLORS.runner}
                      disabled={loading}
                      onPress={() => void refreshCommands()}
                    />
                  ) : null}
                </box>
                {listMode === "commands" ? (
                  <>
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
                      width={commandPanelWidth - 4}
                      style={{
                        backgroundColor: COLORS.panelRaised,
                        focusedBackgroundColor: COLORS.panelRaised,
                        textColor: COLORS.text,
                        focusedTextColor: COLORS.text,
                        cursorColor: COLORS.runner,
                      }}
                    />
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
                {listMode === "active" ? (
                  processOptions.length ? (
                    <select
                      ref={processListRef}
                      id="runner-process-list"
                      options={processOptions}
                      selectedIndex={Math.max(
                        0,
                        activeExecutions.findIndex(
                          (execution) => execution.id === selectedExecution?.id,
                        ),
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
                      onMouseScroll={(event) =>
                        handleSelectMouseScroll(event, processListRef.current)
                      }
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
                      <text
                        content="Volte a Comandos para iniciar um."
                        style={{ fg: COLORS.muted }}
                      />
                    </box>
                  )
                ) : discoveryError ? (
                  <text content={discoveryError} style={{ fg: COLORS.danger }} />
                ) : commandOptions.length ? (
                  <select
                    ref={commandListRef}
                    id="runner-command-list"
                    options={commandOptions}
                    selectedIndex={selectedCommandIndex}
                    onChange={(_index, option) => {
                      if (typeof option?.value === "string") {
                        selectCommand(option.value)
                      }
                    }}
                    onSelect={(_index, option) => {
                      if (typeof option?.value !== "string") return
                      if (groupSelectionMode) {
                        selectCommand(option.value)
                        toggleCommandGroup(option.value)
                        return
                      }
                      openOrRunCommand(commands.find((command) => command.id === option.value))
                    }}
                    onMouseDown={(event) => {
                      setFocusPane("commands")
                      handleSelectMouseDown(event, commandListRef.current, {
                        optionCount: commandOptions.length,
                        showDescription: true,
                      })
                    }}
                    onMouseScroll={(event) =>
                      handleSelectMouseScroll(event, commandListRef.current)
                    }
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
                {listMode === "commands" ? (
                  <InlineButton
                    id="runner-open-project"
                    label="[N] EXECUTAR EM OUTRO PROJETO…"
                    accent={COLORS.runner}
                    onPress={() => void openProjectPicker()}
                  />
                ) : null}
                {selectedCommand && showCommandDetails ? (
                  <box
                    style={{
                      height: 3,
                      flexShrink: 0,
                      border:
                        LAYOUT.compact && focusPane === "history"
                          ? (["top", "left"] as const)
                          : (["top"] as const),
                      borderColor: COLORS.border,
                    }}
                  >
                    <text
                      id="runner-command-detail"
                      content={fitLine(
                        `❯ ${selectedCommand.displayCommand}`,
                        commandPanelWidth - 4,
                      )}
                      style={{ fg: COLORS.text }}
                    />
                    <ShortcutText
                      id="runner-command-detail-meta"
                      highlight={Boolean(selectedCommandExecution)}
                      content={fitLine(
                        selectedCommandExecution
                          ? `● processo ativo${selectedCommandExecution.pid ? ` #${selectedCommandExecution.pid}` : ""} · [Enter] abre · [R] inicia outro`
                          : `${selectedCommand.description} · ${selectedCommand.source ?? "detectado"}${selectedCommand.interactive ? " · PTY" : ""}`,
                        commandPanelWidth - 4,
                      )}
                      style={{
                        fg: selectedCommandExecution ? COLORS.success : COLORS.muted,
                      }}
                    />
                  </box>
                ) : null}
                <RunnerLoadingOverlay active={listMode === "commands" && loading} kind="commands" />
              </box>
            </box>
          ) : null}

          {!narrowRunner || narrowPane === "log" ? (
            viewMode === "multi" ? (
              <MultiProcessPanel
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
              <box
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
                    flexDirection: "row",
                    justifyContent: "space-between",
                    backgroundColor: COLORS.panelRaised,
                    paddingLeft: 1,
                    paddingRight: 1,
                  }}
                >
                  <text
                    content={
                      runnerNotice
                        ? fitLine(runnerNotice, logWidth - 24)
                        : selectedExecution
                          ? fitLine(
                              `LOG  /  ${selectedExecution.projectName}  /  ${selectedExecution.label}`,
                              logWidth - 24,
                            )
                          : shortRunner
                            ? "LOG"
                            : "LOG DO PROCESSO"
                    }
                    style={{ fg: COLORS.runner }}
                  />
                  <text
                    content={
                      selectedExecution
                        ? shortRunner
                          ? statusMarker(selectedExecution.status)
                          : `${statusMarker(selectedExecution.status)} ${statusLabel(selectedExecution.status)}${healthLabel(selectedExecution.health)}  ${formatDuration(elapsed)}${selectedExecution.pid ? `  #${selectedExecution.pid}` : ""}`
                        : shortRunner
                          ? "◇"
                          : "◇ AGUARDANDO"
                    }
                    style={{
                      fg: selectedExecution ? statusColor(selectedExecution.status) : COLORS.muted,
                    }}
                  />
                </box>

                {logFilterOpen ? (
                  <input
                    ref={logFilterRef}
                    id="runner-log-filter"
                    value={logFilter}
                    placeholder="Filtrar log…"
                    onInput={(value) => dispatchLogPreferences({ type: "filter", value })}
                    onSubmit={() => logFilterRef.current?.blur()}
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
                      <text
                        content="A saída aparecerá aqui em tempo real."
                        style={{ fg: COLORS.muted }}
                      />
                    </box>
                  )}
                </scrollbox>

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

                {shortRunner ? null : historyExpanded ? (
                  <box
                    ref={historyPanelRef}
                    id="runner-history-panel"
                    focusable
                    style={{
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
                      <InlineButton
                        label="[S] Recolher"
                        accent={COLORS.runner}
                        onPress={toggleHistoryPane}
                      />
                    </box>
                    {historyOptions.length ? (
                      <select
                        ref={historyListRef}
                        id="runner-history-list"
                        options={historyOptions}
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
                        onMouseScroll={(event) =>
                          handleSelectMouseScroll(event, historyListRef.current)
                        }
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
                      <text
                        content="Nenhuma execução neste projeto."
                        style={{ fg: COLORS.muted }}
                      />
                    )}
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
                    <InlineButton
                      label="[S] Histórico"
                      accent={COLORS.runner}
                      onPress={toggleHistoryPane}
                    />
                    <text
                      content={`${projectExecutions.length} execuç${projectExecutions.length === 1 ? "ão" : "ões"}`}
                      style={{ fg: COLORS.muted }}
                    />
                  </box>
                )}
              </box>
            )
          ) : null}
        </box>
      )}

      {actionMenuHeight ? (
        <box
          style={{
            height: actionMenuHeight,
            flexShrink: 0,
            ...panelBorder(COLORS.runner),
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <text content="MAIS  " style={{ fg: COLORS.runner }} />
            <InlineButton
              label={compactActions ? "[Del]" : "[Del] Remover salvo"}
              accent={COLORS.danger}
              disabled={selectedCommand?.source !== "saved"}
              onPress={deleteSelectedSavedCommand}
            />
            <InlineButton
              label={
                compactActions
                  ? `[E] ${selectedProfile?.label ?? "env"}`
                  : `[E] Ambiente: ${selectedProfile?.label ?? "padrão"}`
              }
              accent={COLORS.runner}
              disabled={!environmentProfiles.length}
              onPress={cycleEnvironmentProfile}
            />
            <InlineButton label="[M] Multi" accent={COLORS.runner} onPress={toggleViewMode} />
          </box>
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <text content="LOG   " style={{ fg: COLORS.muted }} />
            <InlineButton
              label={runnerLogFilterLabel({
                viewMode,
                narrow: narrowRunner,
                compact: compactActions,
                filter: logFilter,
              })}
              accent={COLORS.runner}
              active={logFilterOpen || Boolean(logFilter)}
              onPress={() => {
                setLogFilterOpen(true)
                setTimeout(() => logFilterRef.current?.focus(), 0)
              }}
            />
            <InlineButton
              label={`[V] ${logStream}`}
              accent={COLORS.runner}
              active={logStream !== "all"}
              onPress={cycleLogStream}
            />
            <InlineButton
              label={narrowRunner ? "[T]" : compactActions ? "[T] Hora" : "[T] Horários"}
              accent={COLORS.runner}
              active={showTimestamps}
              onPress={() => dispatchLogPreferences({ type: "toggle-timestamps" })}
            />
            <InlineButton
              label={narrowRunner ? "[Y] Copiar" : compactActions ? "[Y] Copiar" : "[Y] Copiar log"}
              accent={COLORS.runner}
              disabled={!selectedExecution?.logs.length}
              onPress={copySelectedLogs}
            />
            <InlineButton
              label={
                narrowRunner ? "[X] Export." : compactActions ? "[X] Export." : "[X] Exportar log"
              }
              accent={COLORS.runner}
              disabled={!selectedExecution?.logs.length}
              onPress={exportSelectedLogs}
            />
          </box>
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <text content="PROC. " style={{ fg: COLORS.muted }} />
            <InlineButton
              label={compactActions ? "[I] stdin" : "[I] Entrada do processo"}
              accent={COLORS.runner}
              disabled={!selectedProcessHandle}
              onPress={() => processInputRef.current?.focus()}
            />
            <InlineButton
              label="[C] Limpar"
              accent={COLORS.runner}
              disabled={!selectedExecution}
              onPress={clearSelectedLogs}
            />
            {selectedPortUrl ? (
              <>
                <InlineButton
                  label="[O] Abrir"
                  accent={COLORS.success}
                  onPress={openSelectedPort}
                />
                <InlineButton label="[U] URL" accent={COLORS.runner} onPress={copySelectedPort} />
                <InlineButton
                  label="[H] HTTP"
                  accent={COLORS.runner}
                  disabled={!onOpenHttp}
                  onPress={sendSelectedPortToHttp}
                />
              </>
            ) : (
              <text content="sem porta detectada" style={{ fg: COLORS.muted }} />
            )}
          </box>
        </box>
      ) : null}

      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
        }}
      >
        {pickerMode !== "closed" ? (
          <>
            <InlineButton
              label="[/] Buscar"
              accent={COLORS.runner}
              onPress={() => projectSearchRef.current?.focus()}
            />
            <InlineButton
              label="[Esc] Voltar"
              accent={COLORS.runner}
              onPress={() => {
                setPickerMode("closed")
                setProjectSearch("")
              }}
            />
          </>
        ) : projectAvailable === false ? (
          <InlineButton
            label="[N] Escolher projeto"
            accent={COLORS.runner}
            onPress={() => void openProjectPicker()}
          />
        ) : focusPane === "history" && historyExpanded ? (
          <>
            <InlineButton label="[H/←] Lista" accent={COLORS.runner} onPress={focusCommandPane} />
            <InlineButton label="[K/↑] Log" accent={COLORS.runner} onPress={focusLogPane} />
            <ShortcutText
              content={` ${translateUi("[J/K] Navegar")} `}
              style={{ fg: COLORS.muted }}
            />
            <InlineButton label="[S] Recolher" accent={COLORS.runner} onPress={toggleHistoryPane} />
          </>
        ) : focusPane === "log" && viewMode === "single" ? (
          <>
            <InlineButton label="[H/←] Lista" accent={COLORS.runner} onPress={focusCommandPane} />
            <ShortcutText
              content={` ${translateUi("[J/K] Rolar")} `}
              style={{ fg: COLORS.muted }}
            />
            {shortRunner ? null : (
              <InlineButton
                label={historyExpanded ? "[S] Recolher" : "[S] Histórico"}
                accent={COLORS.runner}
                onPress={toggleHistoryPane}
              />
            )}
            <InlineButton
              label="[A] Mais…"
              accent={COLORS.runner}
              active={moreActionsOpen}
              onPress={() => setMoreActionsOpen((current) => !current)}
            />
          </>
        ) : groupSelectionMode ? (
          <>
            <text
              content={`${groupCommands.length} selecionado${groupCommands.length === 1 ? "" : "s"}  `}
              style={{ fg: COLORS.runner }}
            />
            <InlineButton
              label={narrowRunner ? "[Spc]" : "[Espaço] Marcar"}
              accent={COLORS.runner}
              active={
                selectedCommand
                  ? selectedCommandKeys.has(commandKey(projectRoot, selectedCommand.id))
                  : false
              }
              disabled={!selectedCommand}
              onPress={toggleSelectedCommandGroup}
            />
            <InlineButton
              label="[G] Rodar"
              accent={COLORS.success}
              disabled={!groupCommands.length}
              onPress={runCommandGroup}
            />
            <InlineButton
              label="[⇧G] Parar"
              accent={COLORS.danger}
              disabled={!groupCommands.length}
              onPress={stopCommandGroup}
            />
            <InlineButton
              label={narrowRunner ? "[⇧R] Rein." : "[⇧R] Reiniciar"}
              accent={COLORS.warning}
              disabled={!groupCommands.length}
              onPress={restartCommandGroup}
            />
            <InlineButton
              label={narrowRunner ? "[Esc]" : "[Esc] Sair"}
              accent={COLORS.runner}
              onPress={exitGroupSelection}
            />
          </>
        ) : viewMode === "multi" ? (
          <>
            <InlineButton label="[M] Único" accent={COLORS.runner} onPress={toggleViewMode} />
            {activeExecutions.length ? (
              <>
                <InlineButton
                  label="[←] Foco"
                  accent={COLORS.runner}
                  onPress={() => cycleActiveExecution(-1)}
                />
                <InlineButton
                  label="[→] Foco"
                  accent={COLORS.runner}
                  onPress={() => cycleActiveExecution(1)}
                />
                <InlineButton
                  label="[⇧K] Parar"
                  accent={COLORS.danger}
                  disabled={selectedExecution?.status !== "running"}
                  onPress={stopSelectedExecution}
                />
              </>
            ) : null}
            <InlineButton
              label="[Shift+A] Mais…"
              accent={COLORS.runner}
              active={moreActionsOpen}
              onPress={() => setMoreActionsOpen((current) => !current)}
            />
          </>
        ) : listMode === "active" ? (
          <>
            <InlineButton label="[L/→] Log" accent={COLORS.runner} onPress={focusLogPane} />
            <InlineButton
              label="[↵] Ver log"
              accent={COLORS.runner}
              disabled={!selectedExecution}
              onPress={() => {
                if (narrowRunner) setNarrowPane("log")
              }}
            />
            <InlineButton
              label="[⇧K] Parar"
              accent={COLORS.danger}
              disabled={selectedExecution?.status !== "running"}
              onPress={stopSelectedExecution}
            />
            <InlineButton label="[M] Multi" accent={COLORS.runner} onPress={toggleViewMode} />
            <InlineButton
              label="[A] Mais…"
              accent={COLORS.runner}
              active={moreActionsOpen}
              onPress={() => setMoreActionsOpen((current) => !current)}
            />
          </>
        ) : (
          <>
            <InlineButton label="[L/→] Log" accent={COLORS.runner} onPress={focusLogPane} />
            {narrowRunner ? null : (
              <InlineButton
                label={compactActions ? "[/] Cmd" : "[/] Comando"}
                accent={COLORS.runner}
                onPress={() => manualInputRef.current?.focus()}
              />
            )}
            <InlineButton
              label={narrowRunner ? "[↵] Rodar" : "[↵] Abrir"}
              accent={COLORS.runner}
              disabled={!selectedCommand}
              onPress={() => openOrRunCommand(selectedCommand)}
            />
            <InlineButton
              label="[R] Nova"
              accent={COLORS.runner}
              disabled={!selectedCommand}
              onPress={() => runCommand(selectedCommand)}
            />
            <InlineButton
              label="[⇧K] Parar"
              accent={COLORS.danger}
              disabled={selectedExecution?.status !== "running"}
              onPress={stopSelectedExecution}
            />
            <InlineButton
              label={
                narrowRunner
                  ? "[Spc] Grupo"
                  : compactActions
                    ? "[Espaço] Sel."
                    : "[Espaço] Selecionar grupo"
              }
              accent={COLORS.runner}
              disabled={!selectedCommand}
              onPress={toggleSelectedCommandGroup}
            />
            <InlineButton
              id="runner-configuration"
              label="[Ctrl+Y] Config"
              accent={COLORS.runner}
              onPress={() => setConfigurationOpen(true)}
            />
            <InlineButton
              label={narrowRunner ? "[A] Mais" : "[A] Mais…"}
              accent={COLORS.runner}
              active={moreActionsOpen}
              onPress={() => setMoreActionsOpen((current) => !current)}
            />
          </>
        )}
      </box>
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
    </box>
  )
}
