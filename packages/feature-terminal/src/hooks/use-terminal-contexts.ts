import { basename } from "node:path"
import { type RefObject, useEffect, useRef, useState } from "react"
import type { TerminalRepositoryContext } from "../model/terminal-context"
import type { TerminalSession } from "../model/sessions"
import {
  createRemoteTerminalContextSource,
  type RemoteTerminalContextSource,
} from "../services/remote-terminal-context"
import { readTerminalRepositoryContext } from "../services/terminal-repository-context"
import type { FreeTerminalProcessHandle } from "../services/terminal"

const CONTEXT_POLL_INTERVAL_MS = 2_000

type OwnedRemoteSource = {
  startedAt: number
  source: RemoteTerminalContextSource
}

function pendingContext(directory: string): TerminalRepositoryContext {
  return {
    directory,
    projectName: basename(directory) || directory,
    state: "loading",
  }
}

function sameContext(
  previous: TerminalRepositoryContext | undefined,
  next: TerminalRepositoryContext,
) {
  return (
    previous?.directory === next.directory &&
    previous.projectName === next.projectName &&
    previous.branch === next.branch &&
    previous.state === next.state
  )
}

function currentSessionMatches(
  current: readonly TerminalSession[],
  session: TerminalSession,
  sectionId: string,
) {
  return current.some(
    (candidate) =>
      candidate.id === session.id &&
      candidate.startedAt === session.startedAt &&
      candidate.sectionId === sectionId,
  )
}

function reconcileRemoteSources(
  sources: Map<string, OwnedRemoteSource>,
  visible: readonly TerminalSession[],
) {
  for (const [id, owned] of sources) {
    const session = visible.find((candidate) => candidate.id === id)
    if (session?.startedAt === owned.startedAt && session.agentLaunch?.remote) continue
    owned.source.close()
    sources.delete(id)
  }
  for (const session of visible) {
    const remote = session.agentLaunch?.remote
    if (!remote || session.status !== "running" || sources.has(session.id)) continue
    sources.set(session.id, {
      startedAt: session.startedAt,
      source: createRemoteTerminalContextSource(remote),
    })
  }
}

function retainExistingContexts(
  current: ReadonlyMap<string, TerminalRepositoryContext>,
  sessions: readonly TerminalSession[],
  owners: Map<string, number>,
) {
  const existing = new Set(sessions.map((session) => session.id))
  if ([...current.keys()].every((id) => existing.has(id))) return current
  const next = new Map(current)
  for (const id of current.keys()) {
    if (existing.has(id)) continue
    next.delete(id)
    owners.delete(id)
  }
  return next
}

function needsPendingContext(
  previous: TerminalRepositoryContext | undefined,
  owner: number | undefined,
  session: TerminalSession,
  directory: string,
) {
  return Boolean(previous && (owner !== session.startedAt || previous.directory !== directory))
}

async function resolveSessionDirectory(
  session: TerminalSession,
  handle: FreeTerminalProcessHandle | undefined,
  signal: AbortSignal,
) {
  if (session.agentLaunch?.remote) return session.agentLaunch.remote.workingDirectory
  if (session.status === "running" && handle?.readWorkingDirectory) {
    const current = await handle.readWorkingDirectory(signal).catch(() => null)
    if (current) return current
  }
  return session.workingDirectory ?? null
}

async function readSessionContext(
  session: TerminalSession,
  directory: string,
  sources: ReadonlyMap<string, OwnedRemoteSource>,
  signal: AbortSignal,
) {
  if (session.agentLaunch?.remote) return sources.get(session.id)?.source.read(signal)
  return readTerminalRepositoryContext(directory, signal)
}

export function useTerminalContexts(
  active: boolean,
  sectionId: string | null,
  activeStartedAt: number | null,
  sessions: RefObject<TerminalSession[]>,
  handles: RefObject<Map<string, FreeTerminalProcessHandle>>,
) {
  const [contexts, setContexts] = useState<ReadonlyMap<string, TerminalRepositoryContext>>(
    () => new Map(),
  )
  const contextsRef = useRef(contexts)
  contextsRef.current = contexts
  const owners = useRef(new Map<string, number>())

  useEffect(() => {
    if (!active || !sectionId || activeStartedAt === null) return
    const controller = new AbortController()
    const remoteSources = new Map<string, OwnedRemoteSource>()
    let timer: ReturnType<typeof setTimeout> | undefined

    const isCurrent = (session: TerminalSession) =>
      currentSessionMatches(sessions.current, session, sectionId)

    const update = (session: TerminalSession, context: TerminalRepositoryContext) => {
      if (controller.signal.aborted || !isCurrent(session)) return
      setContexts((current) => {
        if (
          owners.current.get(session.id) === session.startedAt &&
          sameContext(current.get(session.id), context)
        )
          return current
        owners.current.set(session.id, session.startedAt)
        const next = new Map(current)
        next.set(session.id, context)
        contextsRef.current = next
        return next
      })
    }

    const scan = async (session: TerminalSession) => {
      const directory = await resolveSessionDirectory(
        session,
        handles.current.get(session.id),
        controller.signal,
      )
      if (!directory) return
      if (controller.signal.aborted || !isCurrent(session)) return
      const previous = contextsRef.current.get(session.id)
      if (needsPendingContext(previous, owners.current.get(session.id), session, directory))
        update(session, pendingContext(directory))
      try {
        const context = await readSessionContext(
          session,
          directory,
          remoteSources,
          controller.signal,
        )
        if (context) update(session, context)
      } catch {
        // A transient cwd, Git, or SSH failure retains metadata only for the same directory.
      }
    }

    const poll = async () => {
      const visible = sessions.current.filter((session) => session.sectionId === sectionId)
      reconcileRemoteSources(remoteSources, visible)
      setContexts((current) => retainExistingContexts(current, sessions.current, owners.current))
      await Promise.allSettled(visible.filter((session) => !session.remoteSetup).map(scan))
      if (!controller.signal.aborted)
        timer = setTimeout(() => void poll(), CONTEXT_POLL_INTERVAL_MS)
    }

    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
      for (const owned of remoteSources.values()) owned.source.close()
      remoteSources.clear()
    }
  }, [active, activeStartedAt, handles, sectionId, sessions])

  return contexts
}
