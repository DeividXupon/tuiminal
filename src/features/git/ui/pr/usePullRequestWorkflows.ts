import { useEffect, useState } from "react"
import type { PullRequestSummary } from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { loadPullRequestWorkflowRuns } from "../../services/github/workflows"

export function usePullRequestWorkflows(active: boolean, item: PullRequestSummary | null) {
  const [runs, setRuns] = useState<PullRequestWorkflowRun[]>([])
  const [error, setError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    if (!active || !item || process.env.TUIMINAL_GIT_PR_DEMO === "1") {
      setRuns([])
      setError("")
      return () => controller.abort()
    }
    const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
    void loadPullRequestWorkflowRuns({
      identity: item.identity,
      headSha: item.headSha,
      options: { signal: controller.signal, ...(executable ? { executable } : {}) },
    })
      .then((next) => {
        setRuns(next)
        setError("")
      })
      .catch((reason) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : "Workflow query failed")
      })
    return () => controller.abort()
  }, [active, item])
  return { runs, error }
}
