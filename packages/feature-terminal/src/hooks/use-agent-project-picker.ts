import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import {
  codexResumeThreadsSnapshot,
  subscribeCodexResumeThreads,
} from "../model/codex-resume-threads"
import type { TerminalSession } from "../model/sessions"
import {
  type AgentProjectTarget,
  readProjectDirectory,
} from "../services/agent-project-directories"
import {
  loadRecentAgentProjects,
  recentProjectsForTarget,
  rememberAgentProject,
} from "../services/agent-project-recents"
import {
  refreshCodexResumeThreads,
  refreshRemoteCodexResumeThreads,
} from "../services/codex-app-server"
import {
  createCodexAgentCommand,
  createRemoteCodexAgentCommand,
  FREE_TERMINAL_WORKING_DIRECTORY,
} from "../services/terminal"
import type { FreeTerminalCommand } from "../model/sessions"

export function useAgentProjectPicker({
  target,
  sessions,
  onLaunch,
  onCancelLaunch,
  onClose,
}: {
  target: AgentProjectTarget
  sessions: readonly TerminalSession[]
  onLaunch: (command: FreeTerminalCommand) => string | undefined
  onCancelLaunch: (id: string) => void
  onClose: () => void
}) {
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
  const threads = useSyncExternalStore(
    subscribeCodexResumeThreads,
    codexResumeThreadsSnapshot,
    codexResumeThreadsSnapshot,
  )
  const recent = recentProjectsForTarget(target, saved, threads)
  useEffect(() => {
    const controller = new AbortController()
    if (process.env.TUIMINAL_TERMINAL_CODEX_RESUME !== "0") {
      const refresh =
        target.kind === "local"
          ? refreshCodexResumeThreads(FREE_TERMINAL_WORKING_DIRECTORY, controller.signal)
          : refreshRemoteCodexResumeThreads(target.profile, controller.signal)
      void refresh.catch(() => {
        if (!controller.signal.aborted) setHistoryError(true)
      })
    }
    return () => {
      controller.abort()
      request.current?.abort()
    }
  }, [target])

  useEffect(() => {
    if (!pending) return
    const session = sessions.find((item) => item.id === pending)
    if (!session || session.status === "starting") return
    pendingRef.current = null
    setPending(null)
    busy.current = false
    setLaunching(false)
    if (session.status === "running") {
      try {
        rememberAgentProject(target, session.workingDirectory || destination)
      } catch {
        /* History cannot interrupt a running agent. */
      }
      onClose()
    } else {
      setError(session.startError || "Não foi possível iniciar a sessão.")
      onCancelLaunch(pending)
    }
  }, [pending, sessions, target, destination, onCancelLaunch, onClose])

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
      const command =
        target.kind === "remote"
          ? createRemoteCodexAgentCommand({
              profile: target.profile,
              workingDirectory: resolved.path,
            })
          : createCodexAgentCommand(undefined, resolved.path)
      const id = onLaunch(command)
      if (!id) throw new Error("O limite de terminais foi atingido.")
      pendingRef.current = id
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
    onClose()
  }
  return { destination, recent, launching, error, historyError, pending, launch, cancel }
}
