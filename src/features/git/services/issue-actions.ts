import {
  beginIssueAction,
  type IssueActionState,
  issueMutationWasReconciled,
} from "../model/issue/actions"
import { issueIdentityKey } from "../model/issue/query"
import { loadGhAuthContext } from "./github/auth"
import { loadIssueDetails } from "./github/issue-details"
import { executeIssueMutation } from "./github/issue-mutations"
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
      const result = await executeIssueMutation(action, this.transport)
      if (result.status === "uncertain") {
        return { status: "uncertain", action, reason: result.reason }
      }
      if (result.status === "rejected") return { status: "rejected", action, reason: result.reason }
      if (action.kind === "checkout") {
        return { status: "confirmed", action, message: result.message }
      }
      try {
        const after = await loadIssueDetails({ identity: action.target, options: this.transport })
        if (
          after &&
          issueMutationWasReconciled({
            action,
            before,
            after,
            viewerLogin: currentAuth.viewerLogin,
          })
        ) {
          return { status: "confirmed", action, message: `${action.kind}-reconciled` }
        }
        return { status: "uncertain", action, reason: "accepted-awaiting-reconciliation" }
      } catch {
        return { status: "uncertain", action, reason: "accepted-reconciliation-failed" }
      }
    } finally {
      this.busy.delete(key)
    }
  }
}
