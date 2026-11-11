import { randomUUID } from "node:crypto"
import { firstAgentPrompt } from "../model/agent-prompt-title"
import { cleanAgentTaskTitle } from "../model/agent-task-title"
import type { CodexObservedUserMessage, RecordValue } from "./codex-message-history"
import { object, requestKey } from "./codex-message-history"

type TitleEvents = { onTitle: (title: string) => void }
type NameRequest = {
  generation: number
  sequence: number
  internal: boolean
  threadId: string | null
}

/** Prefer the public thread name, falling back to the first prompt while unnamed. */
export class CodexTaskTitleObserver {
  private threadId: string | null = null
  private title = ""
  private liveNameObserved = false
  private prompt: ReturnType<typeof firstAgentPrompt> = null
  private published = ""
  private generation = 0
  private sequence = 0
  private appliedSequence = 0
  private readonly observerId = randomUUID()
  private readonly requests = new Map<string, NameRequest>()
  private pendingRefresh: string | null = null

  select(threadId: string, name: unknown, events: TitleEvents) {
    this.selectThread(threadId)
    const selectedName = typeof name === "string" ? cleanAgentTaskTitle(name) : ""
    if (selectedName && selectedName !== this.title) {
      this.title = selectedName
      this.generation += 1
    }
    this.publish(events, true)
  }

  private selectThread(threadId: string | null) {
    if (threadId === this.threadId) return
    this.threadId = threadId
    this.title = ""
    this.liveNameObserved = false
    this.prompt = null
    this.generation += 1
    this.appliedSequence = 0
    this.pendingRefresh = null
  }

  /** Track both official-client queries and Tuiminal's read-only metadata requests. */
  observeClient(message: RecordValue, internal = false) {
    if (message.method !== "thread/read" && message.method !== "thread/list") return
    const key = requestKey(message.id)
    if (!key) return
    const params = object(message.params)
    this.requests.set(key, {
      generation: this.generation,
      sequence: ++this.sequence,
      internal,
      threadId: typeof params?.threadId === "string" ? params.threadId : null,
    })
  }

  /** Query the exact active thread, even when it is absent from the recent-thread page. */
  refresh(send: (frame: string) => void) {
    if (!this.threadId || this.liveNameObserved || this.pendingRefresh) return
    const message = {
      id: `tuiminal-title:${this.observerId}:${this.sequence + 1}`,
      method: "thread/read",
      params: { threadId: this.threadId, includeTurns: false },
    }
    this.observeClient(message, true)
    this.pendingRefresh = requestKey(message.id)
    send(JSON.stringify(message))
  }

  /** Newer metadata can replace an earlier snapshot, but never a live rename. */
  private observeThread(value: unknown, request: NameRequest, events: TitleEvents) {
    const thread = object(value)
    if (this.liveNameObserved || !this.threadId || thread?.id !== this.threadId) return
    if (request.generation !== this.generation || request.sequence < this.appliedSequence) return
    if (request.threadId && request.threadId !== thread.id) return
    if (typeof thread.name !== "string") return
    const name = cleanAgentTaskTitle(thread.name)
    if (!name) return
    this.title = name
    this.appliedSequence = request.sequence
    this.publish(events)
  }

  observeServer(message: RecordValue, events: TitleEvents) {
    const key = requestKey(message.id)
    const request = key ? this.requests.get(key) : undefined
    if (key && request) {
      this.requests.delete(key)
      if (this.pendingRefresh === key) this.pendingRefresh = null
      const result = object(message.result)
      this.observeThread(result?.thread, request, events)
      if (Array.isArray(result?.data))
        for (const thread of result.data) this.observeThread(thread, request, events)
      return request.internal
    }
    if (message.method !== "thread/name/updated") return false
    const params = object(message.params)
    if (this.threadId && params?.threadId !== this.threadId) return false
    if (typeof params?.threadName !== "string" || typeof params.threadId !== "string") return false
    this.selectThread(params.threadId)
    this.title = cleanAgentTaskTitle(params.threadName)
    this.liveNameObserved = true
    this.generation += 1
    this.publish(events)
    return false
  }

  observeMessages(
    messages: readonly CodexObservedUserMessage[],
    events: TitleEvents,
    threadId = this.threadId,
  ) {
    this.selectThread(threadId)
    this.prompt = firstAgentPrompt(this.prompt ? [this.prompt, ...messages] : messages)
    this.publish(events)
  }

  private publish(events: TitleEvents, force = false) {
    const title = this.title || this.prompt?.text || ""
    if (!force && title === this.published) return
    this.published = title
    events.onTitle(title)
  }
}
