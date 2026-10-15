import { firstAgentPrompt } from "../model/agent-prompt-title"
import { cleanAgentTaskTitle } from "../model/agent-task-title"
import type { CodexObservedUserMessage, RecordValue } from "./codex-message-history"
import { object } from "./codex-message-history"

type TitleEvents = { onTitle: (title: string) => void }

/** Keeps display-only prompt fallback separate from the provider's thread name. */
export class CodexTaskTitleObserver {
  private threadId: string | null = null
  private title = ""
  private prompt: ReturnType<typeof firstAgentPrompt> = null
  private published = ""

  select(threadId: string, name: unknown, events: TitleEvents) {
    this.threadId = threadId
    this.prompt = null
    this.title = typeof name === "string" ? cleanAgentTaskTitle(name) : ""
    this.publish(events, true)
  }

  observeServer(message: RecordValue, events: TitleEvents) {
    if (message.method !== "thread/name/updated") return
    const params = object(message.params)
    if (this.threadId && params?.threadId !== this.threadId) return
    if (typeof params?.threadName !== "string") return
    if (typeof params.threadId === "string") this.threadId = params.threadId
    this.title = cleanAgentTaskTitle(params.threadName)
    this.publish(events)
  }

  observeMessages(
    messages: readonly CodexObservedUserMessage[],
    events: TitleEvents,
    threadId = this.threadId,
  ) {
    if (threadId && this.threadId && threadId !== this.threadId) {
      this.title = ""
      this.prompt = null
    }
    this.threadId = threadId
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
