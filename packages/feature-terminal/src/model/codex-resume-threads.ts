import { AGENT_RESUME_SOURCE_LIMIT, compareAgentResumeThreads } from "./agent-resume-order"

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
  remoteProfileHost?: string
}

let threads: readonly CodexResumeThread[] = []
const sources = new Map<string, readonly CodexResumeThread[]>()
const listeners = new Set<() => void>()

function codexResumeThreadKey(thread: Pick<CodexResumeThread, "id" | "remoteProfileId">) {
  return `${thread.remoteProfileId ?? "local"}:${thread.id}`
}

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
  const previous = new Map(
    threads.map((thread) => [codexResumeThreadKey(thread), thread.lastResponse]),
  )
  const sourceThreads = next
    .map((thread) => ({
      ...thread,
      lastResponse: thread.lastResponse || previous.get(codexResumeThreadKey(thread)) || "",
    }))
    .sort(compareAgentResumeThreads)
    .slice(0, AGENT_RESUME_SOURCE_LIMIT)
  const sourceProfileId =
    remoteProfileId ?? next.find((thread) => thread.remoteProfileId)?.remoteProfileId
  sources.set(sourceProfileId ? `remote:${sourceProfileId}` : "local", sourceThreads)
  const merged = [...sources.values()].flat().sort(compareAgentResumeThreads)
  if (JSON.stringify(merged) === JSON.stringify(threads)) return
  threads = merged
  for (const listener of listeners) listener()
}

/** Appends one cursor page without erasing the other local or remote origins. */
export function mergeCodexResumeThreads(
  next: readonly CodexResumeThread[],
  remoteProfileId?: string,
) {
  const source = remoteProfileId ? `remote:${remoteProfileId}` : "local"
  const incoming = new Set(next.map((thread) => thread.id))
  publishCodexResumeThreads(
    [...next, ...(sources.get(source) ?? []).filter((thread) => !incoming.has(thread.id))]
      .sort(compareAgentResumeThreads)
      .slice(0, AGENT_RESUME_SOURCE_LIMIT),
    remoteProfileId,
  )
}

export function updateCodexResumeThreadResponse(
  id: string,
  value: string,
  remoteProfileId?: string,
) {
  const lastResponse = [
    ...value
      .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ]
    .slice(0, 1_000)
    .join("")
  if (!lastResponse) return
  const index = threads.findIndex(
    (thread) => thread.id === id && thread.remoteProfileId === remoteProfileId,
  )
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
