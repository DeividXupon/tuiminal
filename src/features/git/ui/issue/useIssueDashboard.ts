import { useCallback, useEffect, useRef, useState } from "react"
import { useNotificationFromValue } from "../../../../shared/notifications"
import { resolveGitProjectScope } from "../../services/git"
import { type GhTransportOptions, GitHubTransportError } from "../../services/github/transport"
import { IssueSession, type IssueSessionResult } from "../../services/issue-session"

export type IssueDashboardState =
  | { status: "demo" }
  | { status: "idle" }
  | { status: "loading" }
  | IssueSessionResult
  | { status: "error"; kind: string; error: string }

function transportFromEnvironment(): GhTransportOptions {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return executable ? { executable } : {}
}

function dashboardError(error: unknown): IssueDashboardState {
  if (error instanceof GitHubTransportError) {
    return { status: "error", kind: error.kind, error: error.message }
  }
  return {
    status: "error",
    kind: "unknown",
    error: error instanceof Error ? error.message : "Unknown GitHub error",
  }
}

export function useIssueDashboard(
  active: boolean,
  sectionId: string | undefined,
  queryOverride: string | null = null,
  configurationRevision = 0,
) {
  const demo = process.env.TUIMINAL_GIT_ISSUES_DEMO === "1"
  const [session] = useState(() => new IssueSession({ transport: transportFromEnvironment() }))
  const [state, setState] = useState<IssueDashboardState>(() =>
    demo ? { status: "demo" } : { status: "idle" },
  )
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState("")
  const generationRef = useRef(0)
  const loadedConfigurationRevisionRef = useRef(configurationRevision)
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

  const refresh = useCallback(async () => {
    if (demo) return
    if (state.status !== "ready") return load(true)
    if (refreshing || loadingMore) return
    const generation = generationRef.current
    setRefreshing(true)
    setRefreshError("")
    try {
      const result = await session.refreshSections(
        state.root,
        state.profile.sections.map((section) => section.id),
        sectionId,
        queryOverride,
      )
      if (generation === generationRef.current) setState(result)
    } catch (error) {
      const failure = dashboardError(error)
      if (generation === generationRef.current && failure.status === "error")
        setRefreshError(failure.error)
    } finally {
      if (generation === generationRef.current) setRefreshing(false)
    }
  }, [demo, load, loadingMore, queryOverride, refreshing, sectionId, session, state])
  const loadMore = useCallback(async () => {
    if (demo || state.status !== "ready" || !state.hasNextPage || loadingMore || refreshing) return
    const generation = generationRef.current
    setLoadingMore(true)
    setRefreshError("")
    try {
      const result = await session.loadNextPage(state.root, sectionId, queryOverride)
      if (generation === generationRef.current) setState(result)
    } catch (error) {
      const failure = dashboardError(error)
      if (generation === generationRef.current && failure.status === "error") {
        setRefreshError(failure.error)
      }
    } finally {
      if (generation === generationRef.current) setLoadingMore(false)
    }
  }, [demo, loadingMore, queryOverride, refreshing, sectionId, session, state])

  useEffect(() => {
    if (active) {
      const force = loadedConfigurationRevisionRef.current !== configurationRevision
      loadedConfigurationRevisionRef.current = configurationRevision
      void load(force)
    }
    return () => {
      generationRef.current += 1
      cancelActiveLoad()
    }
  }, [active, cancelActiveLoad, configurationRevision, load])

  useEffect(
    () => () => {
      generationRef.current += 1
      session.dispose()
    },
    [session],
  )

  useEffect(() => {
    if (!active || state.status !== "ready") return
    const timer = setInterval(() => void refresh(), state.refreshSeconds * 1_000)
    return () => clearInterval(timer)
  }, [active, refresh, state])

  useNotificationFromValue(refreshError, { source: "Git · Issues", kind: "error" })
  return { state, refresh, loadMore, loadingMore, refreshing }
}
