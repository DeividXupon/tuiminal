import type { IssueAuthContext, IssueDetails, IssueIdentity, IssueSummary } from "./types"

export type IssueActionKind =
  | "assign"
  | "unassign"
  | "comment"
  | "labels"
  | "checkout"
  | "close"
  | "reopen"

export type PreparedIssueAction = {
  actionId: string
  kind: IssueActionKind
  target: IssueIdentity
  expectedUpdatedAt: string
  expectedState: IssueSummary["state"]
  authGeneration: number
  authViewerId: string
  authHost: string
  payload: Readonly<Record<string, unknown>>
}

export type IssueActionAvailability = { enabled: boolean; reason: string | null }

export type IssueActionState =
  | { status: "prepared"; action: PreparedIssueAction }
  | { status: "executing"; action: PreparedIssueAction }
  | { status: "confirmed"; action: PreparedIssueAction; message: string }
  | { status: "rejected"; action: PreparedIssueAction; reason: string }
  | { status: "uncertain"; action: PreparedIssueAction; reason: string }

export function issueActionKindForShortcut(key: { name: string; shift?: boolean }) {
  const name = key.name.toLowerCase()
  if (name === "a") return key.shift ? "unassign" : "assign"
  if (name === "c") return key.shift ? "checkout" : "comment"
  if (name === "l" && key.shift) return "labels"
  if (name === "x") return key.shift ? "reopen" : "close"
  return null
}

export function prepareIssueAction({
  actionId,
  kind,
  target,
  expectedUpdatedAt,
  expectedState,
  auth,
  payload = {},
}: {
  actionId: string
  kind: IssueActionKind
  target: IssueIdentity
  expectedUpdatedAt: string
  expectedState: IssueSummary["state"]
  auth: IssueAuthContext
  payload?: Readonly<Record<string, unknown>>
}): IssueActionState {
  return {
    status: "prepared",
    action: {
      actionId,
      kind,
      target,
      expectedUpdatedAt,
      expectedState,
      authGeneration: auth.generation,
      authViewerId: auth.viewerId,
      authHost: auth.host,
      payload,
    },
  }
}

export function issueActionAvailability({
  kind,
  summary,
  details,
  hasCheckout,
}: {
  kind: IssueActionKind
  summary: IssueSummary
  details: IssueDetails
  hasCheckout: boolean
}): IssueActionAvailability {
  if (["assign", "unassign", "labels"].includes(kind) && !details.metadataComplete) {
    return { enabled: false, reason: "details-partial" }
  }
  if (kind === "close" && (!details.permissions.canClose || summary.state !== "open")) {
    return { enabled: false, reason: "cannot-close-issue" }
  }
  if (kind === "reopen" && (!details.permissions.canReopen || summary.state !== "closed")) {
    return { enabled: false, reason: "cannot-reopen-issue" }
  }
  if (["assign", "unassign", "labels"].includes(kind) && !details.permissions.canUpdate) {
    return { enabled: false, reason: "cannot-update-issue" }
  }
  if (kind === "unassign" && details.assignees.length === 0) {
    return { enabled: false, reason: "issue-has-no-assignees" }
  }
  if (kind === "checkout" && !hasCheckout) {
    return { enabled: true, reason: "clone-path-required" }
  }
  return { enabled: true, reason: null }
}

export function beginIssueAction(
  state: IssueActionState,
  auth: IssueAuthContext,
  details: IssueDetails,
): IssueActionState {
  if (state.status !== "prepared") return state
  const action = state.action
  if (
    auth.generation !== action.authGeneration ||
    auth.viewerId !== action.authViewerId ||
    auth.host !== action.authHost
  ) {
    return { status: "rejected", action, reason: "auth-context-changed" }
  }
  if (details.updatedAt !== action.expectedUpdatedAt || details.state !== action.expectedState) {
    return { status: "rejected", action, reason: "issue-changed" }
  }
  return { status: "executing", action }
}

function stringArrayPayload(action: PreparedIssueAction, key: string) {
  const value = action.payload[key]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : []
}

export function issueMutationWasReconciled({
  action,
  before,
  after,
  viewerLogin,
}: {
  action: PreparedIssueAction
  before: IssueDetails
  after: IssueDetails
  viewerLogin: string
}) {
  if (action.kind === "close") return after.state === "closed"
  if (action.kind === "reopen") return after.state === "open"
  if (action.kind === "assign" || action.kind === "unassign") {
    const requested = stringArrayPayload(action, "logins").map((login) => login.toLowerCase())
    const assigned = new Set(after.assignees.map((actor) => actor.login.toLowerCase()))
    return action.kind === "assign"
      ? requested.every((login) => assigned.has(login))
      : requested.every((login) => !assigned.has(login))
  }
  if (action.kind === "labels") {
    const expected = stringArrayPayload(action, "labels")
      .map((label) => label.toLowerCase())
      .sort()
    const actual = after.labels.map((label) => label.name.toLowerCase()).sort()
    return (
      expected.length === actual.length && expected.every((label, index) => label === actual[index])
    )
  }
  if (action.kind === "comment") {
    const body = typeof action.payload.body === "string" ? action.payload.body.trim() : ""
    return after.comments.some(
      (comment) => comment.author.login === viewerLogin && comment.body.trim() === body,
    )
  }
  if (action.kind === "checkout") return before.identity.nodeId === after.identity.nodeId
  return false
}
