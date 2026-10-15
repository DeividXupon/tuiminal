import type { AgentProviderId } from "./agent-provider"
import { AGENT_RESUME_SOURCE_LIMIT, compareAgentResumeThreads } from "./agent-resume-order"
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
  loadingInitialProviders: readonly AgentProviderId[]
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
  loadingInitialProviders: [],
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

/** Search covers the bounded roster; only the unfiltered view limits recent rows. */
export function agentResumeThreadsForTab(
  threads: readonly AgentResumeThread[],
  tab: AgentResumeTab,
  activeRemoteProfileId: string | undefined,
  limits: AgentResumePaginationState["limits"] = DEFAULT_AGENT_RESUME_PAGINATION.limits,
  query = "",
) {
  const search = query.trim().toLocaleLowerCase()
  const providers: readonly AgentProviderId[] =
    tab === "global" ? ["codex", "claude", "opencode"] : [tab]
  const projected = providers.flatMap((providerId) => {
    const limit = search
      ? AGENT_RESUME_SOURCE_LIMIT
      : tab === "global"
        ? AGENT_RESUME_GLOBAL_ORIGIN_LIMIT
        : limits[providerId]
    return [
      ...originThreads(threads, providerId, undefined).slice(0, limit),
      ...(activeRemoteProfileId
        ? originThreads(threads, providerId, activeRemoteProfileId).slice(0, limit)
        : []),
    ]
  })
  return projected
    .filter(
      (thread) =>
        !search ||
        `${thread.title} ${thread.preview} ${thread.cwd} ${thread.projectName} ${thread.gitBranch} ${thread.remoteProfileName ?? ""}`
          .toLocaleLowerCase()
          .includes(search),
    )
    .sort(compareAgentResumeThreads)
}
