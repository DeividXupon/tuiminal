import type { AgentProviderId } from "./agent-provider"

export const AGENT_RESUME_SOURCE_LIMIT = 120

type OrderedAgentResumeThread = {
  id: string
  updatedAt: number
  providerId?: AgentProviderId
  remoteProfileId?: string
}

/** Provider APIs currently mix Unix seconds and milliseconds. Compare and display one unit. */
export function agentResumeTimestamp(updatedAt: number) {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return 0
  return updatedAt < 10_000_000_000 ? updatedAt * 1_000 : updatedAt
}

export function agentResumeThreadKey(thread: OrderedAgentResumeThread) {
  return [thread.providerId ?? "codex", thread.remoteProfileId ?? "local", thread.id].join(":")
}

export function compareAgentResumeThreads(
  left: OrderedAgentResumeThread,
  right: OrderedAgentResumeThread,
) {
  return (
    agentResumeTimestamp(right.updatedAt) - agentResumeTimestamp(left.updatedAt) ||
    agentResumeThreadKey(left).localeCompare(agentResumeThreadKey(right))
  )
}
