import type { AgentProviderId } from "./agent-provider"
import { compareAgentResumeThreads } from "./agent-resume-order"
import type { CodexResumeThread } from "./codex-resume-threads"

export {
  AGENT_RESUME_SOURCE_LIMIT,
  agentResumeThreadKey,
  agentResumeTimestamp,
  compareAgentResumeThreads,
} from "./agent-resume-order"

export type AgentResumeThread = CodexResumeThread & { providerId?: AgentProviderId }
export type AgentResumeTab = "global" | AgentProviderId
export type AgentResumePage<T extends AgentResumeThread = AgentResumeThread> = {
  threads: T[]
  nextCursor: string | null
  hasMore: boolean
}

export const AGENT_RESUME_GLOBAL_ORIGIN_LIMIT = 7
export const AGENT_RESUME_PAGE_SIZE = 12

export type AgentResumePaginationState = {
  limits: Record<AgentProviderId, number>
  hasMore: Record<AgentProviderId, boolean>
  loadingInitial: boolean
  loadingMore: readonly AgentProviderId[]
}

export const DEFAULT_AGENT_RESUME_PAGINATION: AgentResumePaginationState = {
  limits: {
    codex: AGENT_RESUME_PAGE_SIZE,
    claude: AGENT_RESUME_PAGE_SIZE,
    opencode: AGENT_RESUME_PAGE_SIZE,
  },
  hasMore: { codex: false, claude: false, opencode: false },
  loadingInitial: false,
  loadingMore: [],
}

function originThreads(
  threads: readonly AgentResumeThread[],
  providerId: AgentProviderId,
  remoteProfileId: string | undefined,
) {
  return threads
    .filter(
      (thread) =>
        (thread.providerId ?? "codex") === providerId &&
        (remoteProfileId
          ? thread.remoteProfileId === remoteProfileId
          : thread.remoteProfileId === undefined),
    )
    .sort(compareAgentResumeThreads)
}

/** Projects the loaded roster into the balanced Global or provider-specific Master Key tab. */
export function agentResumeThreadsForTab(
  threads: readonly AgentResumeThread[],
  tab: AgentResumeTab,
  activeRemoteProfileId: string | undefined,
  limits: AgentResumePaginationState["limits"] = DEFAULT_AGENT_RESUME_PAGINATION.limits,
) {
  const providers: readonly AgentProviderId[] =
    tab === "global" ? ["codex", "claude", "opencode"] : [tab]
  const projected = providers.flatMap((providerId) => {
    const limit = tab === "global" ? AGENT_RESUME_GLOBAL_ORIGIN_LIMIT : limits[providerId]
    return [
      ...originThreads(threads, providerId, undefined).slice(0, limit),
      ...(activeRemoteProfileId
        ? originThreads(threads, providerId, activeRemoteProfileId).slice(0, limit)
        : []),
    ]
  })
  return projected.sort(compareAgentResumeThreads)
}
