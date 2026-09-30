import type { CodexResumeThread } from "./codex-resume-threads"

export type OpenCodeResumeThread = CodexResumeThread

let threads: readonly OpenCodeResumeThread[] = []
const sources = new Map<string, readonly OpenCodeResumeThread[]>()
const listeners = new Set<() => void>()

function newestFirst(left: OpenCodeResumeThread, right: OpenCodeResumeThread) {
  return right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)
}

export function openCodeResumeThreadsSnapshot() {
  return threads
}

export function subscribeOpenCodeResumeThreads(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishOpenCodeResumeThreads(
  next: readonly OpenCodeResumeThread[],
  remoteProfileId?: string,
) {
  const source = remoteProfileId ? `remote:${remoteProfileId}` : "local"
  sources.set(source, next)
  const merged = [...sources.values()].flat().sort(newestFirst)
  if (JSON.stringify(merged) === JSON.stringify(threads)) return
  threads = merged
  for (const listener of listeners) listener()
}

/** Merges a project-scoped refresh without dropping known chats from other projects. */
export function mergeOpenCodeResumeThreads(
  next: readonly OpenCodeResumeThread[],
  remoteProfileId?: string,
) {
  const source = remoteProfileId ? `remote:${remoteProfileId}` : "local"
  const incoming = new Set(next.map((thread) => thread.id))
  publishOpenCodeResumeThreads(
    [...next, ...(sources.get(source) ?? []).filter((thread) => !incoming.has(thread.id))]
      .sort(newestFirst)
      .slice(0, 20),
    remoteProfileId,
  )
}

export function upsertOpenCodeResumeThread(thread: OpenCodeResumeThread, remoteProfileId?: string) {
  mergeOpenCodeResumeThreads([thread], remoteProfileId)
}

export function resetOpenCodeResumeThreadsForTests() {
  sources.clear()
  threads = []
  for (const listener of listeners) listener()
}
