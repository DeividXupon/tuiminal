import type {
  AgentMessageActivityEntry,
  AgentMessageFileChange,
  AgentMessageHistoryEntry,
  AgentMessageTurnStatus,
} from "../model/agent-message-history"
import { EMPTY_AGENT_MESSAGE_TURN_DETAIL } from "../model/agent-message-history"
import type { AgentState } from "../model/agent-state"
import type { OpenCodeResumeThread } from "../model/opencode-resume-threads"

type RecordValue = Record<string, unknown>

export type OpenCodeSessionSummary = {
  id: string
  title: string
  directory: string
  updatedAt: number
}

export type OpenCodeHydration = {
  session: OpenCodeSessionSummary
  state: AgentState
  messages: AgentMessageHistoryEntry[]
  waitingOnApproval: boolean
}

export type OpenCodeObserverEvents = {
  onActivity: (
    activity: "thinking" | "writing" | "running" | "updating" | "coding" | "tooling",
  ) => void
  onState: (state: AgentState) => void
  onTitle: (title: string) => void
  onUserMessageHistory: (messages: readonly AgentMessageHistoryEntry[], replace: boolean) => void
  onHydrated?: (hydration: OpenCodeHydration) => void
  onError: (message: string) => void
}

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

function values(value: unknown) {
  return Array.isArray(value) ? value : []
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function timestamp(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0
  return value < 1_000_000_000_000 ? value * 1_000 : value
}

function timeValue(value: unknown, key: string) {
  return timestamp(object(value)?.[key])
}

function responseData(value: unknown) {
  const record = object(value)
  return record && Array.isArray(record.data) ? record.data : value
}

function projectName(path: string) {
  return (
    path
      .replace(/[\\/]+$/u, "")
      .split(/[\\/]/u)
      .at(-1) || path
  )
}

export function parseOpenCodeSession(value: unknown): OpenCodeSessionSummary | null {
  const response = object(value)
  const session = object(response?.data) ?? response
  if (!session || typeof session.id !== "string") return null
  const location = object(session.location)
  const directory =
    text(session.directory) ||
    text(session.path) ||
    text(object(session.path)?.cwd) ||
    text(location?.directory)
  const time = object(session.time)
  return {
    id: session.id,
    title: text(session.title) || "OpenCode",
    directory,
    updatedAt:
      timestamp(time?.updated) ||
      timestamp(session.updated) ||
      timestamp(session.updatedAt) ||
      timestamp(time?.created) ||
      timestamp(session.created),
  }
}

export function parseOpenCodeSessions(value: unknown) {
  return values(responseData(value))
    .flatMap((entry): OpenCodeSessionSummary[] => {
      const session = parseOpenCodeSession(entry)
      return session ? [session] : []
    })
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
}

export function openCodeResumeThreads(
  value: unknown,
  remote?: { id: string; name: string },
): OpenCodeResumeThread[] {
  return parseOpenCodeSessions(value)
    .slice(0, 20)
    .map((session) => ({
      id: session.id,
      title: session.title,
      preview: session.title,
      lastResponse: "",
      cwd: session.directory,
      projectName: projectName(session.directory),
      gitBranch: "",
      updatedAt: session.updatedAt,
      state: "idle",
      ...(remote ? { remoteProfileId: remote.id, remoteProfileName: remote.name } : {}),
    }))
}

type MessageWithParts = { info: RecordValue; parts: RecordValue[] }

function messageWithParts(value: unknown): MessageWithParts | null {
  const message = object(value)
  const info = object(message?.info) ?? message
  if (!info || typeof info.id !== "string" || typeof info.role !== "string") return null
  return {
    info,
    parts: values(message?.parts)
      .map(object)
      .filter((part) => part !== null),
  }
}

function messageText(message: MessageWithParts) {
  return message.parts
    .filter((part) => part.type === "text" && typeof part.text === "string" && !part.synthetic)
    .map((part) => String(part.text).trim())
    .filter(Boolean)
    .join("\n\n")
}

function toolState(part: RecordValue) {
  return object(part.state)
}

function toolDetail(part: RecordValue) {
  const state = toolState(part)
  const output = state?.output
  if (typeof output === "string") return output
  const metadata = object(state?.metadata)
  return typeof metadata?.output === "string" ? metadata.output : ""
}

function activityKind(part: RecordValue): AgentMessageActivityEntry["kind"] {
  if (part.type === "tool") return "tool"
  if (part.type === "patch") return "change"
  return "other"
}

function partActivity(part: RecordValue, messageId: string, index: number) {
  if (!["tool", "patch"].includes(String(part.type))) return null
  const state = toolState(part)
  const label =
    part.type === "patch"
      ? values(part.files)
          .filter((file): file is string => typeof file === "string")
          .join(", ")
      : text(part.tool) || text(state?.title)
  return {
    id: typeof part.id === "string" ? part.id : `${messageId}:part:${index}`,
    kind: activityKind(part),
    label,
    detail: part.type === "tool" ? toolDetail(part) : "",
    at: timeValue(state?.time, "start") || timeValue(part.time, "start") || null,
  } satisfies AgentMessageActivityEntry
}

function unifiedDiff(path: string, before: string, after: string) {
  if (!before && !after) return ""
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1 +1 @@`,
    ...before.split("\n").map((line) => `-${line}`),
    ...after.split("\n").map((line) => `+${line}`),
  ].join("\n")
}

export function parseOpenCodeFileDiffs(value: unknown, prefix: string) {
  return values(responseData(value)).flatMap((entry, index): AgentMessageFileChange[] => {
    const diff = object(entry)
    const path = text(diff?.file) || text(diff?.path)
    if (!diff || !path) return []
    const patch =
      text(diff.patch) || text(diff.diff) || unifiedDiff(path, text(diff.before), text(diff.after))
    return [
      {
        id: `${prefix}:${index}:${path}`,
        path,
        kind:
          text(diff.status) ||
          (text(diff.before) ? (text(diff.after) ? "update" : "delete") : "add"),
        diff: patch,
      },
    ]
  })
}

function assistantStatus(
  assistant: MessageWithParts | undefined,
  state: AgentState,
): AgentMessageTurnStatus {
  if (!assistant) return state === "working" || state === "blocked" ? "inProgress" : "unknown"
  const error = object(assistant.info.error)
  if (error)
    return error.name === "MessageAbortedError" || error.name === "AbortedError"
      ? "interrupted"
      : "failed"
  if (timeValue(assistant.info.time, "completed")) return "completed"
  return state === "done" || state === "idle" ? "completed" : "inProgress"
}

function modelDetails(user: MessageWithParts, assistant: MessageWithParts | undefined) {
  const configured = object(user.info.model)
  const provider = text(assistant?.info.providerID) || text(configured?.providerID)
  const model = text(assistant?.info.modelID) || text(configured?.modelID)
  return {
    model: [provider, model].filter(Boolean).join("/") || null,
    effort: text(user.info.variant) || null,
    serviceTier: null,
  }
}

export function openCodeMessageHistory(
  value: unknown,
  state: AgentState,
  diffs: ReadonlyMap<string, readonly AgentMessageFileChange[]> = new Map(),
) {
  const messages = values(responseData(value))
    .map(messageWithParts)
    .filter((message) => message !== null)
  const assistants = new Map(
    messages
      .filter(
        (message) => message.info.role === "assistant" && typeof message.info.parentID === "string",
      )
      .map((message) => [String(message.info.parentID), message]),
  )
  return messages.flatMap((user): AgentMessageHistoryEntry[] => {
    if (user.info.role !== "user") return []
    const prompt = messageText(user)
    const attachments = user.parts.filter((part) => part.type === "file")
    const hasImage = attachments.some((part) => text(part.mime).startsWith("image/"))
    const hasAudio = attachments.some((part) => text(part.mime).startsWith("audio/"))
    if (!prompt && !hasImage && !hasAudio) return []
    const id = String(user.info.id)
    const assistant = assistants.get(id)
    const sentAt = timeValue(user.info.time, "created")
    const completedAt = timeValue(assistant?.info.time, "completed")
    const changes = [...(diffs.get(id) ?? [])]
    const activities = (assistant?.parts ?? []).flatMap((part, index) => {
      const entry = partActivity(part, String(assistant?.info.id ?? id), index)
      return entry ? [entry] : []
    })
    return [
      {
        id: `opencode:${id}`,
        turnId: assistant ? String(assistant.info.id) : id,
        text: prompt,
        sentAt,
        durationMs: completedAt && sentAt ? Math.max(0, completedAt - sentAt) : null,
        status: assistantStatus(assistant, state),
        hasImage,
        hasAudio,
        hasSkill: false,
        ...modelDetails(user, assistant),
        ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
        finalResponse: assistant ? messageText(assistant) : "",
        activities,
        changes,
        turnDiff: changes
          .map((change) => change.diff)
          .filter(Boolean)
          .join("\n"),
      },
    ]
  })
}

export function openCodeLastResponse(value: unknown) {
  const messages = values(responseData(value))
    .map(messageWithParts)
    .filter((message) => message?.info.role === "assistant")
    .sort(
      (left, right) =>
        (timeValue(left!.info.time, "completed") || timeValue(left!.info.time, "created")) -
        (timeValue(right!.info.time, "completed") || timeValue(right!.info.time, "created")),
    )
  return messages.length ? messageText(messages.at(-1)!) : ""
}

export function unwrapOpenCodeEvent(value: unknown) {
  const event = object(value)
  const payload = object(event?.payload)
  return payload ?? event
}

export function openCodeEventSessionId(value: unknown) {
  const event = unwrapOpenCodeEvent(value)
  const properties = object(event?.properties) ?? object(event?.data)
  const info = object(properties?.info)
  const part = object(properties?.part)
  return (
    text(properties?.sessionID) ||
    text(info?.sessionID) ||
    text(info?.id) ||
    text(part?.sessionID) ||
    null
  )
}

export function openCodeEventActivity(value: unknown) {
  const event = unwrapOpenCodeEvent(value)
  const properties = object(event?.properties) ?? object(event?.data)
  const part = object(properties?.part)
  if (event?.type === "message.part.delta" || event?.type === "message.part.updated") {
    if (part?.type === "text") return "writing" as const
    if (part?.type === "reasoning") return "thinking" as const
    if (part?.type === "patch") return "coding" as const
    if (part?.type === "tool") return "tooling" as const
  }
  if (event?.type === "file.edited" || event?.type === "session.diff") return "coding" as const
  return null
}

export function openCodeEventState(value: unknown) {
  const event = unwrapOpenCodeEvent(value)
  const properties = object(event?.properties) ?? object(event?.data)
  if (event?.type === "session.idle") return "idle" as const
  if (event?.type === "session.completed") return "done" as const
  if (event?.type === "session.error") return "unknown" as const
  if (event?.type === "permission.asked" || event?.type === "question.asked")
    return "blocked" as const
  if (event?.type === "session.status") {
    const status = object(properties?.status)
    if (status?.type === "idle") return "idle" as const
    if (status?.type === "busy" || status?.type === "retry") return "working" as const
  }
  return openCodeEventActivity(value) ? ("working" as const) : null
}

export function openCodeEventTitle(value: unknown) {
  const event = unwrapOpenCodeEvent(value)
  if (event?.type !== "session.updated" && event?.type !== "session.renamed") return null
  const properties = object(event.properties) ?? object(event.data)
  const info = object(properties?.info)
  return text(properties?.title) || text(info?.title) || null
}

export function openCodeEventSession(value: unknown) {
  const event = unwrapOpenCodeEvent(value)
  if (event?.type !== "session.created" && event?.type !== "session.updated") return null
  const properties = object(event.properties) ?? object(event.data)
  return parseOpenCodeSession(properties?.info)
}
