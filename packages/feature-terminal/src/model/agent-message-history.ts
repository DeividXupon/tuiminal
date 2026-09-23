export type AgentMessageTurnStatus =
  | "queued"
  | "inProgress"
  | "completed"
  | "interrupted"
  | "failed"
  | "unknown"

export type AgentMessageActivityKind =
  | "message"
  | "reasoning"
  | "plan"
  | "command"
  | "change"
  | "tool"
  | "response"
  | "other"

export type AgentMessageActivityEntry = {
  id: string
  kind: AgentMessageActivityKind
  label: string
  detail: string
  at: number | null
}

export type AgentMessageFileChange = {
  id: string
  path: string
  kind: string
  diff: string
}

export type AgentMessageTurnDetail = {
  finalResponse: string
  commentary: readonly string[]
  reasoningSummaries: readonly string[]
  plans: readonly string[]
  activities: readonly AgentMessageActivityEntry[]
  changes: readonly AgentMessageFileChange[]
  turnDiff: string
}

export type AgentMessageHistoryEntry = {
  id: string
  turnId: string | null
  text: string
  sentAt: number
  durationMs: number | null
  status: AgentMessageTurnStatus
  hasImage: boolean
  hasAudio: boolean
  hasSkill: boolean
  model: string | null
  effort: string | null
  serviceTier: string | null
} & AgentMessageTurnDetail

export const EMPTY_AGENT_MESSAGE_TURN_DETAIL: AgentMessageTurnDetail = {
  finalResponse: "",
  commentary: [],
  reasoningSummaries: [],
  plans: [],
  activities: [],
  changes: [],
  turnDiff: "",
}

function mergeUniqueText(previous: readonly string[], incoming: readonly string[]) {
  return [...new Set([...previous, ...incoming])]
}

function mergeById<T extends { id: string }>(previous: readonly T[], incoming: readonly T[]) {
  return [...new Map([...previous, ...incoming].map((entry) => [entry.id, entry])).values()]
}

export function mergeAgentMessageTurnDetail(
  previous: AgentMessageTurnDetail,
  incoming: AgentMessageTurnDetail,
): AgentMessageTurnDetail {
  return {
    finalResponse: incoming.finalResponse || previous.finalResponse,
    commentary: mergeUniqueText(previous.commentary, incoming.commentary),
    reasoningSummaries: mergeUniqueText(previous.reasoningSummaries, incoming.reasoningSummaries),
    plans: mergeUniqueText(previous.plans, incoming.plans),
    activities: mergeById(previous.activities, incoming.activities),
    changes: mergeById(previous.changes, incoming.changes),
    turnDiff: incoming.turnDiff || previous.turnDiff,
  }
}

export function agentMessageElapsedLabel(timestamp: number, now: number) {
  if (timestamp <= 0) return "—"
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function agentMessageDurationLabel(durationMs: number) {
  const seconds = Math.max(0, Math.floor(durationMs / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function agentMessageStatusLabel(entry: AgentMessageHistoryEntry, now: number) {
  if (entry.status === "unknown") return "—"
  const duration =
    entry.durationMs ??
    (entry.status === "queued" || entry.status === "inProgress"
      ? Math.max(0, now - entry.sentAt)
      : null)
  const marker =
    entry.status === "completed"
      ? "✓"
      : entry.status === "failed" || entry.status === "interrupted"
        ? "×"
        : "…"
  return duration === null ? marker : `${agentMessageDurationLabel(duration)} ${marker}`
}

export function agentMessageDiffStats(value: string) {
  let additions = 0
  let deletions = 0
  for (const line of value.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1
  }
  return { additions, deletions }
}

export function cleanAgentMessage(value: string) {
  const clean = value
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  return Array.from(clean).slice(0, 4_000).join("")
}

export function cleanAgentDetailText(value: string, limit = 40_000) {
  const clean = value
    .replace(/\p{Cc}/gu, (character) =>
      character === "\n" || character === "\t" ? character : " ",
    )
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/\r\n?/g, "\n")
    .trim()
  return Array.from(clean).slice(0, limit).join("")
}

export function agentMessageModelLabel(entry: AgentMessageHistoryEntry) {
  if (!entry.model) return "—"
  return [entry.model, entry.effort, entry.serviceTier].filter(Boolean).join(" · ")
}
