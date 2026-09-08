import type { PreparedIssueAction } from "../../model/issue/actions"
import { type GhTransportOptions, GitHubTransportError, runGhCommand } from "./transport"

export type IssueMutationResult =
  | { status: "confirmed"; message: string }
  | { status: "rejected"; reason: string }
  | { status: "uncertain"; reason: string }

function stringPayload(action: PreparedIssueAction, key: string) {
  const value = action.payload[key]
  return typeof value === "string" ? value : ""
}

function stringArrayPayload(action: PreparedIssueAction, key: string) {
  const value = action.payload[key]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : []
}

function targetArgs(action: PreparedIssueAction) {
  return [
    String(action.target.number),
    "--repo",
    `${action.target.owner}/${action.target.repository}`,
  ]
}

function mutationRequest(action: PreparedIssueAction) {
  const target = targetArgs(action)
  if (action.kind === "comment") {
    return {
      args: ["issue", "comment", ...target, "--body-file", "-"],
      stdin: stringPayload(action, "body"),
    }
  }
  if (action.kind === "assign" || action.kind === "unassign") {
    const flag = action.kind === "assign" ? "--add-assignee" : "--remove-assignee"
    return {
      args: ["issue", "edit", ...target, flag, stringArrayPayload(action, "logins").join(",")],
    }
  }
  if (action.kind === "labels") {
    const additions = stringArrayPayload(action, "addLabels")
    const removals = stringArrayPayload(action, "removeLabels")
    return {
      args: [
        "issue",
        "edit",
        ...target,
        ...(additions.length ? ["--add-label", additions.join(",")] : []),
        ...(removals.length ? ["--remove-label", removals.join(",")] : []),
      ],
    }
  }
  if (action.kind === "checkout") {
    return { args: ["issue", "develop", ...target, "--checkout"] }
  }
  if (action.kind === "close") return { args: ["issue", "close", ...target] }
  return { args: ["issue", "reopen", ...target] }
}

function validateMutationPayload(action: PreparedIssueAction) {
  if (action.kind === "comment" && !stringPayload(action, "body").trim()) return "empty-body"
  if (
    ["assign", "unassign"].includes(action.kind) &&
    !stringArrayPayload(action, "logins").length
  ) {
    return "empty-login"
  }
  if (action.kind === "checkout" && !stringPayload(action, "clonePath")) return "clone-required"
  if (
    action.kind === "labels" &&
    !stringArrayPayload(action, "addLabels").length &&
    !stringArrayPayload(action, "removeLabels").length
  ) {
    return "no-label-changes"
  }
  return null
}

export async function executeIssueMutation(
  action: PreparedIssueAction,
  options: GhTransportOptions = {},
): Promise<IssueMutationResult> {
  const invalid = validateMutationPayload(action)
  if (invalid) return { status: "rejected", reason: invalid }
  try {
    await runGhCommand(mutationRequest(action), {
      ...options,
      host: action.target.host,
      ...(action.kind === "checkout" ? { cwd: stringPayload(action, "clonePath") } : {}),
    })
    return { status: "confirmed", message: `${action.kind}-accepted` }
  } catch (error) {
    if (
      error instanceof GitHubTransportError &&
      (error.kind === "timeout" || error.kind === "cancelled")
    ) {
      return { status: "uncertain", reason: error.kind }
    }
    return {
      status: "rejected",
      reason: error instanceof Error ? error.message : "GitHub issue mutation failed",
    }
  }
}
