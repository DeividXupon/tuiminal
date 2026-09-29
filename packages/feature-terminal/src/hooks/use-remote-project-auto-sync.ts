import { useEffect, useRef } from "react"
import type { AgentState } from "../model/agent-state"
import type { TerminalSession } from "../model/sessions"

export type RemoteProjectTurnObservation = {
  startedAt: number
  state: AgentState | null
  active: boolean
}

type RemoteProjectAutoSyncFailure = {
  active: boolean
  enabled: boolean
  sessions: readonly TerminalSession[]
  session: TerminalSession
}

function supportsAutomaticProjectSync(session: TerminalSession) {
  return session.agentIntegration === "codex-app-server" && Boolean(session.codex?.remote)
}

export function observeCompletedRemoteProjectTurns(
  sessions: readonly TerminalSession[],
  observations: Map<string, RemoteProjectTurnObservation>,
) {
  const completed: TerminalSession[] = []
  const retained = new Set<string>()
  for (const session of sessions) {
    if (!supportsAutomaticProjectSync(session)) continue
    retained.add(session.id)
    const state = session.agent?.state ?? null
    const previous = observations.get(session.id)
    let active = previous?.startedAt === session.startedAt ? previous.active : false
    if (state === "working" || state === "blocked") active = true
    else if (state === "idle" || state === "unknown") active = false
    const justCompleted = state === "done" && active && previous?.state !== "done"
    if (justCompleted) {
      completed.push(session)
      active = false
    }
    observations.set(session.id, { startedAt: session.startedAt, state, active })
  }
  for (const sessionId of observations.keys())
    if (!retained.has(sessionId)) observations.delete(sessionId)
  return completed
}

export function shouldReportRemoteProjectAutoSyncFailure({
  active,
  enabled,
  sessions,
  session,
}: RemoteProjectAutoSyncFailure) {
  return (
    active &&
    enabled &&
    sessions.some(
      (candidate) => candidate.id === session.id && candidate.startedAt === session.startedAt,
    )
  )
}

export function useRemoteProjectAutoSync(
  sessions: readonly TerminalSession[],
  onCompletedTurn: (session: TerminalSession) => void,
) {
  const observations = useRef(new Map<string, RemoteProjectTurnObservation>())
  useEffect(() => {
    for (const session of observeCompletedRemoteProjectTurns(sessions, observations.current))
      onCompletedTurn(session)
  }, [onCompletedTurn, sessions])
}
