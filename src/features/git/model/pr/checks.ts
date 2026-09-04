import type { PullRequestCheck } from "./types"

export type PullRequestCheckSummary = {
  state: "none" | "pending" | "success" | "failure" | "unknown"
  terminal: boolean
  signature: string
  success: number
  failure: number
  pending: number
  cancelled: number
  skipped: number
  unknown: number
}

export function summarizePullRequestChecks(
  checks: readonly PullRequestCheck[],
): PullRequestCheckSummary {
  const count = (state: PullRequestCheck["state"]) =>
    checks.filter((check) => check.state === state).length
  const summary = {
    success: count("success"),
    failure: count("failure"),
    pending: count("pending"),
    cancelled: count("cancelled"),
    skipped: count("skipped"),
    unknown: count("unknown"),
  }
  const terminal = checks.length > 0 && summary.pending === 0 && summary.unknown === 0
  const state = !checks.length
    ? "none"
    : !terminal
      ? "pending"
      : summary.failure || summary.cancelled
        ? "failure"
        : "success"
  return {
    ...summary,
    state,
    terminal,
    signature: checks
      .map((check) => `${check.id}:${check.attempt ?? 1}:${check.state}`)
      .sort()
      .join("|"),
  }
}

export function pullRequestCheckTransitionShouldNotify(
  previous: PullRequestCheckSummary | null,
  current: PullRequestCheckSummary,
) {
  return Boolean(
    previous && !previous.terminal && current.terminal && previous.signature !== current.signature,
  )
}
