import type { CodexResumeThread } from "./codex-resume-threads"

export type OpenCodeResumeThread = CodexResumeThread

let threads: readonly OpenCodeResumeThread[] = []
const sources = new Map<string, readonly OpenCodeResumeThread[]>()
const listeners = new Set<() => void>()

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
  const merged = [...sources.values()]
    .flat()
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
  if (JSON.stringify(merged) === JSON.stringify(threads)) return
  threads = merged
  for (const listener of listeners) listener()
}

export function upsertOpenCodeResumeThread(thread: OpenCodeResumeThread, remoteProfileId?: string) {
  const source = remoteProfileId ? `remote:${remoteProfileId}` : "local"
  const current = sources.get(source) ?? []
  publishOpenCodeResumeThreads(
    [thread, ...current.filter((candidate) => candidate.id !== thread.id)].slice(0, 20),
    remoteProfileId,
  )
}

export function resetOpenCodeResumeThreadsForTests() {
  sources.clear()
  threads = []
  for (const listener of listeners) listener()
}
