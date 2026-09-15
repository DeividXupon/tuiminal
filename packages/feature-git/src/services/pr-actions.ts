import {
  type PreparedPullRequestAction,
  type PullRequestActionState,
  pullRequestMutationWasReconciled,
  transitionPullRequestAction,
} from "../model/pr/actions"
import { pullRequestIdentityKey } from "../model/pr/query"
import { loadGhAuthContext } from "./github/auth"
import { loadPullRequestDetails } from "./github/details"
import { executePullRequestMutation } from "./github/mutations"
import { executeGitHubReactionWrite } from "./github/reaction-state"
import type { GhTransportOptions } from "./github/transport"

export class PullRequestActionCoordinator {
  private readonly busy = new Set<string>()

  constructor(private readonly transport: GhTransportOptions = {}) {}

  async execute(prepared: PullRequestActionState): Promise<PullRequestActionState> {
    if (prepared.status !== "prepared") return prepared
    const key = pullRequestIdentityKey(prepared.action.target)
    if (this.busy.has(key)) {
      return { status: "rejected", action: prepared.action, reason: "action-in-progress" }
    }
    this.busy.add(key)
    try {
      return await this.executeOnce(prepared.action, prepared)
    } finally {
      this.busy.delete(key)
    }
  }

  private async executeOnce(
    action: PreparedPullRequestAction,
    prepared: PullRequestActionState,
  ): Promise<PullRequestActionState> {
    const currentAuth = await loadGhAuthContext({
      host: action.target.host,
      generation: action.authGeneration,
      options: this.transport,
    })
    if (currentAuth.viewerId !== action.authViewerId) currentAuth.generation += 1
    const currentDetails = await loadPullRequestDetails({
      identity: action.target,
      options: this.transport,
    })
    if (!currentDetails) {
      return { status: "rejected", action, reason: "pull-request-not-found" }
    }
    const executing = transitionPullRequestAction(prepared, {
      type: "execute",
      auth: currentAuth,
      currentHeadSha: currentDetails.headSha,
    })
    if (executing.status !== "executing") return executing
    if (action.kind === "reaction") {
      return executePullRequestReaction(action, executing, this.transport)
    }
    const result = await executePullRequestMutation(action, this.transport)
    if (result.status === "confirmed") {
      if (action.kind === "checkout" || action.kind === "approve-workflow") {
        return transitionPullRequestAction(executing, { type: "confirm", message: result.message })
      }
      try {
        const reconciled = await loadPullRequestDetails({
          identity: action.target,
          options: this.transport,
        })
        if (
          reconciled &&
          pullRequestMutationWasReconciled({
            action,
            before: currentDetails,
            after: reconciled,
            viewerLogin: currentAuth.viewerLogin,
          })
        ) {
          return transitionPullRequestAction(executing, {
            type: "confirm",
            message: `${action.kind}-reconciled`,
          })
        }
        return transitionPullRequestAction(executing, {
          type: "uncertain",
          reason: "accepted-awaiting-reconciliation",
        })
      } catch {
        return transitionPullRequestAction(executing, {
          type: "uncertain",
          reason: "accepted-reconciliation-failed",
        })
      }
    }
    if (result.status === "uncertain") {
      return transitionPullRequestAction(executing, { type: "uncertain", reason: result.reason })
    }
    return transitionPullRequestAction(executing, { type: "reject", reason: result.reason })
  }
}

async function executePullRequestReaction(
  action: PreparedPullRequestAction,
  executing: PullRequestActionState,
  transport: GhTransportOptions,
): Promise<PullRequestActionState> {
  const subjectId = typeof action.payload.subjectId === "string" ? action.payload.subjectId : ""
  const onItem = action.payload.subjectKind === "item"
  const result = await executeGitHubReactionWrite({
    host: action.target.host,
    subjectId,
    expectedType: onItem ? "PullRequest" : "IssueComment",
    expectedUrl:
      onItem || typeof action.payload.commentUrl !== "string"
        ? action.target.url
        : action.payload.commentUrl,
    content: action.payload.reaction,
    write: () => executePullRequestMutation(action, transport),
    options: transport,
  })
  if (result.status === "confirmed") {
    return transitionPullRequestAction(executing, { type: "confirm", message: result.message })
  }
  return transitionPullRequestAction(executing, {
    type: result.status === "uncertain" ? "uncertain" : "reject",
    reason: result.reason,
  })
}
