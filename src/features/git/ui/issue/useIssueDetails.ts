import { useEffect, useRef, useState } from "react"
import { demoIssueDetails } from "../../model/issue/fixtures"
import type { IssueDetails, IssueSummary } from "../../model/issue/types"
import { GitHubTransportError } from "../../services/github/transport"
import { IssueDetailsSession } from "../../services/issue-details-session"

export type IssueDetailsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; details: IssueDetails; fromCache: boolean }
  | { status: "error"; kind: string; message: string }

function detailError(error: unknown): IssueDetailsState {
  if (error instanceof GitHubTransportError) {
    return { status: "error", kind: error.kind, message: error.message }
  }
  return {
    status: "error",
    kind: "unknown",
    message: error instanceof Error ? error.message : "Unknown GitHub error",
  }
}

export function useIssueDetails(active: boolean, item: IssueSummary | null) {
  const demo = process.env.TUIMINAL_GIT_ISSUES_DEMO === "1"
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  const [session] = useState(() => new IssueDetailsSession(executable ? { executable } : {}))
  const [state, setState] = useState<IssueDetailsState>({ status: "idle" })
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
      setState({ status: "ready", details: demoIssueDetails(item), fromCache: true })
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

  const loadMore = async () => {
    if (!item || state.status !== "ready" || loadingMore || demo) return
    const generation = generationRef.current
    setLoadingMore(true)
    try {
      const details = await session.loadMore(item, state.details)
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
