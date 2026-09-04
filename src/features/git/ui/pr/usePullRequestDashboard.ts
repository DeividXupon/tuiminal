import { useCallback, useEffect, useRef, useState } from "react"
import { resolveGitProjectScope } from "../../services/git"
import { type GhTransportOptions, GitHubTransportError } from "../../services/github/transport"
import { PullRequestSession, type PullRequestSessionResult } from "../../services/pr-session"

export type PullRequestDashboardState =
  | { status: "demo" }
  | { status: "idle" }
  | { status: "loading" }
  | PullRequestSessionResult
  | { status: "error"; kind: string; error: string }

function transportFromEnvironment(): GhTransportOptions {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return executable ? { executable } : {}
}

function dashboardError(error: unknown): PullRequestDashboardState {
  if (error instanceof GitHubTransportError) {
    return { status: "error", kind: error.kind, error: error.message }
  }
  return {
    status: "error",
    kind: "unknown",
    error: error instanceof Error ? error.message : "Unknown GitHub error",
  }
}

export function usePullRequestDashboard(
  active: boolean,
  sectionId: string | undefined,
  queryOverride: string | null = null,
) {
  const demo = process.env.TUIMINAL_GIT_PR_DEMO === "1"
  const [session] = useState(
    () => new PullRequestSession({ transport: transportFromEnvironment() }),
  )
  const [state, setState] = useState<PullRequestDashboardState>(() =>
    demo ? { status: "demo" } : { status: "idle" },
  )
  const [loadingMore, setLoadingMore] = useState(false)
  const generationRef = useRef(0)
  const cancelActiveLoad = useCallback(() => session.cancelActiveLoad(), [session])

  const load = useCallback(
    async (force: boolean) => {
      if (demo) {
        setState({ status: "demo" })
        return
      }
      const generation = generationRef.current + 1
      generationRef.current = generation
      setState({ status: "loading" })
      try {
        const root = await resolveGitProjectScope()
        const result = await session.loadSection(root, sectionId, queryOverride, force)
        if (generation === generationRef.current) setState(result)
      } catch (error) {
        if (generation === generationRef.current) setState(dashboardError(error))
      }
    },
    [demo, queryOverride, sectionId, session],
  )

  const refresh = useCallback(() => load(true), [load])

  const loadMore = useCallback(async () => {
    if (demo || state.status !== "ready" || !state.hasNextPage || loadingMore) return
    const generation = generationRef.current
    setLoadingMore(true)
    try {
      const result = await session.loadNextPage(state.root, sectionId, queryOverride)
      if (generation === generationRef.current) setState(result)
    } catch (error) {
      if (generation === generationRef.current) setState(dashboardError(error))
    } finally {
      if (generation === generationRef.current) setLoadingMore(false)
    }
  }, [demo, loadingMore, queryOverride, sectionId, session, state])

  useEffect(() => {
    if (active) void load(false)
    return () => {
      generationRef.current += 1
      cancelActiveLoad()
    }
  }, [active, cancelActiveLoad, load])

  useEffect(
    () => () => {
      generationRef.current += 1
      session.dispose()
    },
    [session],
  )

  return { state, refresh, loadMore, loadingMore }
}
