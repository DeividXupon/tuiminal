import { useEffect, useMemo, useRef, useState } from "react"
import type { AgentProviderId } from "../model/agent-provider"
import {
  AGENT_RESUME_SOURCE_LIMIT,
  type AgentResumePaginationState,
  type AgentResumeTab,
} from "../model/agent-resume-thread"

const PROVIDERS: readonly AgentProviderId[] = ["codex", "claude", "opencode"]

/** Expand search beyond recent rows, one page per provider at a time. */
export function useAgentResumeSearch(
  query: string,
  tab: AgentResumeTab,
  remoteProfileId: string | undefined,
  pagination: AgentResumePaginationState,
  loadMore: ((providerId: AgentProviderId) => void) | undefined,
  inactive: boolean,
) {
  const search = query.trim().toLocaleLowerCase()
  const scope = JSON.stringify([search, tab, remoteProfileId, inactive])
  const [attempted, setAttempted] = useState<{
    scope: string
    limits: Partial<AgentResumePaginationState["limits"]>
  }>({ scope: "", limits: {} })
  const pending = useMemo(
    () =>
      !search || inactive || !loadMore
        ? []
        : PROVIDERS.filter(
            (providerId) =>
              (tab === "global" || tab === providerId) &&
              pagination.hasMore[providerId] &&
              pagination.limits[providerId] < AGENT_RESUME_SOURCE_LIMIT &&
              !pagination.loadingInitialProviders.includes(providerId) &&
              !pagination.loadingMore.includes(providerId) &&
              (attempted.scope !== scope ||
                attempted.limits[providerId] !== pagination.limits[providerId]),
          ),
    [search, inactive, loadMore, tab, pagination, attempted, scope],
  )
  const request = useRef({ loadMore, pending, limits: pagination.limits })
  request.current = { loadMore, pending, limits: pagination.limits }
  const pageKey = JSON.stringify(
    pending.map((providerId) => [providerId, pagination.limits[providerId]]),
  )

  useEffect(() => {
    // Reset even for an empty query so retyping it can retry a failed page.
    if (attempted.scope !== scope) setAttempted({ scope, limits: {} })
  }, [attempted.scope, scope])

  useEffect(() => {
    if (pageKey === "[]") return
    const timer = setTimeout(() => {
      const { loadMore, pending, limits } = request.current
      // Remember the page before requesting it: a failed/no-progress request must
      // not become an automatic retry loop, including across pinned-sidebar IPC.
      setAttempted((current) => ({
        scope,
        limits: {
          ...(current.scope === scope ? current.limits : {}),
          ...Object.fromEntries(pending.map((providerId) => [providerId, limits[providerId]])),
        },
      }))
      for (const providerId of pending) loadMore?.(providerId)
    }, 150)
    return () => clearTimeout(timer)
  }, [pageKey, scope])

  return useMemo(
    () => ({
      ...pagination,
      loadingMore: [...new Set([...pagination.loadingMore, ...pending])],
    }),
    [pagination, pending],
  )
}
