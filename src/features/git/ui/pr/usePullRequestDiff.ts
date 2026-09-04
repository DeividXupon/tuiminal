import { useEffect, useState } from "react"
import type { PullRequestDiffSnapshot, PullRequestDiffTarget } from "../../model/pr/diff"
import { demoPullRequestDiff } from "../../model/pr/diff-fixtures"
import type { PullRequestDetails, PullRequestSummary } from "../../model/pr/types"
import { loadPullRequestDiff } from "../../services/github/diff"

export type PullRequestDiffState =
  | { status: "loading" }
  | { status: "ready"; snapshot: PullRequestDiffSnapshot }
  | { status: "error"; message: string }

export function usePullRequestDiff(
  item: PullRequestSummary,
  details: PullRequestDetails,
  target: PullRequestDiffTarget,
) {
  const [state, setState] = useState<PullRequestDiffState>({ status: "loading" })
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: "loading" })
    if (process.env.TUIMINAL_GIT_PR_DEMO === "1") {
      setState({ status: "ready", snapshot: demoPullRequestDiff(item, details, target) })
      return () => controller.abort()
    }
    const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
    void loadPullRequestDiff({
      identity: item.identity,
      target,
      baseSha: details.baseSha,
      headSha: item.headSha,
      options: { signal: controller.signal, ...(executable ? { executable } : {}) },
    })
      .then((snapshot) => setState({ status: "ready", snapshot }))
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "GitHub diff error",
        })
      })
    return () => controller.abort()
  }, [details, item, target])
  return state
}
