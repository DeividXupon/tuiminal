import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import {
  AGENT_RESUME_PAGE_SIZE,
  AGENT_RESUME_SOURCE_LIMIT,
  type AgentResumePage,
  agentResumeTimestamp,
  compareAgentResumeThreads,
} from "../model/agent-resume-thread"
import { detectAgentTitle } from "../model/agent-screen"
import type { AgentState } from "../model/agent-state"
import { type ClaudeResumeThread, mergeClaudeResumeThreads } from "../model/claude-resume-threads"
import { projectName } from "../model/project-name"
import type { CodexHydratedThread } from "../model/remote-codex"
import type { RemoteCodexTarget } from "../model/sessions"
import {
  type ClaudeBackgroundSession,
  readRemoteClaudeBackgroundSessions,
} from "./claude-background-session"
import type { ClaudeHookEvents } from "./claude-hooks"
import { rememberClaudeResumeThread } from "./claude-resume-store"

export {
  type ClaudeBackgroundLaunch,
  type ClaudeBackgroundSession,
  ensureRemoteClaudeBackgroundSession,
  parseClaudeBackgroundSessions,
  readRemoteClaudeBackgroundSessions,
  retireCreatedRemoteClaudeBackgroundSession,
  stopRemoteClaudeBackgroundSession,
} from "./claude-background-session"

/**
 * Claude's job `state` classifies the latest reply text: `blocked` also means the reply
 * asked something, and an empty session starts `blocked`. Only the live process status
 * reports an open prompt or a running turn.
 */
function liveState(session: ClaudeBackgroundSession): "working" | "blocked" | null {
  if (session.status === "waiting") return "blocked"
  if (session.status === "busy" || session.status === "shell" || session.state === "working")
    return "working"
  return null
}

function resumeState(session: ClaudeBackgroundSession): ClaudeResumeThread["state"] {
  const live = liveState(session)
  if (live) return live
  if (session.state === "failed" || session.state === "stopped") return "failed"
  return "idle"
}

/** A reply that awaits the user completes the observed turn; before one it is idle. */
export function claudeBackgroundAgentState(
  session: ClaudeBackgroundSession,
  turnObserved: boolean,
): AgentState {
  const live = liveState(session)
  if (live) return live
  if (session.state === "done" || (session.state === "blocked" && turnObserved)) return "done"
  if (session.state === "blocked") return "idle"
  return "unknown"
}

function hydration(session: ClaudeBackgroundSession, state: AgentState): CodexHydratedThread {
  return {
    threadId: session.sessionId,
    state,
    latestTurnStatus:
      state === "working" || state === "blocked"
        ? "inProgress"
        : state === "done"
          ? "completed"
          : session.state === "failed"
            ? "failed"
            : session.state === "stopped"
              ? "interrupted"
              : null,
    waitingOnApproval: state === "blocked",
  }
}

function resumeThread(
  session: ClaudeBackgroundSession,
  profile: TerminalRemoteCodexProfile,
): ClaudeResumeThread {
  return {
    id: session.sessionId,
    title: session.name || "Claude Code",
    preview: "",
    lastResponse: "",
    cwd: session.cwd,
    projectName: projectName(session.cwd),
    gitBranch: "",
    updatedAt: agentResumeTimestamp(session.updatedAt ?? session.startedAt),
    state: resumeState(session),
    remoteProfileId: profile.id,
    remoteProfileName: profile.name,
    remoteProfileHost: profile.host,
  }
}

type RemoteClaudeResumeOptions = {
  readSessions?: typeof readRemoteClaudeBackgroundSessions
  timeoutMs?: number
}

export async function loadRemoteClaudeResumeThreadsPage(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
  limit = AGENT_RESUME_PAGE_SIZE,
  options: RemoteClaudeResumeOptions = {},
): Promise<AgentResumePage<ClaudeResumeThread>> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 12_000)
  let sessions: ClaudeBackgroundSession[]
  try {
    sessions = await (options.readSessions ?? readRemoteClaudeBackgroundSessions)(
      profile,
      AbortSignal.any([signal, timeout]),
    )
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (timeout.aborted)
      throw new Error("A consulta das sessões remotas do Claude Code excedeu o tempo limite.")
    throw error
  }
  const maximum = Math.max(0, Math.min(AGENT_RESUME_SOURCE_LIMIT, limit))
  const threads = sessions
    .map((session) => resumeThread(session, profile))
    .sort(compareAgentResumeThreads)
    .slice(0, AGENT_RESUME_SOURCE_LIMIT)
  mergeClaudeResumeThreads(threads, profile.id)
  return {
    threads: threads.slice(0, maximum),
    nextCursor: null,
    hasMore: maximum < AGENT_RESUME_SOURCE_LIMIT && threads.length > maximum,
  }
}

export async function refreshRemoteClaudeResumeThreads(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
  options: RemoteClaudeResumeOptions = {},
) {
  const page = await loadRemoteClaudeResumeThreadsPage(
    profile,
    signal,
    AGENT_RESUME_SOURCE_LIMIT,
    options,
  )
  return page.threads
}

type BackgroundObserverEvents = Pick<ClaudeHookEvents, "onState" | "onTitle" | "onHydrated">

type BackgroundObserverOptions = {
  readSessions?: typeof readRemoteClaudeBackgroundSessions
  intervalMs?: number
}

type BackgroundObserverSubscriber = {
  sessionId: string
  events: BackgroundObserverEvents
  signature: string
  turnObserved: boolean
  /** The attached TUI title reports a running turn before the next roster poll. */
  titleWorking: boolean
  session: ClaudeBackgroundSession | null
}

type SharedBackgroundObserver = {
  remote: RemoteCodexTarget
  controller: AbortController
  subscribers: Set<BackgroundObserverSubscriber>
  timer: ReturnType<typeof setTimeout> | null
  running: Promise<void> | null
  refreshRequested: boolean
  refresh: () => void
}

const sharedBackgroundObservers = new Map<string, SharedBackgroundObserver>()

function backgroundObserverKey(remote: RemoteCodexTarget) {
  return `${remote.profile.id}\0${remote.workingDirectory}`
}

function subscriberState(
  subscriber: BackgroundObserverSubscriber,
  session: ClaudeBackgroundSession,
) {
  const state = claudeBackgroundAgentState(session, subscriber.turnObserved)
  // A roster row read before the turn started cannot end the turn the title reports.
  return subscriber.titleWorking && (state === "idle" || state === "done") ? "working" : state
}

function publishBackgroundSession(
  remote: RemoteCodexTarget,
  subscriber: BackgroundObserverSubscriber,
  session: ClaudeBackgroundSession,
) {
  subscriber.session = session
  const state = subscriberState(subscriber, session)
  if (state === "working" || state === "blocked") subscriber.turnObserved = true
  const nextSignature = JSON.stringify([
    state,
    session.state,
    session.status,
    session.waitingFor,
    session.name,
    session.cwd,
  ])
  if (subscriber.signature === nextSignature) return
  subscriber.signature = nextSignature
  const thread = resumeThread(session, remote.profile)
  try {
    rememberClaudeResumeThread({ ...thread, updatedAt: Date.now() })
  } catch {
    // Resume metadata must never interrupt the attached official TUI.
  }
  subscriber.events.onState(state)
  if (session.name) subscriber.events.onTitle(session.name)
  subscriber.events.onHydrated?.(hydration(session, state))
}

function observeBackgroundTitle(
  observer: SharedBackgroundObserver,
  subscriber: BackgroundObserverSubscriber,
  title: string,
) {
  const signal = detectAgentTitle("claude", title)
  if (signal.state === "working") {
    if (subscriber.titleWorking) return
    subscriber.titleWorking = true
    subscriber.turnObserved = true
    if (subscriber.session)
      publishBackgroundSession(observer.remote, subscriber, subscriber.session)
    else subscriber.events.onState("working")
  } else if (signal.state === "idle" && subscriber.titleWorking) {
    // The roster decides between completion and an open prompt as soon as the turn ends.
    subscriber.titleWorking = false
    observer.refresh()
  }
}

function createSharedBackgroundObserver(
  remote: RemoteCodexTarget,
  options: BackgroundObserverOptions,
) {
  const readSessions = options.readSessions ?? readRemoteClaudeBackgroundSessions
  const intervalMs = options.intervalMs ?? 5_000
  const observer: SharedBackgroundObserver = {
    remote,
    controller: new AbortController(),
    subscribers: new Set(),
    timer: null,
    running: null,
    refreshRequested: false,
    refresh: () => undefined,
  }

  const poll = async () => {
    if (observer.controller.signal.aborted) return
    observer.refreshRequested = false
    try {
      const sessions = await readSessions(
        observer.remote.profile,
        AbortSignal.any([observer.controller.signal, AbortSignal.timeout(12_000)]),
        observer.remote.workingDirectory,
      )
      for (const subscriber of observer.subscribers) {
        const session = sessions.find((candidate) => candidate.sessionId === subscriber.sessionId)
        if (session) publishBackgroundSession(observer.remote, subscriber, session)
      }
    } catch {
      // A transient SSH or supervisor failure is retried without replacing known state.
    } finally {
      if (!observer.controller.signal.aborted)
        observer.timer = setTimeout(schedule, observer.refreshRequested ? 0 : intervalMs)
    }
  }
  const schedule = () => {
    observer.timer = null
    const running = poll().finally(() => {
      if (observer.running === running) observer.running = null
    })
    observer.running = running
  }
  // Polls never overlap: a refresh during a read runs right after it.
  observer.refresh = () => {
    if (observer.controller.signal.aborted) return
    if (!observer.timer) {
      observer.refreshRequested = true
      return
    }
    clearTimeout(observer.timer)
    schedule()
  }
  schedule()
  return observer
}

export function startRemoteClaudeBackgroundObserver(
  remote: RemoteCodexTarget,
  sessionId: string,
  events: BackgroundObserverEvents,
  parentSignal: AbortSignal,
  options: BackgroundObserverOptions = {},
) {
  const key = backgroundObserverKey(remote)
  const observer =
    sharedBackgroundObservers.get(key) ?? createSharedBackgroundObserver(remote, options)
  sharedBackgroundObservers.set(key, observer)
  const subscriber: BackgroundObserverSubscriber = {
    sessionId,
    events,
    signature: "",
    turnObserved: false,
    titleWorking: false,
    session: null,
  }
  observer.subscribers.add(subscriber)
  let stopped = false
  let onParentAbort: () => void = () => undefined

  const stop = async () => {
    if (stopped) return
    stopped = true
    parentSignal.removeEventListener("abort", onParentAbort)
    observer.subscribers.delete(subscriber)
    if (observer.subscribers.size > 0) return
    sharedBackgroundObservers.delete(key)
    observer.controller.abort()
    if (observer.timer) clearTimeout(observer.timer)
    await observer.running?.catch(() => undefined)
  }
  onParentAbort = () => void stop()
  if (parentSignal.aborted) void stop()
  else parentSignal.addEventListener("abort", onParentAbort, { once: true })

  return {
    stop,
    observeTitle(title: string) {
      if (!stopped) observeBackgroundTitle(observer, subscriber, title)
    },
  }
}
