import {
  type AgentMessageHistoryEntry,
  cleanAgentDetailText,
  cleanAgentMessage,
  EMPTY_AGENT_MESSAGE_TURN_DETAIL,
  mergeAgentMessageTurnDetail,
} from "./agent-message-history"

function sanitizeChanges(message: AgentMessageHistoryEntry) {
  let diffBudget = 400_000
  return message.changes.slice(0, 100).map((change) => {
    const diff = cleanAgentDetailText(change.diff, diffBudget)
    diffBudget = Math.max(0, diffBudget - Array.from(diff).length)
    return {
      ...change,
      path: cleanAgentMessage(change.path),
      kind: cleanAgentMessage(change.kind),
      diff,
    }
  })
}

function sanitizeTextList(values: readonly string[]) {
  return values
    .slice(0, 100)
    .map((entry) => cleanAgentDetailText(entry, 8_000))
    .filter(Boolean)
}

export function sanitizeAgentMessages(messages: readonly AgentMessageHistoryEntry[]) {
  return messages.flatMap((message): AgentMessageHistoryEntry[] => {
    const text = cleanAgentMessage(message.text)
    if (!text && !message.hasImage && !message.hasAudio && !message.hasSkill) return []
    return [
      {
        ...message,
        text,
        finalResponse: cleanAgentDetailText(message.finalResponse),
        commentary: sanitizeTextList(message.commentary),
        reasoningSummaries: sanitizeTextList(message.reasoningSummaries),
        plans: sanitizeTextList(message.plans),
        activities: message.activities.slice(0, 200).map((entry) => ({
          ...entry,
          label: cleanAgentDetailText(entry.label, 4_000),
          detail: cleanAgentDetailText(entry.detail, 8_000),
        })),
        changes: sanitizeChanges(message),
        turnDiff: cleanAgentDetailText(message.turnDiff, 400_000),
      },
    ]
  })
}

function mergeEntry(
  previous: AgentMessageHistoryEntry | undefined,
  entry: AgentMessageHistoryEntry,
) {
  const detail = mergeAgentMessageTurnDetail(previous ?? EMPTY_AGENT_MESSAGE_TURN_DETAIL, entry)
  return {
    ...previous,
    ...entry,
    ...detail,
    status: entry.status === "unknown" ? (previous?.status ?? entry.status) : entry.status,
    durationMs: entry.durationMs ?? previous?.durationMs ?? null,
    model: entry.model ?? previous?.model ?? null,
    effort: entry.effort ?? previous?.effort ?? null,
    serviceTier: entry.serviceTier ?? previous?.serviceTier ?? null,
  }
}

export function mergeAgentMessageHistory(
  previous: readonly AgentMessageHistoryEntry[],
  incoming: readonly AgentMessageHistoryEntry[],
) {
  const entries = new Map(previous.map((entry) => [entry.id, entry]))
  for (const entry of incoming) entries.set(entry.id, mergeEntry(entries.get(entry.id), entry))
  return [...entries.values()].sort(
    (left, right) => left.sentAt - right.sentAt || left.id.localeCompare(right.id),
  )
}
