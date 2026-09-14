import { sanitizeGitHubText } from "../../model/pr/content"
import type { PullRequestIdentity } from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { type GhTransportOptions, runGhJson } from "./transport"

type WorkflowRunsResponse = { workflow_runs?: unknown[] }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown) {
  return typeof value === "string" ? sanitizeGitHubText(value) : ""
}

function normalizeRun(value: unknown, expectedHeadSha: string): PullRequestWorkflowRun | null {
  const run = record(value)
  if (!run || typeof run.id !== "number") return null
  const status = text(run.status)
  const conclusion = text(run.conclusion)
  const head = record(run.head_repository)
  const base = record(run.repository)
  const headRepository = `${text(record(head?.owner)?.login)}/${text(head?.name)}`
  const baseRepository = `${text(record(base?.owner)?.login)}/${text(base?.name)}`
  return {
    id: run.id,
    name: text(run.name) || `run-${run.id}`,
    status,
    conclusion,
    headSha: text(run.head_sha),
    headRepository,
    actor: { login: text(record(run.actor)?.login) || "ghost" },
    event: text(run.event),
    url: text(run.html_url),
    attempt: typeof run.run_attempt === "number" ? run.run_attempt : 1,
    eligibleForApproval:
      text(run.head_sha) === expectedHeadSha &&
      (status === "action_required" || conclusion === "action_required") &&
      headRepository.toLowerCase() !== baseRepository.toLowerCase(),
    deploymentProtection: status === "waiting" && conclusion !== "action_required",
  }
}

export async function loadPullRequestWorkflowRuns({
  identity,
  headSha,
  options = {},
}: {
  identity: PullRequestIdentity
  headSha: string
  options?: GhTransportOptions
}) {
  const response = await runGhJson<WorkflowRunsResponse>(
    {
      args: [
        "api",
        "--hostname",
        identity.host,
        `repos/${identity.owner}/${identity.repository}/actions/runs?event=pull_request&head_sha=${encodeURIComponent(headSha)}&per_page=100`,
      ],
    },
    { ...options, host: identity.host },
  )
  return (response.workflow_runs ?? []).flatMap((value) => {
    const run = normalizeRun(value, headSha)
    return run ? [run] : []
  })
}
