import {
  beginIssueAction,
  type IssueActionState,
  issueMutationWasReconciled,
} from "../model/issue/actions"
import { issueIdentityKey } from "../model/issue/query"
import { loadGhAuthContext } from "./github/auth"
import { loadIssueDetails } from "./github/issue-details"
import { executeIssueMutation } from "./github/issue-mutations"
import { executeGitHubReactionWrite } from "./github/reaction-state"
import type { GhTransportOptions } from "./github/transport"

export class IssueActionCoordinator {
  private readonly busy = new Set<string>()

  constructor(private readonly transport: GhTransportOptions = {}) {}

  async execute(prepared: IssueActionState): Promise<IssueActionState> {
    if (prepared.status !== "prepared") return prepared
    const key = issueIdentityKey(prepared.action.target)
    if (this.busy.has(key)) {
      return { status: "rejected", action: prepared.action, reason: "action-in-progress" }
    }
    this.busy.add(key)
    try {
      return await this.executeOnce(prepared)
    } finally {
      this.busy.delete(key)
    }
  }

  private async executeOnce(prepared: IssueActionState): Promise<IssueActionState> {
    if (prepared.status !== "prepared") return prepared
    const action = prepared.action
    const currentAuth = await loadGhAuthContext({
      host: action.target.host,
      generation: action.authGeneration,
      options: this.transport,
    })
    if (currentAuth.viewerId !== action.authViewerId) currentAuth.generation += 1
    const before = await loadIssueDetails({ identity: action.target, options: this.transport })
    if (!before) return { status: "rejected", action, reason: "issue-not-found" }
    const executing = beginIssueAction(prepared, currentAuth, before)
    if (executing.status !== "executing") return executing
    if (action.kind === "reaction") {
      return executeIssueReaction(action, this.transport)
    }
    const result = await executeIssueMutation(action, this.transport)
    if (result.status !== "confirmed" || action.kind === "checkout") {
      return { ...result, action }
    }
    try {
      const after = await loadIssueDetails({ identity: action.target, options: this.transport })
      const confirmed =
        after &&
        issueMutationWasReconciled({
          action,
          before,
          after,
          viewerLogin: currentAuth.viewerLogin,
        })
      return confirmed
        ? { status: "confirmed", action, message: `${action.kind}-reconciled` }
        : { status: "uncertain", action, reason: "accepted-awaiting-reconciliation" }
    } catch {
      return { status: "uncertain", action, reason: "accepted-reconciliation-failed" }
    }
  }
}

async function executeIssueReaction(
  action: Extract<IssueActionState, { status: "prepared" }>["action"],
  transport: GhTransportOptions,
): Promise<IssueActionState> {
  const subjectId = typeof action.payload.subjectId === "string" ? action.payload.subjectId : ""
  const onItem = action.payload.subjectKind === "item"
  const result = await executeGitHubReactionWrite({
    host: action.target.host,
    subjectId,
    expectedType: onItem ? "Issue" : "IssueComment",
    expectedUrl:
      onItem || typeof action.payload.commentUrl !== "string"
        ? action.target.url
        : action.payload.commentUrl,
    content: action.payload.reaction,
    write: () => executeIssueMutation(action, transport),
    options: transport,
  })
  return { ...result, action }
}
