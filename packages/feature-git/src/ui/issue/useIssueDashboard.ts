import { useCallback, useEffect, useRef, useState } from "react"
import { useNotificationFromValue } from "@xupon/tuiminal-core/notifications/index"
import { resolveGitProjectScope } from "../../services/git"
import { GitHubAuthenticationRequiredError } from "../../services/github/auth"
import {
  type GhTransportOptions,
  GitHubTransportError,
  githubTransportDisplayMessage,
  isGitHubReadCancellation,
} from "../../services/github/transport"
import { IssueSession, type IssueSessionResult } from "../../services/issue-session"

export type IssueDashboardState =
  | { status: "demo" }
  | { status: "idle" }
  | { status: "loading" }
  | { status: "authentication"; host: string }
  | IssueSessionResult
  | { status: "error"; kind: string; error: string }

function transportFromEnvironment(): GhTransportOptions {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return executable ? { executable } : {}
}

function dashboardError(error: unknown): IssueDashboardState {
  if (error instanceof GitHubAuthenticationRequiredError) {
    return { status: "authentication", host: error.host }
  }
  if (error instanceof GitHubTransportError) {
    return { status: "error", kind: error.kind, error: githubTransportDisplayMessage(error) }
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
  const refreshBusyRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const pageRequestRef = useRef(0)
  const refreshRef = useRef<() => Promise<void>>(async () => undefined)
  const refreshSeconds = state.status === "ready" ? state.refreshSeconds : null
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
      pageRequestRef.current += 1
      loadingMoreRef.current = false
      setLoadingMore(false)
      setRefreshing(false)
      setRefreshError("")
      setState({ status: "loading" })
      try {
        const root = await resolveGitProjectScope()
        const result = await session.loadSection(root, sectionId, queryOverride, force)
        if (generation === generationRef.current) setState(result)
      } catch (error) {
        if (generation === generationRef.current && !isGitHubReadCancellation(error)) {
          setState(dashboardError(error))
        }
      }
    },
    [demo, queryOverride, sectionId, session],
  )

  const refresh = useCallback(async () => {
    if (demo) return
    if (state.status !== "ready") return load(true)
    if (refreshBusyRef.current) return
    refreshBusyRef.current = true
    pageRequestRef.current += 1
    loadingMoreRef.current = false
    setLoadingMore(false)
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
      if (
        generation === generationRef.current &&
        failure.status === "error" &&
        !isGitHubReadCancellation(error)
      )
        setRefreshError(failure.error)
    } finally {
      refreshBusyRef.current = false
      if (generation === generationRef.current) setRefreshing(false)
    }
  }, [demo, load, queryOverride, sectionId, session, state])
  refreshRef.current = refresh
  const refreshActive = useCallback(async () => {
    if (demo || state.status !== "ready" || refreshBusyRef.current || loadingMoreRef.current) return
    refreshBusyRef.current = true
    const generation = generationRef.current
    setRefreshError("")
    try {
      const result = await session.refreshSections(
        state.root,
        queryOverride ? [] : [state.section.id],
        state.section.id,
        queryOverride,
        false,
      )
      if (generation === generationRef.current) setState(result)
    } catch (error) {
      const failure = dashboardError(error)
      if (
        generation === generationRef.current &&
        failure.status === "error" &&
        !isGitHubReadCancellation(error)
      ) {
        setRefreshError(failure.error)
      }
    } finally {
      refreshBusyRef.current = false
    }
  }, [demo, queryOverride, session, state])
  const loadMore = useCallback(async () => {
    if (
      demo ||
      state.status !== "ready" ||
      !state.hasNextPage ||
      loadingMoreRef.current ||
      refreshBusyRef.current
    )
      return
    loadingMoreRef.current = true
    const generation = generationRef.current
    const pageRequest = ++pageRequestRef.current
    setLoadingMore(true)
    setRefreshError("")
    try {
      const result = await session.loadNextPage(state.root, sectionId, queryOverride)
      if (generation === generationRef.current && pageRequest === pageRequestRef.current)
        setState(result)
    } catch (error) {
      const failure = dashboardError(error)
      if (
        generation === generationRef.current &&
        pageRequest === pageRequestRef.current &&
        failure.status === "error" &&
        !isGitHubReadCancellation(error)
      ) {
        setRefreshError(failure.error)
      }
    } finally {
      if (pageRequest === pageRequestRef.current) {
        loadingMoreRef.current = false
        if (generation === generationRef.current) setLoadingMore(false)
      }
    }
  }, [demo, queryOverride, sectionId, session, state])

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
    if (!active || refreshSeconds === null) return
    const timer = setInterval(() => {
      if (!loadingMoreRef.current) void refreshRef.current()
    }, refreshSeconds * 1_000)
    return () => clearInterval(timer)
  }, [active, refreshSeconds])

  useNotificationFromValue(refreshError, { source: "Git · Issues", kind: "error" })
  return { state, refresh, refreshActive, loadMore, loadingMore, refreshing }
}
