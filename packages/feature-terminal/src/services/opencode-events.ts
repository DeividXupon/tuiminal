import {
  type OpenCodeActivity,
  type OpenCodeSessionSummary,
  openCodeObject as object,
  parseOpenCodeSession,
} from "./opencode-api"

type RecordValue = Record<string, unknown>

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function timestamp(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0
  return value < 1_000_000_000_000 ? value * 1_000 : value
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
  const form = object(properties?.form)
  return (
    text(properties?.sessionID) ||
    text(properties?.sessionId) ||
    text(info?.sessionID) ||
    text(info?.id) ||
    text(part?.sessionID) ||
    text(form?.sessionID) ||
    null
  )
}

const COMMAND_TOOLS = new Set([
  "bash",
  "command",
  "exec",
  "execute",
  "run",
  "run_command",
  "shell",
  "terminal",
])
const CODE_TOOLS = new Set([
  "apply_patch",
  "create_file",
  "delete_file",
  "edit",
  "multiedit",
  "multi_edit",
  "patch",
  "str_replace",
  "write",
])

export function openCodeToolActivity(value: unknown): OpenCodeActivity | null {
  if (typeof value !== "string" || !value.trim()) return null
  const name = value.trim().toLocaleLowerCase().split(/[.:/]/u).at(-1)?.replaceAll("-", "_")
  if (!name) return null
  if (COMMAND_TOOLS.has(name)) return "running"
  if (CODE_TOOLS.has(name)) return "coding"
  return "tooling"
}

export function openCodeEventTool(value: unknown) {
  const event = unwrapOpenCodeEvent(value)
  const properties = object(event?.properties) ?? object(event?.data)
  const part = object(properties?.part)
  const type = text(event?.type)
  if (!type.includes(".tool.") && part?.type !== "tool") return null
  return {
    id: text(properties?.id) || text(properties?.callID) || text(part?.id) || null,
    name: text(properties?.name) || text(properties?.tool) || text(part?.tool) || null,
    terminal: type.endsWith(".success") || type.endsWith(".failed"),
  }
}

function messagePartActivity(
  type: string,
  part: RecordValue | null,
  knownToolActivity: OpenCodeActivity | null,
) {
  if (type !== "message.part.delta" && type !== "message.part.updated") return null
  if (part?.type === "text") return "writing" as const
  if (part?.type === "reasoning") return "thinking" as const
  if (part?.type === "patch") return "coding" as const
  if (part?.type === "tool")
    return openCodeToolActivity(part.tool) ?? knownToolActivity ?? ("tooling" as const)
  return null
}

export function openCodeEventActivity(
  value: unknown,
  knownToolActivity: OpenCodeActivity | null = null,
) {
  const event = unwrapOpenCodeEvent(value)
  const properties = object(event?.properties) ?? object(event?.data)
  const part = object(properties?.part)
  const type = text(event?.type)
  const partActivity = messagePartActivity(type, part, knownToolActivity)
  if (partActivity) return partActivity
  if (type.includes(".reasoning.")) return "thinking" as const
  if (type.includes(".text.")) return "writing" as const
  if (type.includes(".tool."))
    return (
      openCodeToolActivity(openCodeEventTool(value)?.name) ??
      knownToolActivity ??
      ("tooling" as const)
    )
  if (type.includes(".shell.")) return "running" as const
  if (type.includes(".compaction.") || type.endsWith(".context.updated")) return "updating" as const
  if (type === "file.edited" || type === "session.diff" || type.includes(".revert."))
    return "coding" as const
  if (
    type === "session.execution.started" ||
    type === "session.retry.scheduled" ||
    type.endsWith(".prompted") ||
    type.endsWith(".prompt.admitted") ||
    type.endsWith(".step.started")
  )
    return "thinking" as const
  return null
}

export function openCodeEventState(value: unknown) {
  const event = unwrapOpenCodeEvent(value)
  const properties = object(event?.properties) ?? object(event?.data)
  const type = text(event?.type)
  if (type === "session.execution.started" || type === "session.retry.scheduled")
    return "working" as const
  if (type === "session.execution.succeeded" || type === "session.execution.completed")
    return "done" as const
  if (
    type === "session.execution.failed" ||
    type === "session.execution.interrupted" ||
    type === "session.execution.cancelled"
  )
    return "unknown" as const
  if (event?.type === "session.idle") return "idle" as const
  if (event?.type === "session.completed") return "done" as const
  if (event?.type === "session.error") return "unknown" as const
  if (
    event?.type === "permission.asked" ||
    event?.type === "question.asked" ||
    event?.type === "form.created"
  )
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

export function openCodeEventSession(value: unknown): OpenCodeSessionSummary | null {
  const event = unwrapOpenCodeEvent(value)
  if (event?.type !== "session.created" && event?.type !== "session.updated") return null
  const properties = object(event.properties) ?? object(event.data)
  const nested = object(properties?.info) ?? object(properties?.session)
  const parsed = parseOpenCodeSession(nested)
  if (parsed) return parsed
  const sessionId = text(properties?.sessionID) || text(properties?.sessionId)
  if (!sessionId) return null
  const location = object(properties?.location)
  return {
    id: sessionId,
    title: text(properties?.title) || "OpenCode",
    directory: text(location?.directory) || openCodeEventDirectory(value) || "",
    updatedAt: timestamp(event.created),
  }
}

export function openCodeEventSessionParentId(value: unknown) {
  const event = unwrapOpenCodeEvent(value)
  const properties = object(event?.properties) ?? object(event?.data)
  const info = object(properties?.info)
  return (
    text(properties?.parentID) ||
    text(properties?.parentId) ||
    text(info?.parentID) ||
    text(info?.parentId) ||
    null
  )
}

export function openCodeEventDeletedSessionId(value: unknown) {
  const event = unwrapOpenCodeEvent(value)
  if (event?.type !== "session.deleted" && event?.type !== "session.removed") return null
  return openCodeEventSessionId(value)
}

export function openCodeEventDirectory(value: unknown) {
  const envelope = object(value)
  const location = object(envelope?.location)
  return text(envelope?.directory) || text(location?.directory) || null
}
