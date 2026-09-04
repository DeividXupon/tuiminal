import type { PullRequestActor, PullRequestIdentity } from "./types"

export type PullRequestWorkflowRun = {
  id: number
  name: string
  status: string
  conclusion: string
  headSha: string
  headRepository: string
  actor: PullRequestActor
  event: string
  url: string
  attempt: number
  eligibleForApproval: boolean
  deploymentProtection: boolean
}

export type PullRequestWorkflowApprovalTarget = {
  identity: PullRequestIdentity
  run: PullRequestWorkflowRun
}
