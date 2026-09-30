import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { AgentProviderId } from "../model/agent-provider"
import type { RemoteCodexCompatibilityReport } from "../model/remote-codex"
import type { FreeTerminalCommand, TerminalSession } from "../model/sessions"
import {
  type AgentProjectTarget,
  readProjectDirectory,
} from "../services/agent-project-directories"
import {
  loadRecentAgentProjects,
  recentProjectsForTarget,
  rememberAgentProject,
} from "../services/agent-project-recents"
import { agentProviderAdapter } from "../services/agent-provider-adapters"
import { FREE_TERMINAL_WORKING_DIRECTORY } from "../services/terminal"

const NO_RESUME_PROJECTS = [] as const
const EMPTY_RESUME_PROJECTS = {
  subscribe: () => () => undefined,
  snapshot: () => NO_RESUME_PROJECTS,
  enabled: () => false,
  refresh: async () => undefined,
} as const

export function useAgentProjectPicker({
  providerId,
  target,
  sessions,
  onLaunch,
  onCancelLaunch,
  onClose,
  onLaunched,
  onCompatibility,
}: {
  providerId: AgentProviderId
  target: AgentProjectTarget
  sessions: readonly TerminalSession[]
  onLaunch: (command: FreeTerminalCommand) => string | undefined
  onCancelLaunch: (id: string) => void
  onClose: () => void
  onLaunched: () => void
  onCompatibility: (
    command: FreeTerminalCommand,
    report: RemoteCodexCompatibilityReport,
    sessionId: string,
  ) => void
}) {
  const adapter = agentProviderAdapter(providerId)
  if (!adapter) throw new Error(`Agent provider ${providerId} is not available.`)
  const resume = adapter.resume ?? EMPTY_RESUME_PROJECTS
  const initial = target.kind === "local" ? FREE_TERMINAL_WORKING_DIRECTORY : "~"
  const [destination, setDestination] = useState(initial)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState("")
  const [historyError, setHistoryError] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [saved] = useState(loadRecentAgentProjects)
  const request = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const pendingRef = useRef<string | null>(null)
  const pendingCommand = useRef<FreeTerminalCommand | null>(null)
  const threads = useSyncExternalStore(resume.subscribe, resume.snapshot, resume.snapshot)
  const recent = recentProjectsForTarget(providerId, target, saved, threads)
  useEffect(() => {
    const controller = new AbortController()
    if (resume.enabled(process.env)) {
      const refresh = resume.refresh(target, controller.signal)
      void refresh.catch(() => {
        if (!controller.signal.aborted) setHistoryError(true)
      })
    }
    return () => {
      controller.abort()
      request.current?.abort()
    }
  }, [resume, target])

  useEffect(() => {
    if (!pending) return
    const session = sessions.find((item) => item.id === pending)
    if (!session || session.status === "starting") return
    pendingRef.current = null
    setPending(null)
    busy.current = false
    setLaunching(false)
    if (session.remoteCodexCompatibility && pendingCommand.current) {
      const command = pendingCommand.current
      pendingCommand.current = null
      onCompatibility(command, session.remoteCodexCompatibility, pending)
      return
    }
    pendingCommand.current = null
    if (session.status === "running") {
      try {
        rememberAgentProject(providerId, target, session.workingDirectory || destination)
      } catch {
        /* History cannot interrupt a running agent. */
      }
      onLaunched()
    } else {
      setError(session.startError || "Não foi possível iniciar a sessão.")
      onCancelLaunch(pending)
    }
  }, [
    pending,
    sessions,
    providerId,
    target,
    destination,
    onCancelLaunch,
    onLaunched,
    onCompatibility,
  ])

  const launch = async (path: string) => {
    if (busy.current) return
    busy.current = true
    setLaunching(true)
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setError("")
    try {
      const resolved = await readProjectDirectory(target, path, initial, controller.signal, false)
      if (controller.signal.aborted) return
      setDestination(resolved.path)
      const command = adapter.createCommand(target, resolved.path)
      const id = onLaunch(command)
      if (!id) throw new Error("O limite de terminais foi atingido.")
      pendingRef.current = id
      pendingCommand.current = command
      setPending(id)
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a sessão.")
      busy.current = false
      setLaunching(false)
    }
  }
  const cancel = () => {
    request.current?.abort()
    if (pendingRef.current) onCancelLaunch(pendingRef.current)
    pendingRef.current = null
    pendingCommand.current = null
    onClose()
  }
  return { destination, recent, launching, error, historyError, pending, launch, cancel }
}
