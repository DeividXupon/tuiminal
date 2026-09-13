import { useEffect, useMemo, useState } from "react"
import type { PullRequestSummary } from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { loadPullRequestWorkflowRuns } from "../../services/github/workflows"

export function usePullRequestWorkflows(active: boolean, item: PullRequestSummary | null) {
  const demo = process.env.TUIMINAL_GIT_PR_DEMO === "1"
  const scope = useMemo(() => ({ active, item, demo }), [active, item, demo])
  const [result, setResult] = useState<{
    scope: typeof scope
    runs: PullRequestWorkflowRun[]
    error: string
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    if (!scope.active || !scope.item || scope.demo) {
      setResult(null)
      return () => controller.abort()
    }
    const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
    void loadPullRequestWorkflowRuns({
      identity: scope.item.identity,
      headSha: scope.item.headSha,
      options: { signal: controller.signal, ...(executable ? { executable } : {}) },
    })
      .then((next) => {
        if (controller.signal.aborted) return
        setResult({ scope, runs: next, error: "" })
      })
      .catch((reason) => {
        if (controller.signal.aborted) return
        setResult({
          scope,
          runs: [],
          error: reason instanceof Error ? reason.message : "Workflow query failed",
        })
      })
    return () => controller.abort()
  }, [scope])
  // Hide the previous result during render, before passive effect cleanup runs.
  return result?.scope === scope
    ? { runs: result.runs, error: result.error }
    : { runs: [], error: "" }
}
