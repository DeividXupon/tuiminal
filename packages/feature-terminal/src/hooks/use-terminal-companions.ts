import { useCallback, useEffect, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { agentSessionHasCapability } from "../model/sessions"
import type { MessageHistoryTarget } from "../rendering/terminal-workspace-presentation"
import { discoverLiveDiffProjects, type LiveDiffProject } from "../services/live-diff-projects"
import type { useTerminalSessions } from "./use-terminal-sessions"

type LiveDiffTarget = {
  sessionId: string
  agentKey: string
  startedAt: number
  manualDirectories: readonly string[]
  focusRequest: number
}

export function useTerminalCompanions({
  sessions,
  sessionsRef,
  activeSessionId,
  focusTerminal,
}: Pick<
  ReturnType<typeof useTerminalSessions>,
  "sessions" | "sessionsRef" | "activeSessionId" | "focusTerminal"
>) {
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const [liveDiffTargets, setLiveDiffTargets] = useState<ReadonlyMap<string, LiveDiffTarget>>(
    () => new Map(),
  )
  const [messageHistoryTargets, setMessageHistoryTargets] = useState<
    ReadonlyMap<string, MessageHistoryTarget>
  >(() => new Map())
  const [liveDiffProjectPicker, setLiveDiffProjectPicker] = useState<{
    sessionId: string
    projects: readonly LiveDiffProject[]
    loading: boolean
    error: string
  } | null>(null)
  const liveDiffProjectSearch = useRef<AbortController | null>(null)
  useEffect(() => {
    setLiveDiffTargets((current) => {
      let changed = false
      const next = new Map(current)
      for (const [sessionId, target] of current) {
        const owner = sessions.find((session) => session.id === sessionId)
        if (
          owner &&
          owner.startedAt === target.startedAt &&
          (!owner.agent || owner.agent.key === target.agentKey)
        )
          continue
        next.delete(sessionId)
        changed = true
      }
      return changed ? next : current
    })
  }, [sessions])
  useEffect(() => {
    setMessageHistoryTargets((current) => {
      let changed = false
      const next = new Map(current)
      for (const [sessionId, target] of current) {
        const owner = sessions.find((session) => session.id === sessionId)
        if (
          owner?.startedAt === target.startedAt &&
          agentSessionHasCapability(owner, "message-history")
        )
          continue
        next.delete(sessionId)
        changed = true
      }
      return changed ? next : current
    })
  }, [sessions])
  const toggleLiveDiff = () => {
    if (!activeSessionId) return
    if (liveDiffTargets.has(activeSessionId)) {
      setLiveDiffTargets((current) => {
        const target = current.get(activeSessionId)
        if (!target) return current
        const next = new Map(current)
        next.set(activeSessionId, { ...target, focusRequest: target.focusRequest + 1 })
        return next
      })
      return
    }
    const session = activeSession
    const agent = session?.agent
    if (!session || !agent) return
    setLiveDiffTargets((current) => {
      const next = new Map(current)
      next.set(session.id, {
        sessionId: session.id,
        agentKey: agent.key,
        startedAt: session.startedAt,
        manualDirectories: [],
        focusRequest: 1,
      })
      return next
    })
  }
  const toggleMessageHistory = () => {
    if (!activeSessionId) return
    if (messageHistoryTargets.has(activeSessionId)) {
      setMessageHistoryTargets((current) => {
        const target = current.get(activeSessionId)
        if (!target) return current
        const next = new Map(current)
        next.set(activeSessionId, { ...target, focusRequest: target.focusRequest + 1 })
        return next
      })
      return
    }
    if (!activeSession || !agentSessionHasCapability(activeSession, "message-history")) return
    setMessageHistoryTargets((current) => {
      const next = new Map(current)
      next.set(activeSession.id, {
        sessionId: activeSession.id,
        startedAt: activeSession.startedAt,
        focusRequest: 1,
      })
      return next
    })
  }
  const closeLiveDiff = useCallback(
    (id: string) => {
      setLiveDiffTargets((current) => {
        if (!current.has(id)) return current
        const next = new Map(current)
        next.delete(id)
        return next
      })
      focusTerminal(id)
    },
    [focusTerminal],
  )
  const closeMessageHistory = useCallback(
    (id: string) => {
      setMessageHistoryTargets((current) => {
        if (!current.has(id)) return current
        const next = new Map(current)
        next.delete(id)
        return next
      })
      focusTerminal(id)
    },
    [focusTerminal],
  )
  const addLiveDiffProject = useCallback(
    (id: string, roots: readonly string[]) => {
      const session = sessionsRef.current.find((candidate) => candidate.id === id)
      if (session?.agentLaunch?.remote) return
      const seeds = [session?.workingDirectory ?? "", ...roots]
      liveDiffProjectSearch.current?.abort()
      const controller = new AbortController()
      liveDiffProjectSearch.current = controller
      setLiveDiffProjectPicker({
        sessionId: id,
        projects: [],
        loading: true,
        error: "",
      })
      void discoverLiveDiffProjects(seeds, controller.signal)
        .then((projects) => {
          if (controller.signal.aborted) return
          const existing = new Set(roots)
          setLiveDiffProjectPicker((current) =>
            current?.sessionId === id
              ? {
                  ...current,
                  projects: projects.filter((project) => !existing.has(project.path)),
                  loading: false,
                }
              : current,
          )
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setLiveDiffProjectPicker((current) =>
            current?.sessionId === id
              ? {
                  ...current,
                  loading: false,
                  error: translateUi("Não foi possível procurar projetos Git."),
                }
              : current,
          )
        })
    },
    [sessionsRef],
  )
  const closeLiveDiffProjectPicker = useCallback(() => {
    liveDiffProjectSearch.current?.abort()
    liveDiffProjectSearch.current = null
    const id = liveDiffProjectPicker?.sessionId
    setLiveDiffProjectPicker(null)
    if (id) queueMicrotask(() => focusTerminal(id))
  }, [focusTerminal, liveDiffProjectPicker?.sessionId])
  const selectLiveDiffProject = useCallback(
    (path: string) => {
      const id = liveDiffProjectPicker?.sessionId
      if (!id) return
      setLiveDiffTargets((current) => {
        const target = current.get(id)
        if (!target || target.manualDirectories.includes(path)) return current
        const next = new Map(current)
        next.set(id, {
          ...target,
          manualDirectories: [...target.manualDirectories, path],
        })
        return next
      })
      closeLiveDiffProjectPicker()
    },
    [closeLiveDiffProjectPicker, liveDiffProjectPicker?.sessionId],
  )
  return {
    liveDiffTargets,
    setLiveDiffTargets,
    messageHistoryTargets,
    setMessageHistoryTargets,
    liveDiffProjectPicker,
    setLiveDiffProjectPicker,
    liveDiffProjectSearch,
    toggleLiveDiff,
    toggleMessageHistory,
    closeLiveDiff,
    closeMessageHistory,
    addLiveDiffProject,
    closeLiveDiffProjectPicker,
    selectLiveDiffProject,
  }
}
