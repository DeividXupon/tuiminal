import type { EmbeddedTerminalRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import { mergeAgentMessageHistory, sanitizeAgentMessages } from "../model/agent-message-store"
import {
  type FreeTerminalCommand,
  type FreeTerminalKind,
  MAX_SESSIONS,
  MAX_TERMINALS_PER_SECTION,
  normalizeSectionLayout,
  type TerminalPlacement,
  type TerminalSession,
} from "../model/sessions"
import { tmuxPaneKey } from "../model/tmux"
import type { AgentMonitor } from "../services/agent-monitor"
import type { FreeTerminalProcessHandle } from "../services/terminal"
import { TerminalLaunches } from "../services/terminal-launches"
import { destroyOwnedTmuxTarget } from "../services/tmux-terminal"
import { useTerminalSessionLaunch } from "./use-terminal-session-launch"

function mirroredSession(command: FreeTerminalCommand, sessions: readonly TerminalSession[]) {
  if (!command.tmux) return undefined
  return sessions.find(
    (session) =>
      session.tmux?.socket === command.tmux?.socket &&
      session.tmux?.paneId === command.tmux?.paneId,
  )
}

function reopenMirroredSession(
  command: FreeTerminalCommand,
  session: TerminalSession | undefined,
  dismissed: RefObject<Set<string>>,
  activate: (id: string) => void,
  start: (id: string, clear?: boolean) => unknown,
) {
  if (!session) return false
  if (command.autoMirror) return true
  if (command.tmux) dismissed.current.delete(tmuxPaneKey(command.tmux))
  activate(session.id)
  if (session.status === "exited" || session.status === "failed") void start(session.id, true)
  return true
}

function createTerminalSession(
  command: FreeTerminalCommand,
  placement: TerminalPlacement,
  sessionSequence: RefObject<number>,
  kindSequences: RefObject<Map<FreeTerminalKind, number>>,
): TerminalSession {
  sessionSequence.current += 1
  const id = `${command.kind}-${Date.now()}-${sessionSequence.current}`
  const number = (kindSequences.current.get(command.kind) ?? 0) + 1
  kindSequences.current.set(command.kind, number)
  return {
    ...command,
    ...placement,
    id,
    title: command.tmux ? command.label : `${command.label} ${number}`,
    titleMode: "automatic",
    agent: command.codex
      ? {
          key: `codex-app-server:${id}`,
          label: "Codex",
          profile: "codex",
          state: "idle",
          activity: null,
        }
      : null,
    ...(command.codex ? { agentIntegration: "codex-app-server" as const } : {}),
    busy: false,
    status: "starting",
    pid: null,
    exitCode: null,
    startedAt: Date.now(),
  }
}

export function useTerminalSessions(active: boolean) {
  const dimensions = useTerminalDimensions()
  const dimensionsRef = useRef(dimensions)
  dimensionsRef.current = dimensions
  const terminalRefs = useRef(new Map<string, EmbeddedTerminalRenderable>())
  const processHandles = useRef(new Map<string, FreeTerminalProcessHandle>())
  const sessionCommands = useRef(new Map<string, FreeTerminalCommand>())
  const terminalSizes = useRef(new Map<string, { columns: number; rows: number }>())
  const launches = useRef(new TerminalLaunches())
  const agentOutputs = useRef(new Map<string, AgentMonitor>())
  const kindSequences = useRef(new Map<FreeTerminalKind, number>())
  const sessionSequence = useRef(0)
  const activeRef = useRef(active)
  const activeSessionRef = useRef<string | null>(null)
  const sessionsRef = useRef<TerminalSession[]>([])
  const dismissedTmuxPanes = useRef(new Set<string>())
  const closeFinishedShellRef = useRef<(id: string) => void>(() => undefined)
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [agentMessages, setAgentMessages] = useState<
    ReadonlyMap<string, readonly AgentMessageHistoryEntry[]>
  >(new Map())
  const [notice, setNotice] = useState("")
  activeRef.current = active
  activeSessionRef.current = activeSessionId
  sessionsRef.current = sessions

  const updateSession = useCallback((id: string, update: Partial<TerminalSession>) => {
    const current = sessionsRef.current
    const index = current.findIndex((session) => session.id === id)
    const session = current[index]
    if (!session) return
    const keys = Object.keys(update) as Array<keyof TerminalSession>
    if (keys.every((key) => Object.is(session[key], update[key]))) return
    const next = current.slice()
    next[index] = { ...session, ...update }
    sessionsRef.current = next
    setSessions(next)
  }, [])
  const updateAgentMessages = useCallback(
    (id: string, messages: readonly AgentMessageHistoryEntry[], replace: boolean) => {
      const cleaned = sanitizeAgentMessages(messages)
      setAgentMessages((current) => {
        const next = new Map(current)
        next.set(id, mergeAgentMessageHistory(replace ? [] : (current.get(id) ?? []), cleaned))
        return next
      })
    },
    [],
  )
  const clearAgentMessages = useCallback((id: string) => {
    setAgentMessages((current) => {
      if (!current.has(id)) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }, [])
  const focusTerminal = useCallback((id: string | null) => {
    if (!id) return
    queueMicrotask(() => {
      if (!activeRef.current) return
      const terminal = terminalRefs.current.get(id)
      if (!terminal) return
      terminal.focus()
      // A sibling sidebar repaint can cover cells composed by the native terminal.
      // Force a fresh composition whenever keyboard focus returns to the pane.
      terminal.invalidate()
    })
  }, [])
  const moveSession = useCallback(
    (id: string, placement: TerminalPlacement) => {
      const current = sessionsRef.current
      const moving = current.find((session) => session.id === id)
      if (!moving) return false
      const destination = current.filter(
        (session) => session.sectionId === placement.sectionId && session.id !== id,
      )
      if (destination.length >= MAX_TERMINALS_PER_SECTION) {
        setNotice("Esta seção já possui dois terminais.")
        return false
      }
      const next = normalizeSectionLayout(
        current.map((session) => {
          if (session.id === id) return { ...session, ...placement }
          if (session.sectionId === placement.sectionId)
            return { ...session, row: 0 as const, column: 0 as const }
          return session
        }),
        moving.sectionId,
      )
      sessionsRef.current = next
      setSessions(next)
      activeSessionRef.current = id
      setActiveSessionId(id)
      focusTerminal(id)
      return true
    },
    [focusTerminal],
  )
  const activateSession = useCallback(
    (id: string) => {
      if (!sessionsRef.current.some((session) => session.id === id)) return
      activeSessionRef.current = id
      setActiveSessionId(id)
      focusTerminal(id)
    },
    [focusTerminal],
  )
  const startSession = useTerminalSessionLaunch(notice, {
    dimensions: dimensionsRef,
    terminals: terminalRefs,
    handles: processHandles,
    commands: sessionCommands,
    sizes: terminalSizes,
    launches,
    outputs: agentOutputs,
    activeSession: activeSessionRef,
    updateSession,
    updateAgentMessages,
    clearAgentMessages,
    closeFinishedShell: (id) => closeFinishedShellRef.current(id),
    focusTerminal,
    setNotice,
  })

  const terminalReady = useCallback(
    (id: string, terminal: EmbeddedTerminalRenderable) => {
      terminalRefs.current.set(id, terminal)
      terminalSizes.current.set(id, {
        columns: Math.max(20, terminal.width),
        rows: Math.max(5, terminal.height),
      })
      if (!launches.current.has(id)) void startSession(id)
      if (!sessionCommands.current.get(id)?.autoMirror && activeSessionRef.current === id)
        focusTerminal(id)
    },
    [focusTerminal, startSession],
  )

  const terminalGone = useCallback((id: string, terminal: EmbeddedTerminalRenderable) => {
    if (terminalRefs.current.get(id) === terminal) {
      terminalRefs.current.delete(id)
    }
  }, [])

  const terminalInput = useCallback((id: string, data: Uint8Array) => {
    processHandles.current.get(id)?.write(data)
  }, [])

  const terminalResize = useCallback((id: string, columns: number, rows: number) => {
    terminalSizes.current.set(id, { columns, rows })
    agentOutputs.current.get(id)?.resize(columns, rows)
    processHandles.current.get(id)?.resize(columns, rows)
  }, [])

  const launchCommand = useCallback(
    (command: FreeTerminalCommand, placement: TerminalPlacement) => {
      const currentSessions = sessionsRef.current
      const existing = mirroredSession(command, currentSessions)
      if (
        reopenMirroredSession(command, existing, dismissedTmuxPanes, activateSession, startSession)
      )
        return
      if (currentSessions.length >= MAX_SESSIONS) {
        setNotice(`Limite de ${MAX_SESSIONS} terminais nesta execução.`)
        return
      }
      const sectionSize = currentSessions.filter(
        (session) => session.sectionId === placement.sectionId,
      ).length
      if (sectionSize >= MAX_TERMINALS_PER_SECTION) {
        setNotice("Esta seção já possui dois terminais.")
        return
      }
      const session = createTerminalSession(command, placement, sessionSequence, kindSequences)
      sessionCommands.current.set(session.id, command)
      if (command.tmux) dismissedTmuxPanes.current.delete(tmuxPaneKey(command.tmux))
      const nextSessions = [...currentSessions, session]
      sessionsRef.current = nextSessions
      setSessions(nextSessions)
      if (!command.autoMirror || !activeSessionRef.current) {
        activeSessionRef.current = session.id
        setActiveSessionId(session.id)
      }
      if (!command.autoMirror) {
        setNotice(`Abrindo ${command.displayCommand}…`)
        focusTerminal(session.id)
      }
    },
    [activateSession, focusTerminal, startSession],
  )

  const closeSession = useCallback(
    (id: string) => {
      const currentSessions = sessionsRef.current
      const index = currentSessions.findIndex((session) => session.id === id)
      const removed = currentSessions[index]
      if (!removed) return
      if (removed.tmux) dismissedTmuxPanes.current.add(tmuxPaneKey(removed.tmux))

      launches.current.cancel(id)
      const handle = processHandles.current.get(id)
      if (handle) {
        void (handle.close?.() ?? handle.stop())
          .then(() => {
            if (processHandles.current.get(id) === handle) processHandles.current.delete(id)
          })
          .catch((error) => {
            setNotice(error instanceof Error ? error.message : "O terminal não encerrou.")
          })
      } else {
        processHandles.current.delete(id)
        if (removed.tmux?.ownedByTuiminal) {
          void destroyOwnedTmuxTarget(removed.tmux).catch((error) => {
            setNotice(error instanceof Error ? error.message : "O terminal não encerrou.")
          })
        }
      }
      sessionCommands.current.delete(id)
      terminalSizes.current.delete(id)
      agentOutputs.current.get(id)?.dispose()
      agentOutputs.current.delete(id)
      clearAgentMessages(id)

      const remaining = normalizeSectionLayout(
        currentSessions.filter((session) => session.id !== id),
        removed.sectionId,
      )
      const currentActive = remaining.find((session) => session.id === activeSessionRef.current)
      const next = currentActive ?? remaining[Math.min(index, remaining.length - 1)] ?? null
      sessionsRef.current = remaining
      setSessions(remaining)
      activeSessionRef.current = next?.id ?? null
      setActiveSessionId(next?.id ?? null)
      setNotice(next ? `Terminal fechado · foco em ${next.title}.` : "Nenhum terminal ativo.")
      if (next) focusTerminal(next.id)
    },
    [clearAgentMessages, focusTerminal],
  )
  closeFinishedShellRef.current = closeSession

  const restartSession = useCallback(
    (id: string) => {
      if (sessionCommands.current.get(id)?.tmux) return
      activeSessionRef.current = id
      setActiveSessionId(id)
      void startSession(id, true)
      focusTerminal(id)
    },
    [focusTerminal, startSession],
  )

  useEffect(() => {
    if (active) focusTerminal(activeSessionRef.current)
    else for (const terminal of terminalRefs.current.values()) terminal.blur()
  }, [active, focusTerminal])

  useEffect(
    () => () => {
      launches.current.dispose()
      for (const handle of processHandles.current.values()) {
        void handle.stop().catch(() => undefined)
      }
      terminalRefs.current.clear()
      for (const output of agentOutputs.current.values()) output.dispose()
      agentOutputs.current.clear()
    },
    [],
  )

  return {
    sessions,
    agentMessages,
    sessionsRef,
    dismissedTmuxPanes,
    activeSessionId,
    activeSessionRef,
    terminalRefs,
    agentOutputs,
    processHandles,
    activateSession,
    focusTerminal,
    updateSession,
    moveSession,
    launchCommand,
    closeSession,
    restartSession,
    terminalReady,
    terminalGone,
    terminalInput,
    terminalResize,
    setNotice,
  }
}
