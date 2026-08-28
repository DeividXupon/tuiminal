import { homedir } from "node:os"
import { basename, dirname } from "node:path"
import type { InputRenderable, SelectRenderable } from "@opentui/core"
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  createShellRunnerCommand,
  discoverRunnerListeningPorts,
  discoverRunnerCommands,
  discoverRunnerProjects,
  listRunnerDirectories,
  RUNNER_WORKING_DIRECTORY,
  startRunnerProcess,
  type RunnerCommand,
  type RunnerDirectoryEntry,
  type RunnerListeningPort,
  type RunnerOutputStream,
  type RunnerProcessHandle,
  type RunnerProject,
} from "../runner"
import { COLORS } from "../theme"

type ExecutionStatus =
  | "running"
  | "stopping"
  | "success"
  | "failed"
  | "stopped"

type ExecutionLog = {
  id: number
  text: string
  stream: RunnerOutputStream | "system"
}

type RunnerExecution = {
  id: string
  commandId: string
  commandKey: string
  label: string
  displayCommand: string
  projectRoot: string
  projectName: string
  status: ExecutionStatus
  pid: number | null
  startedAt: number
  endedAt: number | null
  exitCode: number | null
  logs: ExecutionLog[]
}

const CATEGORY_ICONS: Record<RunnerCommand["category"], string> = {
  package: "◇",
  composer: "◒",
  php: "◆",
  python: "◈",
  go: "◎",
  rust: "⬢",
  ruby: "◇",
  java: "◉",
  dotnet: "◫",
  deno: "◐",
  task: "▣",
  make: "◆",
  just: "◈",
  docker: "⬡",
  custom: "❯",
}

const PROJECT_PICKER_OPTION = "__runner:project-picker__"
const DIRECTORY_PICKER_OPTION = "__runner:directory-picker__"
const USE_DIRECTORY_OPTION = "__runner:use-directory__"
const PROJECT_TAB_SHORTCUTS = [
  { symbol: "!", key: "1" },
  { symbol: "@", key: "2" },
  { symbol: "#", key: "3" },
  { symbol: "$", key: "4" },
] as const

type RunnerViewMode = "single" | "multi"
type ProjectPickerMode = "closed" | "projects" | "directories"

function fitLine(line: string, width: number) {
  const clean = line.replace(/\t/g, "  ").replace(/[\r\n]/g, "")
  if (clean.length <= width) return clean.padEnd(width, " ")
  return `${clean.slice(0, Math.max(0, width - 1))}…`
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`
}

function statusMarker(status: ExecutionStatus) {
  switch (status) {
    case "running":
      return "●"
    case "stopping":
      return "◐"
    case "success":
      return "✓"
    case "failed":
      return "×"
    case "stopped":
      return "■"
  }
}

function statusLabel(status: ExecutionStatus) {
  switch (status) {
    case "running":
      return "RODANDO"
    case "stopping":
      return "ENCERRANDO"
    case "success":
      return "CONCLUÍDO"
    case "failed":
      return "FALHOU"
    case "stopped":
      return "INTERROMPIDO"
  }
}

function statusColor(status: ExecutionStatus) {
  switch (status) {
    case "running":
      return COLORS.runner
    case "stopping":
      return COLORS.warning
    case "success":
      return COLORS.success
    case "failed":
      return COLORS.danger
    case "stopped":
      return COLORS.muted
  }
}

function isErrorLog(log: ExecutionLog) {
  return /\b(error|failed|failure|fatal)\b|[×✗]/i.test(log.text)
}

function logColor(log: ExecutionLog) {
  if (isErrorLog(log)) {
    return COLORS.danger
  }
  if (/\b(success|passed|ready|done)\b|[✓✔]/i.test(log.text)) {
    return COLORS.success
  }
  if (log.stream === "system") return COLORS.runner
  if (log.stream === "stderr") return COLORS.warning
  return COLORS.text
}

function logPrefix(log: ExecutionLog) {
  if (isErrorLog(log)) return "!"
  if (log.stream === "system") return "›"
  if (log.stream === "stderr") return "·"
  return " "
}

function commandKey(projectRoot: string, commandId: string) {
  return `${projectRoot}\u0000${commandId}`
}

function portAddress(port: RunnerListeningPort) {
  return `${port.host}:${port.port}`
}

export function Runner({ active }: { active: boolean }) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const commandListRef = useRef<SelectRenderable | null>(null)
  const processListRef = useRef<SelectRenderable | null>(null)
  const manualInputRef = useRef<InputRenderable | null>(null)
  const projectListRef = useRef<SelectRenderable | null>(null)
  const directoryListRef = useRef<SelectRenderable | null>(null)
  const projectSearchRef = useRef<InputRenderable | null>(null)
  const handlesRef = useRef(new Map<string, RunnerProcessHandle>())
  const executionSequence = useRef(0)
  const logSequence = useRef(0)
  const discoverySequence = useRef(0)
  const mountedRef = useRef(true)
  const [projectRoot, setProjectRoot] = useState(RUNNER_WORKING_DIRECTORY)
  const [openedProjects, setOpenedProjects] = useState<RunnerProject[]>([{
    path: RUNNER_WORKING_DIRECTORY,
    name: basename(RUNNER_WORKING_DIRECTORY),
    displayPath: RUNNER_WORKING_DIRECTORY,
  }])
  const [commands, setCommands] = useState<RunnerCommand[]>([])
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null)
  const [executions, setExecutions] = useState<RunnerExecution[]>([])
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [manualCommand, setManualCommand] = useState("")
  const [viewMode, setViewMode] = useState<RunnerViewMode>("single")
  const [multiPage, setMultiPage] = useState(0)
  const [listeningPorts, setListeningPorts] = useState<RunnerListeningPort[]>([])
  const [pickerMode, setPickerMode] = useState<ProjectPickerMode>("closed")
  const [projects, setProjects] = useState<RunnerProject[]>([])
  const [projectSearch, setProjectSearch] = useState("")
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectPickerError, setProjectPickerError] = useState<string | null>(null)
  const [browserDirectory, setBrowserDirectory] = useState(homedir())
  const [directoryEntries, setDirectoryEntries] = useState<RunnerDirectoryEntry[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [now, setNow] = useState(Date.now())

  const refreshCommands = useCallback(async () => {
    const sequence = discoverySequence.current + 1
    discoverySequence.current = sequence
    setLoading(true)
    setDiscoveryError(null)
    try {
      const discovered = await discoverRunnerCommands(projectRoot)
      if (!mountedRef.current || discoverySequence.current !== sequence) return
      setCommands(discovered)
      setSelectedCommandId((current) =>
        discovered.some((command) => command.id === current)
          ? current
          : (discovered[0]?.id ?? null),
      )
    } catch (error) {
      if (!mountedRef.current || discoverySequence.current !== sequence) return
      setDiscoveryError(
        error instanceof Error
          ? error.message
          : "Não foi possível detectar os comandos.",
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
      for (const handle of handlesRef.current.values()) handle.stop()
      handlesRef.current.clear()
    }
  }, [])

  useEffect(() => {
    void refreshCommands()
  }, [refreshCommands])

  useEffect(() => {
    if (!active) return
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
  }, [
    active,
    directoryLoading,
    loading,
    pickerMode,
    projectsLoading,
    viewMode,
  ])

  const hasRunningExecutions = executions.some(
    (execution) =>
      execution.status === "running" || execution.status === "stopping",
  )
  useEffect(() => {
    if (!hasRunningExecutions) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [hasRunningExecutions])

  const runningProcessGroupKey = executions
    .filter(
      (execution) =>
        execution.pid &&
        (execution.status === "running" || execution.status === "stopping"),
    )
    .map((execution) => execution.pid as number)
    .join(":")

  useEffect(() => {
    let cancelled = false
    const runningProcessGroupIds = runningProcessGroupKey
      .split(":")
      .filter(Boolean)
      .map((pid) => Number.parseInt(pid, 10))
    if (!runningProcessGroupIds.length) {
      setListeningPorts([])
      return
    }
    const refreshPorts = async () => {
      const ports = await discoverRunnerListeningPorts(runningProcessGroupIds)
      if (!cancelled && mountedRef.current) setListeningPorts(ports)
    }
    void refreshPorts()
    const interval = setInterval(() => void refreshPorts(), 1500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [runningProcessGroupKey])

  const appendLog = useCallback(
    (
      executionId: string,
      text: string,
      stream: RunnerOutputStream | "system",
    ) => {
      if (!mountedRef.current) return
      if (!text.trim()) return
      const log: ExecutionLog = {
        id: logSequence.current,
        text,
        stream,
      }
      logSequence.current += 1
      setExecutions((current) =>
        current.map((execution) =>
          execution.id === executionId
            ? { ...execution, logs: [...execution.logs, log].slice(-1200) }
            : execution,
        ),
      )
    },
    [],
  )

  const runCommand = useCallback(
    (command?: RunnerCommand) => {
      if (!command) return
      const executionProjectRoot = projectRoot
      const executionId = `${Date.now()}:${executionSequence.current}`
      executionSequence.current += 1
      const startedAt = Date.now()
      const execution: RunnerExecution = {
        id: executionId,
        commandId: command.id,
        commandKey: commandKey(executionProjectRoot, command.id),
        label: command.label,
        displayCommand: command.displayCommand,
        projectRoot: executionProjectRoot,
        projectName: basename(executionProjectRoot),
        status: "running",
        pid: null,
        startedAt,
        endedAt: null,
        exitCode: null,
        logs: [{
          id: logSequence.current,
          text: `❯ ${command.displayCommand}`,
          stream: "system",
        }],
      }
      logSequence.current += 1
      setExecutions((current) => {
        let completedKept = 0
        return [execution, ...current].filter((item) => {
          const running = item.status === "running" || item.status === "stopping"
          if (running) return true
          completedKept += 1
          return completedKept <= 20
        })
      })
      setSelectedExecutionId(executionId)
      setNow(startedAt)

      try {
        let finished = false
        const handle = startRunnerProcess(
          executionProjectRoot,
          command,
          {
            onLine: (line, stream) => appendLog(executionId, line, stream),
            onExit: ({ code, signal, stopped }) => {
              finished = true
              handlesRef.current.delete(executionId)
              if (!mountedRef.current) return
              const status: ExecutionStatus = stopped
                ? "stopped"
                : code === 0
                  ? "success"
                  : "failed"
              setExecutions((current) =>
                current.map((item) =>
                  item.id === executionId
                    ? {
                        ...item,
                        status,
                        endedAt: Date.now(),
                        exitCode: code,
                      }
                    : item,
                ),
              )
              const detail = stopped
                ? "processo interrompido"
                : code === 0
                  ? "processo concluído"
                  : `processo finalizado${code === null ? "" : ` com código ${code}`}${signal ? ` (${signal})` : ""}`
              appendLog(executionId, detail, "system")
            },
          },
        )
        if (!finished) handlesRef.current.set(executionId, handle)
        setExecutions((current) =>
          current.map((item) =>
            item.id === executionId ? { ...item, pid: handle.pid } : item,
          ),
        )
      } catch (error) {
        setExecutions((current) =>
          current.map((item) =>
            item.id === executionId
              ? {
                  ...item,
                  status: "failed",
                  endedAt: Date.now(),
                  logs: [
                    ...item.logs,
                    {
                      id: logSequence.current,
                      text: error instanceof Error
                        ? error.message
                        : "Não foi possível iniciar o comando.",
                      stream: "stderr",
                    } satisfies ExecutionLog,
                  ],
                }
              : item,
          ),
        )
        logSequence.current += 1
      }
    },
    [appendLog, projectRoot],
  )

  const runManualCommand = useCallback(
    (value = manualCommand) => {
      const source = value.trim()
      if (!source) return
      runCommand(createShellRunnerCommand(source))
      setManualCommand("")
      if (manualInputRef.current) manualInputRef.current.value = ""
      commandListRef.current?.focus()
    },
    [manualCommand, runCommand],
  )

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
        error instanceof Error
          ? error.message
          : "Não foi possível procurar projetos Git.",
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
        error instanceof Error
          ? error.message
          : "Não foi possível abrir essa pasta.",
      )
    } finally {
      if (mountedRef.current) setDirectoryLoading(false)
    }
  }, [])

  const switchProject = useCallback((root: string) => {
    setOpenedProjects((current) => {
      if (current.some((project) => project.path === root)) return current
      return [
        ...current,
        { path: root, name: basename(root), displayPath: root },
      ].slice(-PROJECT_TAB_SHORTCUTS.length)
    })
    setProjectRoot(root)
    setSelectedCommandId(null)
    setSelectedExecutionId(
      executions.find((execution) => execution.projectRoot === root)?.id ?? null,
    )
    setPickerMode("closed")
    setViewMode("single")
    setProjectSearch("")
  }, [executions])

  const selectedCommand = commands.find(
    (command) => command.id === selectedCommandId,
  )
  const selectedExecution = executions.find(
    (execution) => execution.id === selectedExecutionId,
  ) ?? executions[0]

  const stopSelectedExecution = useCallback(() => {
    if (!selectedExecution) return
    const handle = handlesRef.current.get(selectedExecution.id)
    if (!handle) return
    handle.stop()
    appendLog(selectedExecution.id, "encerrando processo…", "system")
    setExecutions((current) =>
      current.map((execution) =>
        execution.id === selectedExecution.id
          ? { ...execution, status: "stopping" }
          : execution,
      ),
    )
  }, [appendLog, selectedExecution])

  const clearSelectedLogs = useCallback(() => {
    if (!selectedExecution) return
    setExecutions((current) =>
      current.map((execution) =>
        execution.id === selectedExecution.id
          ? { ...execution, logs: [] }
          : execution,
      ),
    )
  }, [selectedExecution])

  const cycleExecution = useCallback(
    (direction: number) => {
      if (!executions.length) return
      const currentIndex = Math.max(
        0,
        executions.findIndex(
          (execution) => execution.id === selectedExecution?.id,
        ),
      )
      const nextIndex =
        (currentIndex + direction + executions.length) % executions.length
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
      const latestExecution = activeExecution ?? executions.find(
        (execution) => execution.commandKey === selectedCommandKey,
      )
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
        return
      }
      runCommand(command)
    },
    [executions, projectRoot, runCommand],
  )

  const activeExecutions = useMemo(
    () => executions.filter(
      (execution) =>
        execution.status === "running" || execution.status === "stopping",
    ),
    [executions],
  )
  const multiPaneCapacity = terminal.width >= 126
    ? 3
    : terminal.width >= 72
      ? 2
      : 1
  const multiPageCount = Math.max(
    1,
    Math.ceil(activeExecutions.length / multiPaneCapacity),
  )
  const visibleMultiExecutions = activeExecutions.slice(
    multiPage * multiPaneCapacity,
    multiPage * multiPaneCapacity + multiPaneCapacity,
  )

  useEffect(() => {
    if (multiPage >= multiPageCount) setMultiPage(multiPageCount - 1)
    if (
      viewMode === "multi" &&
      activeExecutions.length &&
      !activeExecutions.some((execution) => execution.id === selectedExecutionId)
    ) {
      setSelectedExecutionId(activeExecutions[0]?.id ?? null)
    }
  }, [activeExecutions, multiPage, multiPageCount, selectedExecutionId, viewMode])

  const toggleViewMode = useCallback(() => {
    setViewMode((current) => current === "single" ? "multi" : "single")
    if (activeExecutions.length) {
      const selectedIndex = Math.max(
        0,
        activeExecutions.findIndex(
          (execution) => execution.id === selectedExecutionId,
        ),
      )
      setMultiPage(Math.floor(selectedIndex / multiPaneCapacity))
      setSelectedExecutionId(activeExecutions[selectedIndex]?.id ?? null)
    }
  }, [activeExecutions, multiPaneCapacity, selectedExecutionId])

  const cycleActiveExecution = useCallback(
    (direction: number) => {
      if (!activeExecutions.length) return
      const currentIndex = Math.max(
        0,
        activeExecutions.findIndex(
          (execution) => execution.id === selectedExecutionId,
        ),
      )
      const nextIndex =
        (currentIndex + direction + activeExecutions.length) %
        activeExecutions.length
      setSelectedExecutionId(activeExecutions[nextIndex]?.id ?? null)
      setMultiPage(Math.floor(nextIndex / multiPaneCapacity))
    },
    [activeExecutions, multiPaneCapacity, selectedExecutionId],
  )

  const cycleMultiPage = useCallback(
    (direction: number) => {
      const nextPage = (multiPage + direction + multiPageCount) % multiPageCount
      setMultiPage(nextPage)
      setSelectedExecutionId(
        activeExecutions[nextPage * multiPaneCapacity]?.id ?? null,
      )
    },
    [activeExecutions, multiPage, multiPageCount, multiPaneCapacity],
  )

  useKeyboard((key) => {
    if (!active) return
    const focusedId = renderer.currentFocusedRenderable?.id
    const editingText = focusedId === "runner-command-input" ||
      focusedId === "runner-project-search"
    if (editingText) {
      if (key.name === "escape") {
        key.preventDefault()
        if (focusedId === "runner-command-input") {
          manualInputRef.current?.blur()
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
    if (viewMode === "multi") {
      if (key.name === "m") toggleViewMode()
      else if (key.name === "left") cycleActiveExecution(-1)
      else if (key.name === "right") cycleActiveExecution(1)
      else if (key.name === "[") cycleMultiPage(-1)
      else if (key.name === "]") cycleMultiPage(1)
      else if (key.name === "k" && key.shift) stopSelectedExecution()
      else if (key.name === "c") clearSelectedLogs()
      return
    }
    const projectShortcutIndex = PROJECT_TAB_SHORTCUTS.findIndex(
      (shortcut) =>
        key.name === shortcut.symbol ||
        (key.shift && key.name === shortcut.key),
    )
    const shortcutProject = openedProjects[projectShortcutIndex]
    if (shortcutProject) {
      key.preventDefault()
      switchProject(shortcutProject.path)
      return
    }
    if (key.name === "/") {
      key.preventDefault()
      manualInputRef.current?.focus()
    }
    else if (key.name === "p" && activeExecutions.length) {
      processListRef.current?.focus()
    }
    else if (key.name === "m") toggleViewMode()
    else if (key.name === "r") runCommand(selectedCommand)
    else if (key.name === "k" && key.shift) stopSelectedExecution()
    else if (key.name === "c") clearSelectedLogs()
    else if (key.name === "d") void refreshCommands()
    else if (key.name === "[") cycleExecution(1)
    else if (key.name === "]") cycleExecution(-1)
  })

  const activeExecutionByCommandId = useMemo(
    () => {
      const activeByCommand = new Map<string, RunnerExecution>()
      for (const execution of executions) {
        const active = execution.status === "running" ||
          execution.status === "stopping"
        if (active && !activeByCommand.has(execution.commandKey)) {
          activeByCommand.set(execution.commandKey, execution)
        }
      }
      return activeByCommand
    },
    [executions],
  )
  const commandOptions = useMemo(
    () => [
      ...commands.map((command) => ({
        name: `${activeExecutionByCommandId.has(commandKey(projectRoot, command.id)) ? "●" : "○"} ${CATEGORY_ICONS[command.category]} ${command.label}`,
        description: "",
        value: command.id,
      })),
      {
        name: "＋ EXECUTAR EM OUTRO PROJETO…",
        description: "",
        value: PROJECT_PICKER_OPTION,
      },
    ],
    [activeExecutionByCommandId, commands, projectRoot],
  )
  const normalizedProjectSearch = projectSearch.trim().toLocaleLowerCase()
  const filteredProjects = projects.filter((project) =>
    !normalizedProjectSearch ||
    `${project.name} ${project.displayPath}`
      .toLocaleLowerCase()
      .includes(normalizedProjectSearch)
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
      value: DIRECTORY_PICKER_OPTION,
    },
  ]
  const filteredDirectoryEntries = directoryEntries.filter((entry) =>
    !normalizedProjectSearch ||
    entry.name.toLocaleLowerCase().includes(normalizedProjectSearch)
  )
  const directoryOptions = [
    {
      name: "✓ USAR ESTA PASTA",
      description: browserDirectory,
      value: USE_DIRECTORY_OPTION,
    },
    ...(browserDirectory !== dirname(browserDirectory)
      ? [{
          name: "↰ ..",
          description: dirname(browserDirectory),
          value: dirname(browserDirectory),
        }]
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
  const commandPanelWidth = Math.min(
    42,
    Math.max(30, Math.floor(terminal.width * 0.31)),
  )
  const runnerMainHeight = Math.max(8, terminal.height - 11)
  const processPanelHeight = activeExecutions.length
    ? Math.min(8, activeExecutions.length + 3)
    : 0
  const commandPanelHeight = Math.max(
    6,
    runnerMainHeight - (processPanelHeight ? processPanelHeight + 1 : 0),
  )
  const multiPaneWidth = Math.max(
    22,
    Math.floor((terminal.width - 4 - Math.max(0, multiPaneCapacity - 1)) /
      multiPaneCapacity),
  )
  const multiLogHeight = Math.max(4, terminal.height - 17)
  const showCommandDetails = terminal.height >= 28 && commandPanelHeight >= 10
  const commandListHeight = Math.max(
    2,
    commandPanelHeight - (showCommandDetails ? 8 : 5),
  )
  const logWidth = Math.max(20, terminal.width - commandPanelWidth - 11)
  const logHeight = Math.max(5, terminal.height - 20)
  const visibleLogs = (selectedExecution?.logs ?? []).slice(-logHeight)
  const elapsed = selectedExecution
    ? (selectedExecution.endedAt ?? now) - selectedExecution.startedAt
    : 0
  const runningCount = executions.filter(
    (execution) => execution.status === "running",
  ).length
  const selectedCommandExecution = selectedCommand
    ? activeExecutionByCommandId.get(commandKey(projectRoot, selectedCommand.id))
    : undefined
  const runnerSummary = `${commands.length} COMANDOS  ·  ${runningCount} ATIVO${runningCount === 1 ? "" : "S"}`
  const processOptions = activeExecutions.map((execution) => {
    const ports = listeningPorts.filter((port) => port.groupId === execution.pid)
    return {
      name: `● ${ports.length ? `◉ ${ports.map(portAddress).join(" ")}  ` : ""}${execution.projectName}/${execution.label}`,
      description: "",
      value: execution.id,
    }
  })
  const projectTabWidth = Math.max(
    5,
    Math.floor((commandPanelWidth - 4) / Math.max(1, openedProjects.length)),
  )

  return (
    <box
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: 1,
      }}
    >
      <box
        style={{
          height: 3,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.border,
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
          marginBottom: 1,
        }}
      >
        <text
          content={`▶ RUNNER  /  ${basename(projectRoot)}`}
          style={{ fg: COLORS.runner }}
        />
        <text
          content={runnerSummary}
          style={{
            fg: runningCount ? COLORS.success : COLORS.muted,
          }}
        />
      </box>

      {pickerMode !== "closed" ? (
        <box
          style={{
            flexGrow: 1,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.runner,
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
              content={pickerMode === "projects"
                ? "◆ PROJETOS"
                : "◇ NAVEGADOR DE PASTAS"}
              style={{ fg: COLORS.runner }}
            />
            <text
              content={pickerMode === "projects"
                ? `${filteredProjects.length} REPOSITÓRIOS GIT`
                : `${filteredDirectoryEntries.length} PASTAS`}
              style={{ fg: COLORS.muted }}
            />
          </box>
          <input
            ref={projectSearchRef}
            id="runner-project-search"
            value={projectSearch}
            placeholder="⌕ Filtrar por nome ou caminho…"
            onInput={setProjectSearch}
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
          {projectsLoading || directoryLoading ? (
            <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
              <text
                content={projectsLoading
                  ? "◐ Procurando repositórios Git no computador…"
                  : "◐ Abrindo pasta…"}
                style={{ fg: COLORS.runner }}
              />
            </box>
          ) : projectPickerError ? (
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
                if (option.value === DIRECTORY_PICKER_OPTION) {
                  setProjectSearch("")
                  void loadDirectory(homedir())
                  return
                }
                switchProject(option.value)
              }}
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
                if (option.value === USE_DIRECTORY_OPTION) {
                  switchProject(browserDirectory)
                  return
                }
                setProjectSearch("")
                void loadDirectory(option.value)
              }}
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
        </box>
      ) : viewMode === "multi" ? (
        <box style={{ flexGrow: 1 }}>
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
              content={`${activeExecutions.length} ATIVO${activeExecutions.length === 1 ? "" : "S"}  ·  ${multiPage + 1}/${multiPageCount}`}
              style={{ fg: COLORS.muted }}
            />
          </box>
          {visibleMultiExecutions.length ? (
            <box style={{ flexGrow: 1, flexDirection: "row", gap: 1 }}>
              {visibleMultiExecutions.map((execution, index) => {
                const selected = execution.id === selectedExecution?.id
                const duration =
                  (execution.endedAt ?? now) - execution.startedAt
                const executionPorts = listeningPorts.filter(
                  (port) => port.groupId === execution.pid,
                )
                const paneLogWidth = Math.max(12, multiPaneWidth - 4)
                const paneLogs = execution.logs.slice(-multiLogHeight)
                const paneNumber = multiPage * multiPaneCapacity + index + 1
                return (
                  <box
                    key={execution.id}
                    style={{
                      width: multiPaneWidth,
                      flexGrow: 1,
                      border: true,
                      borderStyle: "rounded",
                      borderColor: selected ? COLORS.runner : COLORS.border,
                      backgroundColor: COLORS.panel,
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
                      <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <text
                          content={fitLine(
                            `${paneNumber}  ${execution.label}`,
                            paneLogWidth - 12,
                          )}
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
                        height: multiLogHeight,
                        flexShrink: 0,
                        backgroundColor: COLORS.canvas,
                      }}
                    >
                      {paneLogs.map((log) => (
                        <text
                          key={log.id}
                          content={fitLine(
                            `${logPrefix(log)} ${log.text}`,
                            paneLogWidth,
                          )}
                          style={{ fg: logColor(log), bg: COLORS.canvas }}
                        />
                      ))}
                    </box>
                  </box>
                )
              })}
            </box>
          ) : (
            <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
              <text content="Nenhum processo ativo para monitorar." style={{ fg: COLORS.text }} />
              <text content="Pressione [M] para voltar aos comandos." style={{ fg: COLORS.muted }} />
            </box>
          )}
        </box>
      ) : (
      <box style={{ flexGrow: 1, flexDirection: "row", gap: 1 }}>
        <box
          style={{
            width: commandPanelWidth,
            flexShrink: 0,
          }}
        >
        <box
          style={{
            height: commandPanelHeight,
            flexShrink: 0,
            border: true,
            borderStyle: "rounded",
            borderColor: active ? COLORS.runner : COLORS.border,
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <text content="COMANDOS DETECTADOS" style={{ fg: COLORS.runner }} />
            <text content="[D] SCAN" style={{ fg: COLORS.muted }} />
          </box>
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            {openedProjects.map((project, index) => {
              const shortcut = PROJECT_TAB_SHORTCUTS[index]
              if (!shortcut) return null
              const selected = project.path === projectRoot
              return (
                <text
                  key={project.path}
                  content={fitLine(
                    `[${shortcut.symbol}] ${project.name}`,
                    projectTabWidth,
                  )}
                  style={{
                    fg: selected ? COLORS.runner : COLORS.muted,
                    bg: selected ? COLORS.panelRaised : COLORS.panel,
                  }}
                />
              )
            })}
          </box>
          <input
            ref={manualInputRef}
            id="runner-command-input"
            value={manualCommand}
            placeholder="❯ Digite qualquer comando…"
            onInput={setManualCommand}
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
          {loading ? (
            <text content="◐ Detectando scripts…" style={{ fg: COLORS.runner }} />
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
                  if (option.value === PROJECT_PICKER_OPTION) return
                  selectCommand(option.value)
                }
              }}
              onSelect={(_index, option) => {
                if (typeof option?.value !== "string") return
                if (option.value === PROJECT_PICKER_OPTION) {
                  void openProjectPicker()
                  return
                }
                openOrRunCommand(
                  commands.find((command) => command.id === option.value),
                )
              }}
              showDescription={false}
              showScrollIndicator
              wrapSelection
              style={{
                width: commandPanelWidth - 4,
                height: commandListHeight,
                backgroundColor: COLORS.panel,
                focusedBackgroundColor: COLORS.panel,
                textColor: COLORS.muted,
                focusedTextColor: COLORS.text,
                selectedBackgroundColor: COLORS.panelRaised,
                selectedTextColor: COLORS.runner,
              }}
            />
          ) : (
            <box style={{ flexGrow: 1, justifyContent: "center" }}>
              <text content="Nenhum comando detectado." style={{ fg: COLORS.text }} />
              <text
                content="Digite um comando acima ou pressione [D] para redetectar."
                style={{ fg: COLORS.muted }}
              />
            </box>
          )}
          {selectedCommand && showCommandDetails ? (
            <box
              style={{
                height: 3,
                flexShrink: 0,
                border: ["top"],
                borderColor: COLORS.border,
                paddingTop: 1,
              }}
            >
              <text
                content={fitLine(
                  `❯ ${selectedCommand.displayCommand}`,
                  commandPanelWidth - 4,
                )}
                style={{ fg: COLORS.text }}
              />
              <text
                content={fitLine(
                  selectedCommandExecution
                    ? `● processo ativo${selectedCommandExecution.pid ? ` #${selectedCommandExecution.pid}` : ""} · Enter abre · R inicia outro`
                    : selectedCommand.description,
                  commandPanelWidth - 4,
                )}
                style={{
                  fg: selectedCommandExecution ? COLORS.success : COLORS.muted,
                }}
              />
            </box>
          ) : null}
        </box>
        {processPanelHeight ? (
          <box
            style={{
              height: processPanelHeight,
              flexShrink: 0,
              border: true,
              borderStyle: "rounded",
              borderColor: COLORS.border,
              backgroundColor: COLORS.panel,
              paddingLeft: 1,
              paddingRight: 1,
              marginTop: 1,
            }}
          >
            <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <text content="PROCESSOS ATIVOS" style={{ fg: COLORS.success }} />
              <text content={`[P] ${activeExecutions.length}`} style={{ fg: COLORS.muted }} />
            </box>
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
                }
              }}
              showDescription={false}
              showScrollIndicator
              wrapSelection
              style={{
                width: commandPanelWidth - 4,
                height: Math.max(1, processPanelHeight - 3),
                backgroundColor: COLORS.panel,
                focusedBackgroundColor: COLORS.panel,
                textColor: COLORS.muted,
                focusedTextColor: COLORS.text,
                selectedBackgroundColor: COLORS.panelRaised,
                selectedTextColor: COLORS.success,
              }}
            />
          </box>
        ) : null}
        </box>

        <box
          style={{
            flexGrow: 1,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.border,
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: 2,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              backgroundColor: COLORS.panelRaised,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text
              content={selectedExecution
                ? fitLine(
                    `LOG  /  ${selectedExecution.projectName}  /  ${selectedExecution.label}`,
                    logWidth - 24,
                  )
                : "LOG DO PROCESSO"}
              style={{ fg: COLORS.runner }}
            />
            <text
              content={selectedExecution
                ? `${statusMarker(selectedExecution.status)} ${statusLabel(selectedExecution.status)}  ${formatDuration(elapsed)}${selectedExecution.pid ? `  #${selectedExecution.pid}` : ""}`
                : "◇ AGUARDANDO"}
              style={{
                fg: selectedExecution
                  ? statusColor(selectedExecution.status)
                  : COLORS.muted,
              }}
            />
          </box>

          <box
            style={{
              height: logHeight,
              flexShrink: 0,
              backgroundColor: COLORS.canvas,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            {visibleLogs.length ? (
              visibleLogs.map((log) => (
                <text
                  key={log.id}
                  content={fitLine(
                    `${logPrefix(log)} ${log.text}`,
                    logWidth,
                  )}
                  style={{ fg: logColor(log), bg: COLORS.canvas }}
                />
              ))
            ) : (
              <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
                <text
                  content="Selecione um comando e pressione Enter."
                  style={{ fg: COLORS.text }}
                />
                <text
                  content="A saída aparecerá aqui em tempo real."
                  style={{ fg: COLORS.muted }}
                />
              </box>
            )}
          </box>

          <box
            style={{
              height: 6,
              flexShrink: 0,
              border: ["top"],
              borderColor: COLORS.border,
              paddingTop: 1,
            }}
          >
            <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <text content="EXECUÇÕES DA SESSÃO" style={{ fg: COLORS.runner }} />
              <text content="[ / ] ALTERNAR" style={{ fg: COLORS.muted }} />
            </box>
            {executions.length ? (
              executions.slice(0, 4).map((execution) => {
                const selected = execution.id === selectedExecution?.id
                const duration =
                  (execution.endedAt ?? now) - execution.startedAt
                return (
                  <text
                    key={execution.id}
                    content={fitLine(
                      `${selected ? "›" : " "} ${statusMarker(execution.status)} ${execution.projectName}/${execution.label}  ${formatDuration(duration)}`,
                      logWidth,
                    )}
                    style={{
                      fg: selected
                        ? statusColor(execution.status)
                        : COLORS.muted,
                      bg: selected ? COLORS.panelRaised : COLORS.panel,
                    }}
                  />
                )
              })
            ) : (
              <text content="Nenhuma execução nesta sessão." style={{ fg: COLORS.muted }} />
            )}
          </box>
        </box>
      </box>
      )}

      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 1,
        }}
      >
        {pickerMode !== "closed" ? (
          <>
            <text
              content="[↵] SELECIONAR  [/] BUSCAR  [ESC] VOLTAR"
              style={{ fg: COLORS.muted }}
            />
            <text
              content={pickerMode === "projects" ? "PROJETOS GIT" : "NAVEGADOR DE PASTAS"}
              style={{ fg: COLORS.runner }}
            />
          </>
        ) : viewMode === "multi" ? (
          <>
            <text
              content="[M] MODO ÚNICO  [←/→] FOCO  [K] PARAR"
              style={{ fg: COLORS.muted }}
            />
            <text
              content="[ / ] GRUPOS  ·  ATÉ 3 TERMINAIS"
              style={{ fg: COLORS.runner }}
            />
          </>
        ) : (
          <>
            <text
              content="[/] COMANDO  [↵] ABRIR  [R] NOVA  [M] MULTI"
              style={{ fg: COLORS.muted }}
            />
            <text
              content="[K] PARAR  [C] LIMPAR  [D] SCAN"
              style={{ fg: COLORS.runner }}
            />
          </>
        )}
      </box>
    </box>
  )
}
