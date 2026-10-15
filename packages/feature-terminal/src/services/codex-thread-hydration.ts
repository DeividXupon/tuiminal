import type { CodexHydratedThread } from "../model/remote-codex"

type RecordValue = Record<string, unknown>

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

export function hydratedCodexThread(
  thread: RecordValue,
  initialTurns: unknown,
): CodexHydratedThread {
  const status = object(thread.status)
  const waitingOnApproval = Boolean(
    status?.type === "active" &&
      Array.isArray(status.activeFlags) &&
      status.activeFlags.includes("waitingOnApproval"),
  )
  const turns = [
    ...(Array.isArray(thread.turns) ? thread.turns : []),
    ...(Array.isArray(initialTurns) ? initialTurns : []),
  ]
    .map(object)
    .filter((turn) => turn !== null)
  const latest = turns.reduce<RecordValue | null>((selected, turn) => {
    if (!selected) return turn
    const selectedAt = Number(selected.completedAt ?? selected.startedAt ?? 0)
    const turnAt = Number(turn.completedAt ?? turn.startedAt ?? 0)
    return turnAt >= selectedAt ? turn : selected
  }, null)
  const raw = latest?.status
  const latestTurnStatus = ["inProgress", "completed", "failed", "interrupted"].includes(
    String(raw),
  )
    ? (raw as NonNullable<CodexHydratedThread["latestTurnStatus"]>)
    : raw === undefined
      ? null
      : "unknown"
  const state =
    status?.type === "active"
      ? waitingOnApproval
        ? "blocked"
        : "working"
      : latestTurnStatus === "completed"
        ? "done"
        : latestTurnStatus === "inProgress"
          ? "working"
          : latestTurnStatus === null
            ? "idle"
            : "unknown"
  return { threadId: String(thread.id), state, latestTurnStatus, waitingOnApproval }
}
