import { useCallback, useEffect, useRef, useState } from "react"
import { applyInboxSubjectStates } from "../../model/inbox/notifications"
import { resolveGitProjectScope } from "../../services/git"
import { GitHubAuthenticationRequiredError } from "../../services/github/auth"
import { InboxSession, type InboxSessionResult } from "../../services/inbox-session"
import { type GhTransportOptions, GitHubTransportError } from "../../services/github/transport"
import { useGitHubNavigationReport } from "../GitNavigationContext"

export type InboxDashboardState =
  | { status: "demo" }
  | { status: "idle" | "loading" }
  | { status: "authentication"; host: string }
  | InboxSessionResult
  | { status: "error"; kind: string; error: string }

function transportFromEnvironment(): GhTransportOptions {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return executable ? { executable } : {}
}

function dashboardError(error: unknown): InboxDashboardState {
  if (error instanceof GitHubAuthenticationRequiredError) {
    return { status: "authentication", host: error.host }
  }
  if (error instanceof GitHubTransportError) {
    return { status: "error", kind: error.kind, error: error.message }
  }
  return {
    status: "error",
    kind: "unknown",
    error: error instanceof Error ? error.message : "Unknown GitHub error",
  }
}

export function useInboxDashboard(active: boolean, configurationRevision = 0) {
  const demo = process.env.TUIMINAL_GIT_INBOX_DEMO === "1"
  const [session] = useState(() => new InboxSession({ transport: transportFromEnvironment() }))
  const [state, setState] = useState<InboxDashboardState>(() =>
    demo ? { status: "demo" } : { status: "idle" },
  )
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [backgroundError, setBackgroundError] = useState("")
  const generationRef = useRef(0)
  const subjectItems = state.status === "ready" ? state.items : null
  const subjectHost = state.status === "ready" ? state.host : null
  const loadedConfigurationRevisionRef = useRef(configurationRevision)
  useGitHubNavigationReport("inbox", active, state, configurationRevision)

  const load = useCallback(
    async (force = false) => {
      if (demo) return setState({ status: "demo" })
      const generation = generationRef.current + 1
      generationRef.current = generation
      setBackgroundError("")
      setState({ status: "loading" })
      try {
        const root = await resolveGitProjectScope()
        const result = await session.load(root, force)
        if (generation === generationRef.current) setState(result)
      } catch (error) {
        if (generation === generationRef.current) setState(dashboardError(error))
      }
    },
    [demo, session],
  )

  const refresh = useCallback(async () => {
    if (demo || refreshing || loadingMore) return
    if (state.status !== "ready") {
      await load()
      return
    }
    const generation = generationRef.current
    setRefreshing(true)
    setBackgroundError("")
    try {
      const result = await session.refresh(state)
      if (generation === generationRef.current) setState(result)
    } catch (error) {
      const failure = dashboardError(error)
      if (generation === generationRef.current && failure.status === "error") {
        setBackgroundError(failure.error)
      }
    } finally {
      if (generation === generationRef.current) setRefreshing(false)
    }
  }, [demo, load, loadingMore, refreshing, session, state])

  const loadMore = useCallback(async () => {
    if (demo || state.status !== "ready" || !state.hasNextPage || loadingMore || refreshing) return
    const generation = generationRef.current
    setLoadingMore(true)
    setBackgroundError("")
    try {
      const result = await session.loadNextPage(state)
      if (generation === generationRef.current) setState(result)
    } catch (error) {
      const failure = dashboardError(error)
      if (generation === generationRef.current && failure.status === "error") {
        setBackgroundError(failure.error)
      }
    } finally {
      if (generation === generationRef.current) setLoadingMore(false)
    }
  }, [demo, loadingMore, refreshing, session, state])

  const updateItems = useCallback(
    (
      update: (
        items: Extract<InboxSessionResult, { status: "ready" }>["items"],
      ) => Extract<InboxSessionResult, { status: "ready" }>["items"],
    ) => {
      setState((current) =>
        current.status === "ready" ? { ...current, items: update(current.items) } : current,
      )
    },
    [],
  )

  useEffect(() => {
    if (active) {
      const force = loadedConfigurationRevisionRef.current !== configurationRevision
      loadedConfigurationRevisionRef.current = configurationRevision
      void load(force)
    }
    return () => {
      generationRef.current += 1
      session.cancelActiveLoad()
    }
  }, [active, configurationRevision, load, session])

  useEffect(() => {
    if (!active || state.status !== "ready") return
    const timer = setInterval(() => void refresh(), state.refreshSeconds * 1_000)
    return () => clearInterval(timer)
  }, [active, refresh, state])

  useEffect(() => {
    if (!active || !subjectItems?.length || !subjectHost) return
    const generation = generationRef.current
    let cancelled = false
    void session
      .loadSubjectStates(subjectItems, subjectHost)
      .then((states) => {
        if (cancelled || !states || generation !== generationRef.current) return
        setState((current) => {
          if (current.status !== "ready") return current
          const items = applyInboxSubjectStates(current.items, subjectItems, states)
          return items === current.items ? current : { ...current, items }
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      session.cancelSubjectLoad()
    }
  }, [active, session, subjectHost, subjectItems])

  useEffect(() => () => session.dispose(), [session])

  return { state, refresh, loadMore, loadingMore, refreshing, backgroundError, updateItems }
}
