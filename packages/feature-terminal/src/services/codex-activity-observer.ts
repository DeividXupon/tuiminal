import type { CodexHydratedThread } from "../model/remote-codex"
import { object, requestKey, type RecordValue } from "./codex-message-history"

export type CodexActivity = "thinking" | "writing" | "running" | "updating" | "coding" | "tooling"
export type CodexState = "working" | "blocked" | "done" | "unknown" | "idle"
type ActivityEvents = {
  onState: (state: CodexState) => void
  onActivity: (activity: CodexActivity) => void
}

export function codexThreadWaiting(value: unknown) {
  const status = object(value)
  return Boolean(
    status?.type === "active" &&
      Array.isArray(status.activeFlags) &&
      status.activeFlags.some(
        (flag) => flag === "waitingOnApproval" || flag === "waitingOnUserInput",
      ),
  )
}

function threadState(value: unknown): CodexState | null {
  const status = object(value)
  if (status?.type === "active") return codexThreadWaiting(status) ? "blocked" : "working"
  if (status?.type === "idle") return "idle"
  if (status?.type === "systemError" || status?.type === "notLoaded") return "unknown"
  return null
}

function eventTurnId(params: RecordValue | null) {
  const id = params?.turnId ?? object(params?.turn)?.id
  return typeof id === "string" ? id : null
}

export function codexAppServerActivity(message: unknown): CodexActivity | null {
  const event = object(message)
  const method = event?.method
  if (method === "item/agentMessage/delta") return "writing"
  if (method === "item/plan/delta" || method === "turn/plan/updated") return "updating"
  if (method === "item/fileChange/patchUpdated") return "coding"
  if (method !== "item/started") return null
  const item = object(object(event?.params)?.item)
  switch (item?.type) {
    case "reasoning":
      return "thinking"
    case "agentMessage":
      return "writing"
    case "commandExecution":
      return "running"
    case "fileChange":
      return "coding"
    case "plan":
      return "updating"
    case "mcpToolCall":
    case "dynamicToolCall":
    case "webSearch":
    case "imageView":
      return "tooling"
    default:
      return null
  }
}

export function codexAppServerState(message: unknown): CodexState | null {
  const event = object(message)
  const method = event?.method
  const params = object(event?.params)
  if (method === "turn/started") return "working"
  if (method === "turn/completed")
    return object(params?.turn)?.status === "completed" ? "done" : "unknown"
  if (method === "thread/status/changed") return threadState(params?.status)
  if (typeof method === "string" && method.endsWith("requestApproval")) return "blocked"
  if (
    ((method === "item/tool/requestUserInput" || method === "tool/requestUserInput") &&
      params?.isBlocking !== false) ||
    method === "mcpServer/elicitation/request"
  )
    return "blocked"
  return codexAppServerActivity(message) ? "working" : null
}

/** Lifecycle evidence outranks late item events and belongs to one selected thread. */
export class CodexActivityObserver {
  private threadId: string | null = null
  private turnId: string | null = null
  private state: CodexState = "idle"
  private ended = false
  private waiting = false
  private readonly requests = new Set<string>()

  hydrate(thread: CodexHydratedThread) {
    this.threadId = thread.threadId
    this.turnId = null
    this.state = thread.state
    this.ended =
      thread.state === "done" ||
      (thread.state === "unknown" &&
        (thread.latestTurnStatus === "failed" || thread.latestTurnStatus === "interrupted"))
    this.waiting = thread.state === "blocked"
    this.requests.clear()
  }

  private publish(state: CodexState, events: ActivityEvents, force = false) {
    if (state === this.state && !force) return
    this.state = state
    events.onState(state)
  }

  private resolve(id: unknown, events: ActivityEvents) {
    const key = requestKey(id)
    if (!key || !this.requests.delete(key) || this.requests.size || this.ended) return
    this.waiting = false
    this.publish("working", events)
  }

  observeClient(message: RecordValue, events: ActivityEvents) {
    if (!message.method && ("result" in message || "error" in message))
      this.resolve(message.id, events)
  }

  private observeStatus(state: CodexState, events: ActivityEvents) {
    if (this.ended) return
    if (state === "working" || state === "blocked") {
      this.waiting = state === "blocked"
      this.publish(this.waiting || this.requests.size ? "blocked" : "working", events)
    } else {
      this.waiting = false
      this.requests.clear()
      // Idle is not proof of success and must not acknowledge unseen completion.
      this.publish(state, events)
    }
  }

  private observeTurn(
    method: unknown,
    turnId: string | null,
    state: CodexState | null,
    events: ActivityEvents,
  ) {
    if (method === "turn/started") {
      if (this.ended && turnId && turnId === this.turnId) return true
      this.turnId = turnId
      this.ended = false
      this.waiting = false
      this.requests.clear()
      this.publish("working", events, true)
      return true
    }
    if (method === "turn/completed" && state) {
      this.turnId = turnId
      this.ended = true
      this.waiting = false
      this.requests.clear()
      this.publish(state, events, true)
      return true
    }
    return false
  }

  observeServer(message: RecordValue, events: ActivityEvents) {
    const params = object(message.params)
    if (this.threadId && params?.threadId !== this.threadId) return
    const method = message.method
    const turnId = eventTurnId(params)
    if (method !== "turn/started" && turnId && this.turnId && turnId !== this.turnId) return
    const state = codexAppServerState(message)
    if (this.observeTurn(method, turnId, state, events)) return
    if (method === "thread/status/changed" && state) {
      this.observeStatus(state, events)
      return
    }
    if (method === "serverRequest/resolved") {
      this.resolve(params?.requestId, events)
      return
    }
    if (this.ended) return
    if (state === "blocked") {
      const key = requestKey(message.id)
      if (key) this.requests.add(key)
      else this.waiting = true
      this.publish("blocked", events)
      return
    }
    if (this.waiting || this.requests.size) return
    if (state) this.publish(state, events)
    const activity = codexAppServerActivity(message)
    if (activity) events.onActivity(activity)
  }
}
