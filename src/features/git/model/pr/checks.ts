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
  const summary = {
    success: 0,
    failure: 0,
    pending: 0,
    cancelled: 0,
    skipped: 0,
    unknown: 0,
  }
  const signatures: string[] = []
  for (const check of checks) {
    const state = check.state
    if (state !== "none") summary[state] += 1
    signatures.push(`${check.id}:${check.attempt ?? 1}:${state}`)
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
    signature: signatures.sort().join("|"),
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
