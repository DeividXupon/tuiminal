import { object, type RecordValue, requestKey } from "./codex-message-history"

/** Exclude the TUI's hidden title generator from observation, never from forwarding. */
export class CodexAuxiliaryThreads {
  private readonly starts = new Set<string>()
  private readonly requests = new Set<string>()
  private readonly threads = new Set<string>()

  observeClient(message: RecordValue) {
    if (typeof message.method !== "string") return false
    const params = object(message.params)
    const titleStart = message.method === "thread/start" && params?.threadSource === "thread_title"
    const hiddenThread = typeof params?.threadId === "string" && this.threads.has(params.threadId)
    if (!titleStart && !hiddenThread) return false
    const key = requestKey(message.id)
    if (key) {
      this.requests.add(key)
      if (titleStart) this.starts.add(key)
    }
    return true
  }

  observeServer(message: RecordValue) {
    if (message.method) {
      const params = object(message.params)
      return typeof params?.threadId === "string" && this.threads.has(params.threadId)
    }
    const key = requestKey(message.id)
    if (!key || !this.requests.delete(key)) return false
    if (this.starts.delete(key)) {
      const thread = object(object(message.result)?.thread)
      if (typeof thread?.id === "string") this.threads.add(thread.id)
    }
    // Keep thread identities through unsubscribe so late notifications stay isolated.
    return true
  }
}
