import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteFileSync, currentFileHash } from "@xupon/tuiminal-core/storage/atomic-file"
import { cleanAgentMessage } from "../model/agent-message-history"
import {
  AGENT_RESUME_PAGE_SIZE,
  AGENT_RESUME_SOURCE_LIMIT,
  type AgentResumePage,
} from "../model/agent-resume-thread"
import {
  type ClaudeResumeThread,
  claudeResumeThreadKey,
  claudeResumeThreadsSnapshot,
  isClaudeSessionId,
  publishClaudeResumeThreads,
} from "../model/claude-resume-threads"
import { projectName } from "../model/project-name"
import { terminalWorkspaceStateDirectory } from "./terminal-workspace-state"

const MAX_LOCAL_SESSIONS = AGENT_RESUME_SOURCE_LIMIT
const MAX_REMOTE_SESSIONS = AGENT_RESUME_SOURCE_LIMIT
const MAX_SESSIONS = MAX_LOCAL_SESSIONS + MAX_REMOTE_SESSIONS
const STORED_TITLE_LENGTH = 60

function resumeEnabled(environment: NodeJS.ProcessEnv) {
  return (
    environment.TUIMINAL_TERMINAL_CLAUDE_RESUME !== "0" &&
    environment.TUIMINAL_TERMINAL_WORKSPACE_STATE !== "0"
  )
}

function clean(value: string, maximum: number) {
  return Array.from(cleanAgentMessage(value)).slice(0, maximum).join("")
}

/** Persisted titles stay a short label so prompts are not stored beyond Claude's own history. */
function storedTitle(title: string) {
  const characters = Array.from(title)
  return characters.length > STORED_TITLE_LENGTH
    ? `${characters.slice(0, STORED_TITLE_LENGTH - 1).join("")}…`
    : title
}

function boundedString(value: unknown, maximum: number) {
  return typeof value === "string" && value.length <= maximum ? value : undefined
}

function remoteHost(value: unknown) {
  const host = boundedString(value, 255)
  return host && /^[a-z\d_][a-z\d_.-]*$/iu.test(host) ? host : undefined
}

function validThread(value: unknown): ClaudeResumeThread | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const entry = value as Partial<ClaudeResumeThread>
  if (
    !isClaudeSessionId(entry.id) ||
    typeof entry.cwd !== "string" ||
    !entry.cwd ||
    entry.cwd.length > 4_096 ||
    typeof entry.updatedAt !== "number" ||
    !Number.isFinite(entry.updatedAt)
  )
    return null
  const state = ["working", "blocked", "idle", "failed"].includes(String(entry.state))
    ? (entry.state as ClaudeResumeThread["state"])
    : "idle"
  const remoteProfileId = boundedString(entry.remoteProfileId, 256)
  const profileName = boundedString(entry.remoteProfileName, 256)
  const remoteProfileName = profileName ? clean(profileName, 256) : undefined
  const remoteProfileHost = remoteHost(entry.remoteProfileHost)
  return {
    id: entry.id,
    title:
      clean(typeof entry.title === "string" ? entry.title : "Claude Code", 160) || "Claude Code",
    preview: clean(typeof entry.preview === "string" ? entry.preview : "", 500),
    lastResponse: clean(typeof entry.lastResponse === "string" ? entry.lastResponse : "", 1_000),
    cwd: entry.cwd,
    projectName:
      clean(typeof entry.projectName === "string" ? entry.projectName : "", 256) ||
      projectName(entry.cwd),
    gitBranch: clean(typeof entry.gitBranch === "string" ? entry.gitBranch : "", 256),
    updatedAt: entry.updatedAt,
    state,
    ...(remoteProfileId ? { remoteProfileId } : {}),
    ...(remoteProfileName ? { remoteProfileName } : {}),
    ...(remoteProfileHost ? { remoteProfileHost } : {}),
  }
}

export function claudeResumeStorePath(environment: NodeJS.ProcessEnv = process.env) {
  return join(terminalWorkspaceStateDirectory(environment), "claude-sessions.json")
}

export function loadClaudeResumeThreads(environment: NodeJS.ProcessEnv = process.env) {
  if (!resumeEnabled(environment)) return []
  try {
    const path = claudeResumeStorePath(environment)
    if (statSync(path).size > 2 * 1024 * 1024) return []
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      version?: unknown
      sessions?: unknown
    }
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) return []
    return parsed.sessions
      .flatMap((entry): ClaudeResumeThread[] => {
        const thread = validThread(entry)
        return thread ? [thread] : []
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_SESSIONS)
  } catch {
    return []
  }
}

export function refreshClaudeResumeThreads(environment: NodeJS.ProcessEnv = process.env) {
  if (!resumeEnabled(environment)) {
    publishClaudeResumeThreads([])
    return []
  }
  const stored = loadClaudeResumeThreads(environment)
  const live = claudeResumeThreadsSnapshot()
  const liveByKey = new Map(live.map((thread) => [claudeResumeThreadKey(thread), thread]))
  const storedKeys = new Set(stored.map(claudeResumeThreadKey))
  const threads = [
    ...stored.map((thread) => liveByKey.get(claudeResumeThreadKey(thread)) ?? thread),
    ...live.filter((thread) => !storedKeys.has(claudeResumeThreadKey(thread))),
  ]
  publishClaudeResumeThreads(threads)
  return threads
}

/** Re-reads Tuiminal's bounded Claude index and reports an explicit local page boundary. */
export function loadClaudeResumeThreadsPage(
  limit = AGENT_RESUME_PAGE_SIZE,
  environment: NodeJS.ProcessEnv = process.env,
): AgentResumePage<ClaudeResumeThread> {
  const maximum = Math.max(0, Math.min(AGENT_RESUME_SOURCE_LIMIT, limit))
  refreshClaudeResumeThreads(environment)
  const local = claudeResumeThreadsSnapshot().filter(
    (thread) => thread.remoteProfileId === undefined,
  )
  return {
    threads: local.slice(0, maximum),
    nextCursor: null,
    hasMore: maximum < AGENT_RESUME_SOURCE_LIMIT && local.length > maximum,
  }
}

function boundedStoredSessions(threads: readonly ClaudeResumeThread[]) {
  const ordered = [...threads].sort((left, right) => right.updatedAt - left.updatedAt)
  const local = ordered
    .filter((thread) => thread.remoteProfileId === undefined)
    .slice(0, MAX_LOCAL_SESSIONS)
  const remote = ordered
    .filter((thread) => thread.remoteProfileId !== undefined)
    .slice(0, MAX_REMOTE_SESSIONS)
  return [...local, ...remote].sort((left, right) => right.updatedAt - left.updatedAt)
}

export function rememberClaudeResumeThread(
  thread: ClaudeResumeThread,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!resumeEnabled(environment)) return
  const normalized = validThread(thread)
  if (!normalized) return
  const storedThread = {
    ...normalized,
    title: storedTitle(normalized.title),
    preview: "",
    lastResponse: "",
  }
  const threadKey = claudeResumeThreadKey(storedThread)
  const file = claudeResumeStorePath(environment)
  for (let attempt = 0; attempt < 2; attempt++) {
    const expectedHash = currentFileHash(file)
    const sessions = boundedStoredSessions([
      storedThread,
      ...loadClaudeResumeThreads(environment).filter(
        (candidate) => claudeResumeThreadKey(candidate) !== threadKey,
      ),
    ])
    try {
      atomicWriteFileSync(file, `${JSON.stringify({ version: 1, sessions })}\n`, {
        expectedHash,
        mode: 0o600,
      })
      const live = claudeResumeThreadsSnapshot()
      const liveKeys = new Set(live.map(claudeResumeThreadKey))
      publishClaudeResumeThreads([
        normalized,
        ...live.filter((candidate) => claudeResumeThreadKey(candidate) !== threadKey),
        ...sessions.filter((candidate) => !liveKeys.has(claudeResumeThreadKey(candidate))),
      ])
      return
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
}
