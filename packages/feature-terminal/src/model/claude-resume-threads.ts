import type { CodexResumeThread } from "./codex-resume-threads"

export type ClaudeResumeThread = CodexResumeThread

const CLAUDE_SESSION_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu

/** Claude Code session ids are UUIDs; anything else must never reach `claude --resume`. */
export function isClaudeSessionId(value: unknown): value is string {
  return typeof value === "string" && CLAUDE_SESSION_ID.test(value)
}

let threads: readonly ClaudeResumeThread[] = []
const listeners = new Set<() => void>()

function newestFirst(left: ClaudeResumeThread, right: ClaudeResumeThread) {
  return right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)
}

export function claudeResumeThreadKey(
  thread: Pick<ClaudeResumeThread, "id" | "remoteProfileId" | "remoteProfileHost">,
) {
  return [thread.remoteProfileId ?? "local", thread.remoteProfileHost ?? "", thread.id].join(":")
}

export function claudeResumeThreadsSnapshot() {
  return threads
}

export function subscribeClaudeResumeThreads(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishClaudeResumeThreads(next: readonly ClaudeResumeThread[]) {
  const seen = new Set<string>()
  const normalized = next
    .filter((thread) => {
      const key = claudeResumeThreadKey(thread)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort(newestFirst)
    .slice(0, 100)
  if (JSON.stringify(normalized) === JSON.stringify(threads)) return
  threads = normalized
  for (const listener of listeners) listener()
}

export function upsertClaudeResumeThread(thread: ClaudeResumeThread) {
  const key = claudeResumeThreadKey(thread)
  publishClaudeResumeThreads([
    thread,
    ...threads.filter((candidate) => claudeResumeThreadKey(candidate) !== key),
  ])
}

/** Replaces one official local/remote roster without erasing sessions from other origins. */
export function mergeClaudeResumeThreads(
  next: readonly ClaudeResumeThread[],
  remoteProfileId?: string,
) {
  const retained = threads.filter((thread) =>
    remoteProfileId
      ? thread.remoteProfileId !== remoteProfileId
      : thread.remoteProfileId !== undefined,
  )
  publishClaudeResumeThreads([...next, ...retained])
}

export function resetClaudeResumeThreadsForTests() {
  threads = []
  for (const listener of listeners) listener()
}
