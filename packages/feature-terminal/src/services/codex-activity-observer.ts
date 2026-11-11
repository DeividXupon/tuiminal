import type { CodexHydratedThread } from "../model/remote-codex"
import { object, type RecordValue, requestKey } from "./codex-message-history"

export type CodexActivity = "thinking" | "writing" | "running" | "updating" | "coding" | "tooling"
export type CodexState = "working" | "blocked" | "done" | "unknown" | "idle"
type ActivityEvents = {
  onTaskFailed?: () => void
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
  private readonly settledTurns = new Set<string>()
  private readonly requests = new Set<string>()
  private readonly starts = new Map<string, { threadId: string; previousTurnId: string | null }>()

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
    this.starts.clear()
    this.settledTurns.clear()
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
    if (message.method !== "turn/start") return
    const threadId = object(message.params)?.threadId
    const key = requestKey(message.id)
    if (key && typeof threadId === "string")
      this.starts.set(key, { threadId, previousTurnId: this.turnId })
  }

  private observeStartResponse(message: RecordValue, events: ActivityEvents) {
    const key = requestKey(message.id)
    const start = key ? this.starts.get(key) : null
    if (!key || !start) return
    this.starts.delete(key)
    const turn = object(object(message.result)?.turn)
    if (
      (this.threadId && start.threadId !== this.threadId) ||
      (this.turnId !== null && this.turnId !== start.previousTurnId) ||
      typeof turn?.id !== "string" ||
      turn.id === this.turnId ||
      this.settledTurns.has(turn.id) ||
      turn.status !== "inProgress"
    )
      return
    // A successful start response is lifecycle evidence even without turn/started.
    this.observeTurn("turn/started", turn.id, "working", events)
  }

  private observeStatus(state: CodexState, events: ActivityEvents) {
    if (this.ended) {
      if (state !== "working" && state !== "blocked") return
      // Runtime status describes the current thread, not the previously completed turn.
      this.ended = false
      this.turnId = null
    }
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
      if (turnId && turnId === this.turnId) return true
      this.turnId = turnId
      this.ended = false
      this.waiting = false
      this.requests.clear()
      this.publish("working", events, true)
      return true
    }
    if (method === "turn/completed" && state) {
      if (turnId) this.settledTurns.add(turnId)
      this.turnId = turnId
      this.ended = true
      this.waiting = false
      this.requests.clear()
      this.publish(state, events, true)
      return true
    }
    return false
  }

  private observeActivity(
    message: RecordValue,
    state: CodexState | null,
    turnId: string | null,
    events: ActivityEvents,
  ) {
    if (this.ended) return
    if (turnId && state && !this.turnId) this.turnId = turnId
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

  observeServer(message: RecordValue, events: ActivityEvents) {
    if (!message.method) {
      this.observeStartResponse(message, events)
      return
    }
    const params = object(message.params)
    if (this.threadId && params?.threadId !== this.threadId) return
    const method = message.method
    const turnId = eventTurnId(params)
    if (turnId && this.settledTurns.has(turnId)) return
    if (method !== "turn/started" && turnId && this.turnId && turnId !== this.turnId) return
    const state = codexAppServerState(message)
    if (this.observeTurn(method, turnId, state, events)) {
      if (method === "turn/completed" && object(params?.turn)?.status === "failed")
        events.onTaskFailed?.()
      return
    }
    if (method === "thread/status/changed" && state) {
      this.observeStatus(state, events)
      return
    }
    if (method === "serverRequest/resolved") {
      this.resolve(params?.requestId, events)
      return
    }
    this.observeActivity(message, state, turnId, events)
  }
}
