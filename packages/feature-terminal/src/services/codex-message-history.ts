import {
  type AgentMessageActivityEntry,
  type AgentMessageFileChange,
  type AgentMessageHistoryEntry,
  type AgentMessageTurnDetail,
  type AgentMessageTurnStatus,
  EMPTY_AGENT_MESSAGE_TURN_DETAIL,
  mergeAgentMessageTurnDetail,
} from "../model/agent-message-history"

export type RecordValue = Record<string, unknown>
export type CodexObservedUserMessage = AgentMessageHistoryEntry

export function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

export function requestKey(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? `${typeof value}:${String(value)}`
    : null
}

export function userInputDetails(value: unknown) {
  if (!Array.isArray(value)) return null
  const inputs = value.map(object).filter((input) => input !== null)
  const text = inputs
    .flatMap((input) =>
      input.type === "text" && typeof input.text === "string" ? [input.text] : [],
    )
    .join("\n")
    .trim()
  const details = {
    text,
    hasImage: inputs.some((input) => input.type === "image" || input.type === "localImage"),
    hasAudio: inputs.some((input) => input.type === "audio" || input.type === "localAudio"),
    hasSkill: inputs.some((input) => input.type === "skill"),
  }
  return details.text || details.hasImage || details.hasAudio || details.hasSkill ? details : null
}

export function codexAppServerUserMessage(message: unknown) {
  const request = object(message)
  if (
    request?.method !== "turn/start" &&
    request?.method !== "turn/steer" &&
    request?.method !== "thread/queue/add"
  )
    return null
  return userInputDetails(object(request.params)?.input)?.text || null
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function activity(
  item: RecordValue,
  kind: AgentMessageActivityEntry["kind"],
  label: string,
  detail = "",
  at: number | null = null,
): AgentMessageActivityEntry | null {
  if (typeof item.id !== "string" || !label) return null
  return { id: item.id, kind, label, detail, at }
}

function fileChanges(item: RecordValue) {
  if (!Array.isArray(item.changes) || typeof item.id !== "string") return []
  return item.changes.flatMap((value, index): AgentMessageFileChange[] => {
    const change = object(value)
    if (!change || typeof change.path !== "string" || typeof change.diff !== "string") return []
    return [
      {
        id: `${item.id}:${index}`,
        path: change.path,
        kind: typeof change.kind === "string" ? change.kind : "update",
        diff: change.diff,
      },
    ]
  })
}

type ActivityReader = (item: RecordValue, at: number | null) => AgentMessageActivityEntry[]

function singleActivity(
  item: RecordValue,
  kind: AgentMessageActivityEntry["kind"],
  label: string,
  detail: string,
  at: number | null,
) {
  const entry = activity(item, kind, label, detail, at)
  return entry ? [entry] : []
}

const ACTIVITY_READERS: Record<string, ActivityReader> = {
  reasoning: (item, at) =>
    stringArray(item.summary).flatMap((summary, index) => {
      const entry = activity(item, "reasoning", summary, "", at)
      return entry ? [{ ...entry, id: `${entry.id}:summary:${index}` }] : []
    }),
  plan: (item, at) =>
    singleActivity(item, "plan", typeof item.text === "string" ? item.text : "", "", at),
  commandExecution: (item, at) =>
    singleActivity(
      item,
      "command",
      typeof item.command === "string" ? item.command : "",
      typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : "",
      at,
    ),
  fileChange: (item, at) =>
    singleActivity(
      item,
      "change",
      fileChanges(item)
        .map((change) => change.path)
        .join(", "),
      "",
      at,
    ),
  mcpToolCall: (item, at) =>
    singleActivity(
      item,
      "tool",
      [item.server, item.tool].filter((value) => typeof value === "string").join(" · "),
      "",
      at,
    ),
  dynamicToolCall: (item, at) =>
    singleActivity(
      item,
      "tool",
      typeof item.tool === "string" ? item.tool : String(item.type),
      "",
      at,
    ),
  webSearch: (item, at) =>
    singleActivity(
      item,
      "tool",
      typeof item.query === "string" ? item.query : String(item.type),
      "",
      at,
    ),
  agentMessage: (item, at) =>
    singleActivity(item, "response", typeof item.text === "string" ? item.text : "", "", at),
}

function itemActivity(item: RecordValue, at: number | null) {
  return typeof item.type === "string" ? (ACTIVITY_READERS[item.type]?.(item, at) ?? []) : []
}

export function detailFromItems(value: unknown, at: number | null = null): AgentMessageTurnDetail {
  if (!Array.isArray(value)) return EMPTY_AGENT_MESSAGE_TURN_DETAIL
  const items = value.map(object).filter((item) => item !== null)
  const agentMessages = items.filter(
    (item) => item.type === "agentMessage" && typeof item.text === "string" && item.text.trim(),
  )
  const explicitFinal = agentMessages.filter((item) => item.phase === "final_answer")
  const unknownPhase = agentMessages.filter(
    (item) => item.phase !== "final_answer" && item.phase !== "commentary",
  )
  const finalItems = explicitFinal.length ? explicitFinal : unknownPhase.slice(-1)
  const finalIds = new Set(finalItems.map((item) => item.id))
  const changes = items.flatMap(fileChanges)
  return {
    finalResponse: finalItems.map((item) => String(item.text)).join("\n\n"),
    commentary: agentMessages
      .filter((item) => item.phase === "commentary" || !finalIds.has(item.id))
      .map((item) => String(item.text)),
    reasoningSummaries: items.flatMap((item) =>
      item.type === "reasoning" ? stringArray(item.summary) : [],
    ),
    plans: items.flatMap((item) =>
      item.type === "plan" && typeof item.text === "string" ? [item.text] : [],
    ),
    activities: items.flatMap((item) => itemActivity(item, at)),
    changes,
    turnDiff: changes
      .map((change) => change.diff)
      .filter(Boolean)
      .join("\n"),
  }
}

function turnStatus(value: unknown): AgentMessageTurnStatus {
  return ["inProgress", "completed", "interrupted", "failed"].includes(String(value))
    ? (value as AgentMessageTurnStatus)
    : "unknown"
}

function userMessageFromItem(
  itemValue: unknown,
  turnId: string | null,
  sentAt: number,
  durationMs: number | null,
  status: AgentMessageTurnStatus,
  detail: AgentMessageTurnDetail,
) {
  const item = object(itemValue)
  if (item?.type !== "userMessage" || typeof item.id !== "string") return null
  const input = userInputDetails(item.content)
  if (!input) return null
  const id = typeof item.clientId === "string" ? `client:${item.clientId}` : `item:${item.id}`
  return {
    id,
    turnId,
    ...input,
    sentAt,
    durationMs,
    status,
    model: null,
    effort: null,
    serviceTier: null,
    ...detail,
  } satisfies CodexObservedUserMessage
}

function turnDurationMs(turn: RecordValue) {
  if (typeof turn.durationMs === "number" && turn.durationMs >= 0) return turn.durationMs
  if (typeof turn.startedAt !== "number" || typeof turn.completedAt !== "number") return null
  return Math.max(0, (turn.completedAt - turn.startedAt) * 1_000)
}

export type CodexTurnMetadata = {
  turnId: string | null
  sentAt: number
  completedAt: number
  durationMs: number | null
  status: AgentMessageTurnStatus
}

export function turnMetadata(value: unknown): CodexTurnMetadata | null {
  const turn = object(value)
  if (!turn) return null
  const startedAt =
    typeof turn.startedAt === "number" && turn.startedAt > 0 ? turn.startedAt * 1_000 : 0
  const completedAt =
    typeof turn.completedAt === "number" && turn.completedAt > 0 ? turn.completedAt * 1_000 : 0
  return {
    turnId: typeof turn.id === "string" ? turn.id : null,
    sentAt: startedAt || completedAt,
    completedAt,
    durationMs: turnDurationMs(turn),
    status: turnStatus(turn.status),
  }
}

export function historyFromTurns(
  value: unknown,
  turnTimes: Map<string, number> = new Map(),
): CodexObservedUserMessage[] {
  if (!Array.isArray(value)) return []
  const messages: CodexObservedUserMessage[] = []
  for (const turnValue of value) {
    const turn = object(turnValue)
    if (!turn) continue
    const metadata = turnMetadata(turn)
    if (!metadata) continue
    const { turnId, sentAt, durationMs, status } = metadata
    const detail = detailFromItems(turn.items)
    if (turnId && sentAt > 0) turnTimes.set(turnId, sentAt)
    if (!Array.isArray(turn.items)) continue
    for (const item of turn.items) {
      const message = userMessageFromItem(item, turnId, sentAt, durationMs, status, detail)
      if (message) messages.push(message)
    }
  }
  return messages
}

export function messagesFromTurnStart(
  sent: CodexObservedUserMessage | null,
  value: unknown,
  turnTimes: Map<string, number>,
) {
  const messages = historyFromTurns([value], turnTimes)
  if (!sent) return messages
  const metadata = turnMetadata(value)
  if (!metadata?.turnId) return messages
  const returned = messages.length === 1 ? messages[0] : null
  return [
    {
      ...sent,
      ...returned,
      id: sent.id,
      turnId: metadata.turnId,
      sentAt: metadata.sentAt || sent.sentAt,
      durationMs: metadata.durationMs,
      status: metadata.status === "unknown" ? sent.status : metadata.status,
      hasImage: Boolean(returned?.hasImage) || sent.hasImage,
      hasAudio: Boolean(returned?.hasAudio) || sent.hasAudio,
      hasSkill: Boolean(returned?.hasSkill) || sent.hasSkill,
      model: sent.model,
      effort: sent.effort,
      serviceTier: sent.serviceTier,
    },
  ]
}

export function turnNotificationUpdate(
  method: "turn/started" | "turn/completed",
  metadata: CodexTurnMetadata,
  rememberedStart: number,
) {
  const sentAt = metadata.sentAt || rememberedStart
  const durationMs =
    metadata.durationMs ??
    (metadata.completedAt && rememberedStart
      ? Math.max(0, metadata.completedAt - rememberedStart)
      : null)
  return {
    ...(sentAt ? { sentAt } : {}),
    ...(durationMs !== null ? { durationMs } : {}),
    status:
      metadata.status === "unknown"
        ? method === "turn/completed"
          ? ("completed" as const)
          : ("inProgress" as const)
        : metadata.status,
  }
}

export function uniqueMessages(messages: readonly CodexObservedUserMessage[]) {
  return [...new Map(messages.map((message) => [message.id, message])).values()]
}

/** Reads public user inputs and turn details without exposing private reasoning content. */
export function codexAppServerUserMessageHistory(value: unknown) {
  const payload = object(value)
  if (!payload) return []
  const thread = object(payload.thread)
  const initialPage = object(payload.initialTurnsPage)
  return uniqueMessages([
    ...historyFromTurns(thread?.turns),
    ...historyFromTurns(initialPage?.data),
  ])
}

export function historyFromItemEntries(value: unknown, turnTimes: ReadonlyMap<string, number>) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entryValue) => {
    const entry = object(entryValue)
    const turnId = typeof entry?.turnId === "string" ? entry.turnId : null
    const sentAt = turnId ? (turnTimes.get(turnId) ?? 0) : 0
    const message = userMessageFromItem(
      entry?.item,
      turnId,
      sentAt,
      null,
      "unknown",
      EMPTY_AGENT_MESSAGE_TURN_DETAIL,
    )
    return message ? [message] : []
  })
}

export function detailsFromItemEntries(value: unknown) {
  if (!Array.isArray(value)) return []
  const details = new Map<string, AgentMessageTurnDetail>()
  for (const entryValue of value) {
    const entry = object(entryValue)
    if (typeof entry?.turnId !== "string") continue
    const current = details.get(entry.turnId) ?? EMPTY_AGENT_MESSAGE_TURN_DETAIL
    details.set(entry.turnId, mergeAgentMessageTurnDetail(current, detailFromItems([entry.item])))
  }
  return [...details.entries()].map(([turnId, detail]) => ({ turnId, detail }))
}
