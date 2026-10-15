import type { AgentMessageHistoryEntry } from "./agent-message-history"
import { cleanAgentTaskTitle } from "./agent-task-title"

type Prompt = Pick<AgentMessageHistoryEntry, "text" | "sentAt">

/** The earliest nonempty user message, including older pages loaded on resume. */
export function firstAgentPrompt(messages: readonly Prompt[]): Prompt | null {
  let first: Prompt | null = null
  for (const message of messages) {
    if (first && message.sentAt >= first.sentAt) continue
    const text = cleanAgentTaskTitle(message.text)
    if (text) first = { text, sentAt: message.sentAt }
  }
  return first
}
