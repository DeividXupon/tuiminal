import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { cleanAgentMessage } from "../model/agent-message-history"
import { isClaudeSessionId } from "../model/claude-resume-threads"
import type { RemoteCodexTarget } from "../model/sessions"
import { type BoundedCommandResult, runBoundedCommand } from "./bounded-command"
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
  updatedAt?: number
  state: "working" | "blocked" | "done" | "failed" | "stopped"
  status: "busy" | "waiting" | "idle" | null
  waitingFor: string
}

export type ClaudeBackgroundLaunch = {
  sessionId: string
  shortId: string
  created: boolean
}

type ClaudeBackgroundOperations = {
  readSessions?: typeof readRemoteClaudeBackgroundSessions
  runCommand?: (command: readonly string[], signal: AbortSignal) => Promise<BoundedCommandResult>
  stopSession?: (
    remote: RemoteCodexTarget,
    sessionId: string,
    knownShortId?: string,
  ) => Promise<void>
}

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

function clean(value: unknown, maximum: number) {
  if (typeof value !== "string") return ""
  return Array.from(cleanAgentMessage(value)).slice(0, maximum).join("")
}

function publicTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value
  if (typeof value !== "string") return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
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
    const updatedAt = publicTimestamp(entry.updatedAt)
    return [
      {
        id,
        sessionId: entry.sessionId,
        cwd,
        name: clean(entry.name, 160),
        startedAt,
        ...(updatedAt ? { updatedAt } : {}),
        state: state as ClaudeBackgroundSession["state"],
        status,
        waitingFor: clean(entry.waitingFor, 256),
      },
    ]
  })
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

async function retireAttemptedClaudeBackgroundSession(
  remote: RemoteCodexTarget,
  requestedSessionId: string,
  previousIds: ReadonlySet<string>,
  printedId: string | null,
  readSessions: typeof readRemoteClaudeBackgroundSessions,
  stopSession: NonNullable<ClaudeBackgroundOperations["stopSession"]>,
) {
  let shortId = printedId && !previousIds.has(printedId) ? printedId : null
  let observed = false
  let lastReadError: unknown
  const signal = AbortSignal.timeout(15_000)
  for (let attempt = 0; !shortId && attempt < 5; attempt++) {
    signal.throwIfAborted()
    try {
      const sessions = await readSessions(remote.profile, signal, remote.workingDirectory)
      observed = true
      shortId =
        sessions.find(
          (session) => session.sessionId === requestedSessionId && !previousIds.has(session.id),
        )?.id ?? null
    } catch (error) {
      lastReadError = error
    }
    if (!shortId && attempt < 4) await Bun.sleep(100)
  }
  if (!shortId) {
    if (!observed && lastReadError) throw lastReadError
    return
  }
  await stopSession(remote, requestedSessionId, shortId)
}

type ClaudeBackgroundAttempt = {
  started: boolean
  printedId: string | null
}

async function waitForCreatedClaudeBackgroundSession(
  remote: RemoteCodexTarget,
  requestedSessionId: string,
  printedId: string | null,
  previousIds: ReadonlySet<string>,
  signal: AbortSignal,
  readSessions: typeof readRemoteClaudeBackgroundSessions,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const sessions = await readSessions(remote.profile, signal, remote.workingDirectory)
    const created =
      sessions.find((session) => session.sessionId === requestedSessionId) ??
      sessions.find((session) => session.id === printedId && !previousIds.has(session.id))
    if (created) return created
    if (attempt < 4) await Bun.sleep(100)
  }
  return null
}

async function createRemoteClaudeBackgroundSession(
  remote: RemoteCodexTarget,
  requestedSessionId: string,
  settings: string,
  resume: boolean,
  signal: AbortSignal,
  previousIds: ReadonlySet<string>,
  attempt: ClaudeBackgroundAttempt,
  readSessions: typeof readRemoteClaudeBackgroundSessions,
  runCommand: NonNullable<ClaudeBackgroundOperations["runCommand"]>,
): Promise<ClaudeBackgroundLaunch> {
  const command = remoteClaudeBackgroundStartCommand(
    remote.profile,
    remote.workingDirectory,
    settings,
    requestedSessionId,
    resume,
  )
  attempt.started = true
  const result = await runCommand(command, signal)
  attempt.printedId = printedBackgroundId(`${result.stdout}\n${result.stderr}`)
  signal.throwIfAborted()
  if (result.exitCode !== 0)
    throw new Error("Não foi possível iniciar a sessão remota do Claude Code.")

  const created = await waitForCreatedClaudeBackgroundSession(
    remote,
    requestedSessionId,
    attempt.printedId,
    previousIds,
    signal,
    readSessions,
  )
  if (created) return { sessionId: created.sessionId, shortId: created.id, created: true }
  if (attempt.printedId && !resume)
    return { sessionId: requestedSessionId, shortId: attempt.printedId, created: true }
  throw new Error("O Claude Code não informou a sessão remota criada.")
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
  const stopSession = operations.stopSession ?? stopRemoteClaudeBackgroundSession
  const existing = await readSessions(remote.profile, signal, remote.workingDirectory)
  const attached = existing.find((session) => session.sessionId === requestedSessionId)
  if (attached) return { sessionId: attached.sessionId, shortId: attached.id, created: false }

  const before = new Set(existing.map((session) => session.id))
  const attempt: ClaudeBackgroundAttempt = { started: false, printedId: null }
  try {
    return await createRemoteClaudeBackgroundSession(
      remote,
      requestedSessionId,
      settings,
      resume,
      signal,
      before,
      attempt,
      readSessions,
      runCommand,
    )
  } catch (error) {
    if (attempt.started)
      try {
        await retireAttemptedClaudeBackgroundSession(
          remote,
          requestedSessionId,
          before,
          attempt.printedId,
          readSessions,
          stopSession,
        )
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          cleanupError instanceof Error
            ? cleanupError.message
            : "Não foi possível encerrar a sessão remota do Claude Code.",
        )
      }
    throw error
  }
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

export async function retireCreatedRemoteClaudeBackgroundSession(
  remote: RemoteCodexTarget,
  launch: ClaudeBackgroundLaunch,
  stopSession: NonNullable<
    ClaudeBackgroundOperations["stopSession"]
  > = stopRemoteClaudeBackgroundSession,
) {
  if (!launch.created) return
  await stopSession(remote, launch.sessionId, launch.shortId)
}
