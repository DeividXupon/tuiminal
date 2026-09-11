import { useEffect, useRef, useState } from "react"
import { demoPullRequestDetails } from "../../model/pr/detail-fixtures"
import type {
  PullRequestDetails,
  PullRequestPreviewTab,
  PullRequestSummary,
} from "../../model/pr/types"
import { GitHubTransportError } from "../../services/github/transport"
import { PullRequestDetailsSession } from "../../services/pr-details-session"

export type PullRequestDetailsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; details: PullRequestDetails; fromCache: boolean }
  | { status: "error"; kind: string; message: string }

function detailError(error: unknown): PullRequestDetailsState {
  if (error instanceof GitHubTransportError) {
    return { status: "error", kind: error.kind, message: error.message }
  }
  return {
    status: "error",
    kind: "unknown",
    message: error instanceof Error ? error.message : "Unknown GitHub error",
  }
}

export function usePullRequestDetails(active: boolean, item: PullRequestSummary | null) {
  const demo = process.env.TUIMINAL_GIT_PR_DEMO === "1"
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  const [session] = useState(() => new PullRequestDetailsSession(executable ? { executable } : {}))
  const [state, setState] = useState<PullRequestDetailsState>({ status: "idle" })
  const [loadingMore, setLoadingMore] = useState(false)
  const generationRef = useRef(0)
  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    session.cancel()
    if (!active || !item) {
      setState({ status: "idle" })
      return
    }
    if (demo) {
      setState({ status: "ready", details: demoPullRequestDetails(item), fromCache: true })
      return
    }
    setState({ status: "loading" })
    const timeout = setTimeout(() => {
      void session
        .load(item)
        .then((result) => {
          if (generation !== generationRef.current) return
          setState(
            result.details
              ? { status: "ready", details: result.details, fromCache: result.fromCache }
              : { status: "not-found" },
          )
        })
        .catch((error) => {
          if (generation === generationRef.current) setState(detailError(error))
        })
    }, 150)
    return () => clearTimeout(timeout)
  }, [active, demo, item, session])

  useEffect(() => () => session.dispose(), [session])

  const loadMore = async (tab: PullRequestPreviewTab) => {
    if (!item || state.status !== "ready" || loadingMore || demo) return
    const generation = generationRef.current
    setLoadingMore(true)
    try {
      const details = await session.loadMore(item, state.details, tab)
      if (generation === generationRef.current) {
        setState({ status: "ready", details, fromCache: false })
      }
    } catch (error) {
      if (generation === generationRef.current) setState(detailError(error))
    } finally {
      if (generation === generationRef.current) setLoadingMore(false)
    }
  }

  const reload = async () => {
    if (!item || !active || demo) return
    const generation = generationRef.current
    try {
      const result = await session.refresh(item)
      if (generation !== generationRef.current) return
      setState(
        result.details
          ? { status: "ready", details: result.details, fromCache: false }
          : { status: "not-found" },
      )
    } catch (error) {
      if (generation === generationRef.current) setState(detailError(error))
    }
  }

  return { state, loadMore, loadingMore, reload }
}
