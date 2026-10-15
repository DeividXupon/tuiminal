import { useEffect, useRef } from "react"
import type { AgentState } from "../model/agent-state"
import { agentSessionHasCapability, type TerminalSession } from "../model/sessions"

export type RemoteProjectTurnObservation = {
  startedAt: number
  state: AgentState | null
  active: boolean
  hydrationRevision: number
}

type RemoteProjectAutoSyncFailure = {
  active: boolean
  enabled: boolean
  sessions: readonly TerminalSession[]
  session: TerminalSession
}

function supportsAutomaticProjectSync(session: TerminalSession) {
  return agentSessionHasCapability(session, "project-sync") && Boolean(session.agentLaunch?.remote)
}

function observeRemoteSession(
  session: TerminalSession,
  previous: RemoteProjectTurnObservation | undefined,
) {
  const state = session.agent?.state ?? null
  let active = previous?.startedAt === session.startedAt ? previous.active : false
  if (state === "working" || state === "blocked") active = true
  else if (state === "idle" || state === "unknown") active = false
  const hydration = session.remoteAgentHydration ?? session.remoteCodexHydration
  const completed = Boolean(
    (state === "done" && active && previous?.state !== "done") ||
      (hydration &&
        hydration.revision !== previous?.hydrationRevision &&
        hydration.state === "done" &&
        hydration.latestTurnStatus === "completed" &&
        !hydration.waitingOnApproval),
  )
  return {
    completed,
    observation: {
      startedAt: session.startedAt,
      state,
      active: completed ? false : active,
      hydrationRevision: hydration?.revision ?? 0,
    },
  }
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
    const next = observeRemoteSession(session, observations.get(session.id))
    if (next.completed) completed.push(session)
    observations.set(session.id, next.observation)
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
