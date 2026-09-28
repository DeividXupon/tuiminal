export type CodexResumeThreadState = "working" | "blocked" | "idle" | "failed"

export type CodexResumeThread = {
  id: string
  title: string
  preview: string
  lastResponse: string
  cwd: string
  projectName: string
  gitBranch: string
  updatedAt: number
  state: CodexResumeThreadState
  remoteProfileId?: string
  remoteProfileName?: string
}

let threads: readonly CodexResumeThread[] = []
const sources = new Map<string, readonly CodexResumeThread[]>()
const listeners = new Set<() => void>()

export function codexResumeThreadsSnapshot() {
  return threads
}

export function subscribeCodexResumeThreads(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishCodexResumeThreads(
  next: readonly CodexResumeThread[],
  remoteProfileId?: string,
) {
  const previous = new Map(threads.map((thread) => [thread.id, thread.lastResponse]))
  const sourceThreads = next.map((thread) => ({
    ...thread,
    lastResponse: thread.lastResponse || previous.get(thread.id) || "",
  }))
  const sourceProfileId =
    remoteProfileId ?? next.find((thread) => thread.remoteProfileId)?.remoteProfileId
  sources.set(sourceProfileId ? `remote:${sourceProfileId}` : "local", sourceThreads)
  const merged = [...sources.values()]
    .flat()
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
  if (JSON.stringify(merged) === JSON.stringify(threads)) return
  threads = merged
  for (const listener of listeners) listener()
}

export function updateCodexResumeThreadResponse(id: string, value: string) {
  const lastResponse = [
    ...value
      .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ]
    .slice(0, 1_000)
    .join("")
  if (!lastResponse) return
  const index = threads.findIndex((thread) => thread.id === id)
  const current = threads[index]
  if (!current || current.lastResponse === lastResponse) return
  const next = [...threads]
  next[index] = { ...current, lastResponse }
  threads = next
  for (const listener of listeners) listener()
}

export function resetCodexResumeThreadsForTests() {
  sources.clear()
  threads = []
  for (const listener of listeners) listener()
}
