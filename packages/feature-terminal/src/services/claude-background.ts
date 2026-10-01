import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { cleanAgentMessage } from "../model/agent-message-history"
import type { AgentState } from "../model/agent-state"
import {
  type ClaudeResumeThread,
  isClaudeSessionId,
  mergeClaudeResumeThreads,
} from "../model/claude-resume-threads"
import { projectName } from "../model/project-name"
import type { CodexHydratedThread } from "../model/remote-codex"
import type { RemoteCodexTarget } from "../model/sessions"
import { type BoundedCommandResult, runBoundedCommand } from "./bounded-command"
import type { ClaudeHookEvents } from "./claude-hooks"
import { rememberClaudeResumeThread } from "./claude-resume-store"
import {
  remoteClaudeAgentsCommand,
  remoteClaudeBackgroundStartCommand,
  remoteClaudeStopCommand,
} from "./remote-claude-connection"

type RecordValue = Record<string, unknown>

export type ClaudeBackgroundSession = {
  id: string
  sessionId: string
  cwd: string
  name: string
  startedAt: number
  state: "working" | "blocked" | "done" | "failed" | "stopped"
  status: "busy" | "waiting" | "idle" | null
  waitingFor: string
}

export type ClaudeBackgroundLaunch = {
  sessionId: string
  shortId: string
}

type ClaudeBackgroundOperations = {
  readSessions?: typeof readRemoteClaudeBackgroundSessions
  runCommand?: (command: readonly string[], signal: AbortSignal) => Promise<BoundedCommandResult>
}

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

function clean(value: unknown, maximum: number) {
  if (typeof value !== "string") return ""
  return Array.from(cleanAgentMessage(value)).slice(0, maximum).join("")
}

export function parseClaudeBackgroundSessions(value: string): ClaudeBackgroundSession[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((value): ClaudeBackgroundSession[] => {
    const entry = object(value)
    if (entry?.kind !== "background" || !isClaudeSessionId(entry.sessionId)) return []
    const id = clean(entry.id, 64)
    const cwd =
      typeof entry.cwd === "string" &&
      entry.cwd.startsWith("/") &&
      entry.cwd.length <= 4_096 &&
      !/[\p{Cc}\p{Cf}]/u.test(entry.cwd)
        ? entry.cwd
        : ""
    const startedAt = Number(entry.startedAt)
    const state = String(entry.state)
    if (
      !/^[\da-z-]{1,64}$/iu.test(id) ||
      !cwd ||
      !Number.isFinite(startedAt) ||
      !["working", "blocked", "done", "failed", "stopped"].includes(state)
    )
      return []
    const status = ["busy", "waiting", "idle"].includes(String(entry.status))
      ? (entry.status as ClaudeBackgroundSession["status"])
      : null
    return [
      {
        id,
        sessionId: entry.sessionId,
        cwd,
        name: clean(entry.name, 160),
        startedAt,
        state: state as ClaudeBackgroundSession["state"],
        status,
        waitingFor: clean(entry.waitingFor, 256),
      },
    ]
  })
}

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
    updatedAt: session.startedAt,
    state: resumeState(session.state),
    remoteProfileId: profile.id,
    remoteProfileName: profile.name,
    remoteProfileHost: profile.host,
  }
}

export async function readRemoteClaudeBackgroundSessions(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
  workingDirectory?: string,
) {
  const result = await runBoundedCommand(
    remoteClaudeAgentsCommand(profile, workingDirectory),
    signal,
    () => {
      throw new Error("Não foi possível consultar as sessões remotas do Claude Code.")
    },
  )
  if (result.exitCode !== 0)
    throw new Error("Não foi possível consultar as sessões remotas do Claude Code.")
  return parseClaudeBackgroundSessions(result.stdout)
}

function printedBackgroundId(value: string) {
  return /(?:^|\n)backgrounded\s*[·:]\s*([\da-z-]{1,64})(?:\s|·|$)/iu.exec(value)?.[1] ?? null
}

/** Resolves an existing official background row or creates one before `claude attach`. */
export async function ensureRemoteClaudeBackgroundSession(
  remote: RemoteCodexTarget,
  requestedSessionId: string,
  settings: string,
  resume: boolean,
  signal: AbortSignal,
  operations: ClaudeBackgroundOperations = {},
): Promise<ClaudeBackgroundLaunch> {
  const readSessions = operations.readSessions ?? readRemoteClaudeBackgroundSessions
  const runCommand =
    operations.runCommand ??
    ((command: readonly string[], commandSignal: AbortSignal) =>
      runBoundedCommand(command, commandSignal, () => {
        throw new Error("Não foi possível iniciar a sessão remota do Claude Code.")
      }))
  const existing = await readSessions(remote.profile, signal, remote.workingDirectory)
  const attached = existing.find((session) => session.sessionId === requestedSessionId)
  if (attached) return { sessionId: attached.sessionId, shortId: attached.id }

  const before = new Set(existing.map((session) => session.id))
  const result = await runCommand(
    remoteClaudeBackgroundStartCommand(
      remote.profile,
      remote.workingDirectory,
      settings,
      requestedSessionId,
      resume,
    ),
    signal,
  )
  if (result.exitCode !== 0)
    throw new Error("Não foi possível iniciar a sessão remota do Claude Code.")

  const printedId = printedBackgroundId(`${result.stdout}\n${result.stderr}`)
  for (let attempt = 0; attempt < 5; attempt++) {
    const sessions = await readSessions(remote.profile, signal, remote.workingDirectory)
    const created =
      sessions.find((session) => session.sessionId === requestedSessionId) ??
      sessions.find((session) => session.id === printedId) ??
      sessions.filter((session) => !before.has(session.id)).at(0)
    if (created) return { sessionId: created.sessionId, shortId: created.id }
    if (attempt < 4) await Bun.sleep(100)
  }
  if (printedId && !resume) return { sessionId: requestedSessionId, shortId: printedId }
  throw new Error("O Claude Code não informou a sessão remota criada.")
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

export async function stopRemoteClaudeBackgroundSession(
  remote: RemoteCodexTarget,
  sessionId: string,
  knownShortId?: string,
) {
  const signal = AbortSignal.timeout(15_000)
  const shortId =
    knownShortId ??
    (await readRemoteClaudeBackgroundSessions(remote.profile, signal)).find(
      (candidate) => candidate.sessionId === sessionId,
    )?.id
  if (!shortId) return
  const result = await runBoundedCommand(
    remoteClaudeStopCommand(remote.profile, remote.workingDirectory, shortId),
    signal,
  )
  if (result.exitCode !== 0)
    throw new Error("Não foi possível encerrar a sessão remota do Claude Code.")
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
