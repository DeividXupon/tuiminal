import type { PullRequestIdentity } from "../../model/pr/types"
import { type GhTransportOptions, runGhCommand } from "./transport"

export function openPullRequestInBrowser(
  identity: PullRequestIdentity,
  options: GhTransportOptions = {},
) {
  return runGhCommand(
    {
      args: [
        "pr",
        "view",
        String(identity.number),
        "--repo",
        `${identity.owner}/${identity.repository}`,
        "--web",
      ],
    },
    { ...options, host: identity.host },
  )
}

export function openWorkflowRunInBrowser(
  identity: PullRequestIdentity,
  runId: number,
  options: GhTransportOptions = {},
) {
  if (!Number.isSafeInteger(runId) || runId <= 0) throw new Error("Invalid workflow run id")
  return runGhCommand(
    {
      args: [
        "run",
        "view",
        String(runId),
        "--repo",
        `${identity.owner}/${identity.repository}`,
        "--web",
      ],
    },
    { ...options, host: identity.host },
  )
}
