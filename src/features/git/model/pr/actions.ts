import type {
  PullRequestAuthContext,
  PullRequestDetails,
  PullRequestIdentity,
  PullRequestSummary,
} from "./types"

export type PullRequestActionKind =
  | "assign"
  | "unassign"
  | "comment"
  | "approve"
  | "ready"
  | "close"
  | "reopen"
  | "checkout"
  | "update-branch"
  | "merge"
  | "approve-workflow"

export type PreparedPullRequestAction = {
  actionId: string
  kind: PullRequestActionKind
  target: PullRequestIdentity
  expectedHeadSha: string
  authGeneration: number
  authViewerId: string
  authHost: string
  payload: Readonly<Record<string, unknown>>
}

export type PullRequestActionAvailability = {
  enabled: boolean
  reason: string | null
}

export type PullRequestActionState =
  | { status: "prepared"; action: PreparedPullRequestAction }
  | { status: "executing"; action: PreparedPullRequestAction }
  | { status: "confirmed"; action: PreparedPullRequestAction; message: string }
  | { status: "rejected"; action: PreparedPullRequestAction; reason: string }
  | { status: "uncertain"; action: PreparedPullRequestAction; reason: string }

export type PullRequestActionEvent =
  | { type: "execute"; auth: PullRequestAuthContext; currentHeadSha: string }
  | { type: "confirm"; message: string }
  | { type: "reject"; reason: string }
  | { type: "uncertain"; reason: string }

export function preparePullRequestAction({
  actionId,
  kind,
  target,
  expectedHeadSha,
  auth,
  payload = {},
}: {
  actionId: string
  kind: PullRequestActionKind
  target: PullRequestIdentity
  expectedHeadSha: string
  auth: PullRequestAuthContext
  payload?: Readonly<Record<string, unknown>>
}): PullRequestActionState {
  return {
    status: "prepared",
    action: {
      actionId,
      kind,
      target,
      expectedHeadSha,
      authGeneration: auth.generation,
      authViewerId: auth.viewerId,
      authHost: auth.host,
      payload,
    },
  }
}

function unavailable(reason: string): PullRequestActionAvailability {
  return { enabled: false, reason }
}

function stateActionAvailability(
  kind: PullRequestActionKind,
  summary: PullRequestSummary,
  details: PullRequestDetails,
) {
  if (kind === "ready" && (!details.permissions.canMarkReady || summary.state !== "draft")) {
    return unavailable("not-a-reviewable-draft")
  }
  if (kind === "close" && (!details.permissions.canClose || summary.state === "closed")) {
    return unavailable("cannot-close")
  }
  if (kind === "reopen" && (!details.permissions.canReopen || summary.state !== "closed")) {
    return unavailable("cannot-reopen")
  }
  return null
}

function integrationActionAvailability(
  kind: PullRequestActionKind,
  details: PullRequestDetails,
  hasCheckout: boolean,
  workflowCount: number,
) {
  if (kind === "update-branch" && !details.permissions.canUpdateBranch) {
    return unavailable("cannot-update-branch")
  }
  if (kind === "merge" && !details.permissions.canMerge) return unavailable("cannot-merge")
  if (kind === "merge" && !details.permissions.mergeMethods.length) {
    return unavailable("no-merge-method-enabled")
  }
  if (kind === "merge" && details.mergeable !== "mergeable") {
    return unavailable(details.mergeable === "conflicting" ? "merge-conflict" : "merge-unknown")
  }
  if (kind === "checkout" && !hasCheckout) return { enabled: true, reason: "clone-path-required" }
  if (kind === "approve-workflow" && workflowCount === 0) {
    return unavailable("no-workflow-awaiting-approval")
  }
  return null
}

export function pullRequestActionAvailability({
  kind,
  summary,
  details,
  viewerLogin,
  hasCheckout,
  workflowCount,
}: {
  kind: PullRequestActionKind
  summary: PullRequestSummary
  details: PullRequestDetails
  viewerLogin: string
  hasCheckout: boolean
  workflowCount: number
}): PullRequestActionAvailability {
  if (details.partial && ["approve", "merge", "update-branch"].includes(kind)) {
    return unavailable("details-partial")
  }
  if (kind === "approve" && summary.author.login === viewerLogin) {
    return unavailable("cannot-approve-own-pr")
  }
  const stateAvailability = stateActionAvailability(kind, summary, details)
  if (stateAvailability) return stateAvailability
  const integrationAvailability = integrationActionAvailability(
    kind,
    details,
    hasCheckout,
    workflowCount,
  )
  if (integrationAvailability) return integrationAvailability
  return { enabled: true, reason: null }
}

export function transitionPullRequestAction(
  state: PullRequestActionState,
  event: PullRequestActionEvent,
): PullRequestActionState {
  if (state.status !== "prepared" && state.status !== "executing") return state
  if (event.type === "execute") {
    if (state.status !== "prepared") return state
    if (
      event.auth.generation !== state.action.authGeneration ||
      event.auth.viewerId !== state.action.authViewerId ||
      event.auth.host !== state.action.authHost
    ) {
      return { status: "rejected", action: state.action, reason: "auth-context-changed" }
    }
    if (event.currentHeadSha !== state.action.expectedHeadSha) {
      return { status: "rejected", action: state.action, reason: "head-changed" }
    }
    return { status: "executing", action: state.action }
  }
  if (state.status !== "executing") return state
  if (event.type === "confirm") {
    return { status: "confirmed", action: state.action, message: event.message }
  }
  if (event.type === "reject") {
    return { status: "rejected", action: state.action, reason: event.reason }
  }
  return { status: "uncertain", action: state.action, reason: event.reason }
}

function matchesReview(
  details: PullRequestDetails,
  action: PreparedPullRequestAction,
  viewerLogin: string,
) {
  const body = typeof action.payload.body === "string" ? action.payload.body.trim() : ""
  return details.reviews.some(
    (review) =>
      review.author.login === viewerLogin &&
      review.state === "approved" &&
      review.commitSha === action.expectedHeadSha &&
      (!body || review.body.trim() === body),
  )
}

/**
 * Confirms observable remote effects after a write. A false result must never
 * trigger the mutation again: search indexes and asynchronous GitHub jobs can lag.
 */
export function pullRequestMutationWasReconciled({
  action,
  before,
  after,
  viewerLogin,
}: {
  action: PreparedPullRequestAction
  before: PullRequestDetails
  after: PullRequestDetails
  viewerLogin: string
}) {
  const login = typeof action.payload.login === "string" ? action.payload.login.trim() : ""
  if (action.kind === "assign") return after.assignees.some((actor) => actor.login === login)
  if (action.kind === "unassign") return !after.assignees.some((actor) => actor.login === login)
  if (action.kind === "comment") {
    const body = typeof action.payload.body === "string" ? action.payload.body.trim() : ""
    return after.comments.some(
      (comment) => comment.author.login === viewerLogin && comment.body.trim() === body,
    )
  }
  if (action.kind === "approve") return matchesReview(after, action, viewerLogin)
  if (action.kind === "ready") return !after.isDraft && after.remoteState === "open"
  if (action.kind === "close") return after.remoteState === "closed"
  if (action.kind === "reopen") return after.remoteState === "open"
  if (action.kind === "merge") {
    return (
      after.remoteState === "merged" ||
      Boolean(after.mergedAt) ||
      Boolean(after.mergeQueueEntry) ||
      Boolean(after.autoMergeRequest)
    )
  }
  if (action.kind === "update-branch") return after.headSha !== before.headSha
  return action.kind === "checkout" || action.kind === "approve-workflow"
}
