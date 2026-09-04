import type { PreparedPullRequestAction } from "../../model/pr/actions"
import { type GhTransportOptions, GitHubTransportError, runGhCommand } from "./transport"

export type PullRequestMutationResult =
  | { status: "confirmed"; message: string }
  | { status: "rejected"; reason: string }
  | { status: "uncertain"; reason: string }

function stringPayload(action: PreparedPullRequestAction, key: string) {
  const value = action.payload[key]
  return typeof value === "string" ? value : ""
}

function numberPayload(action: PreparedPullRequestAction, key: string) {
  const value = action.payload[key]
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0
}

function targetArgs(action: PreparedPullRequestAction) {
  return [
    String(action.target.number),
    "--repo",
    `${action.target.owner}/${action.target.repository}`,
  ]
}

function mutationRequest(action: PreparedPullRequestAction) {
  const target = targetArgs(action)
  if (action.kind === "comment") {
    return {
      args: ["pr", "comment", ...target, "--body-file", "-"],
      stdin: stringPayload(action, "body"),
    }
  }
  if (action.kind === "approve") {
    return {
      args: [
        "api",
        "--method",
        "POST",
        "--hostname",
        action.target.host,
        `repos/${action.target.owner}/${action.target.repository}/pulls/${action.target.number}/reviews`,
        "--input",
        "-",
      ],
      stdin: JSON.stringify({
        event: "APPROVE",
        commit_id: action.expectedHeadSha,
        body: stringPayload(action, "body"),
      }),
    }
  }
  if (action.kind === "assign" || action.kind === "unassign") {
    const flag = action.kind === "assign" ? "--add-assignee" : "--remove-assignee"
    return { args: ["pr", "edit", ...target, flag, stringPayload(action, "login")] }
  }
  if (action.kind === "ready") return { args: ["pr", "ready", ...target] }
  if (action.kind === "close") return { args: ["pr", "close", ...target] }
  if (action.kind === "reopen") return { args: ["pr", "reopen", ...target] }
  if (action.kind === "checkout") return { args: ["pr", "checkout", ...target] }
  if (action.kind === "update-branch") {
    return {
      args: [
        "api",
        "--method",
        "PUT",
        "--hostname",
        action.target.host,
        `repos/${action.target.owner}/${action.target.repository}/pulls/${action.target.number}/update-branch`,
        "--input",
        "-",
      ],
      stdin: JSON.stringify({ expected_head_sha: action.expectedHeadSha }),
    }
  }
  if (action.kind === "approve-workflow") {
    return {
      args: [
        "api",
        "--method",
        "POST",
        "--hostname",
        action.target.host,
        `repos/${action.target.owner}/${action.target.repository}/actions/runs/${numberPayload(action, "runId")}/approve`,
      ],
    }
  }
  const method = stringPayload(action, "method")
  const methodFlag = method === "rebase" ? "--rebase" : method === "merge" ? "--merge" : "--squash"
  return {
    args: [
      "pr",
      "merge",
      ...target,
      ...(action.payload.mergeQueue === true ? [] : [methodFlag]),
      "--match-head-commit",
      action.expectedHeadSha,
    ],
  }
}

function validateMutationPayload(action: PreparedPullRequestAction) {
  if (action.kind === "comment" && !stringPayload(action, "body").trim()) {
    return "empty-body"
  }
  if (["assign", "unassign"].includes(action.kind) && !stringPayload(action, "login").trim()) {
    return "empty-login"
  }
  if (action.kind === "checkout" && !stringPayload(action, "clonePath")) return "clone-required"
  if (action.kind === "approve-workflow" && !numberPayload(action, "runId")) return "run-required"
  return null
}

export async function executePullRequestMutation(
  action: PreparedPullRequestAction,
  options: GhTransportOptions = {},
): Promise<PullRequestMutationResult> {
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
      reason: error instanceof Error ? error.message : "GitHub mutation failed",
    }
  }
}
