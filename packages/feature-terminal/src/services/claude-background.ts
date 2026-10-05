import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { agentResumeTimestamp } from "../model/agent-resume-thread"
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

function resumeState(state: ClaudeBackgroundSession["state"]): ClaudeResumeThread["state"] {
  if (state === "working") return "working"
  if (state === "blocked") return "blocked"
  if (state === "failed" || state === "stopped") return "failed"
  return "idle"
}

function agentState(state: ClaudeBackgroundSession["state"]): AgentState {
  if (state === "working") return "working"
  if (state === "blocked") return "blocked"
  if (state === "done") return "done"
  return "unknown"
}

function hydration(session: ClaudeBackgroundSession): CodexHydratedThread {
  return {
    threadId: session.sessionId,
    state: agentState(session.state),
    latestTurnStatus:
      session.state === "working" || session.state === "blocked"
        ? "inProgress"
        : session.state === "done"
          ? "completed"
          : session.state === "failed"
            ? "failed"
            : "interrupted",
    waitingOnApproval: session.state === "blocked",
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
    state: resumeState(session.state),
    remoteProfileId: profile.id,
    remoteProfileName: profile.name,
    remoteProfileHost: profile.host,
  }
}

export async function refreshRemoteClaudeResumeThreads(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
) {
  const sessions = await readRemoteClaudeBackgroundSessions(profile, signal)
  const threads = sessions.map((session) => resumeThread(session, profile))
  mergeClaudeResumeThreads(threads, profile.id)
  return threads
}

type BackgroundObserverEvents = Pick<ClaudeHookEvents, "onState" | "onTitle" | "onHydrated">

type BackgroundObserverSubscriber = {
  sessionId: string
  events: BackgroundObserverEvents
  signature: string
}

type SharedBackgroundObserver = {
  remote: RemoteCodexTarget
  controller: AbortController
  subscribers: Set<BackgroundObserverSubscriber>
  timer: ReturnType<typeof setTimeout> | null
  running: Promise<void> | null
}

const sharedBackgroundObservers = new Map<string, SharedBackgroundObserver>()

function backgroundObserverKey(remote: RemoteCodexTarget) {
  return `${remote.profile.id}\0${remote.workingDirectory}`
}

function publishBackgroundSession(
  remote: RemoteCodexTarget,
  subscriber: BackgroundObserverSubscriber,
  session: ClaudeBackgroundSession,
) {
  const nextSignature = JSON.stringify([
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
  subscriber.events.onState(agentState(session.state))
  if (session.name) subscriber.events.onTitle(session.name)
  subscriber.events.onHydrated?.(hydration(session))
}

function createSharedBackgroundObserver(remote: RemoteCodexTarget) {
  const observer: SharedBackgroundObserver = {
    remote,
    controller: new AbortController(),
    subscribers: new Set(),
    timer: null,
    running: null,
  }

  const poll = async () => {
    if (observer.controller.signal.aborted) return
    try {
      const sessions = await readRemoteClaudeBackgroundSessions(
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
      if (!observer.controller.signal.aborted) observer.timer = setTimeout(schedule, 5_000)
    }
  }
  const schedule = () => {
    observer.running = poll().finally(() => {
      observer.running = null
    })
  }
  schedule()
  return observer
}

export function startRemoteClaudeBackgroundObserver(
  remote: RemoteCodexTarget,
  sessionId: string,
  events: BackgroundObserverEvents,
  parentSignal: AbortSignal,
) {
  const key = backgroundObserverKey(remote)
  const observer = sharedBackgroundObservers.get(key) ?? createSharedBackgroundObserver(remote)
  sharedBackgroundObservers.set(key, observer)
  const subscriber: BackgroundObserverSubscriber = { sessionId, events, signature: "" }
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
  }
}
