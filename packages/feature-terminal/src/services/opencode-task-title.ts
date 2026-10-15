import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import { firstAgentPrompt } from "../model/agent-prompt-title"
import { cleanAgentTaskTitle } from "../model/agent-task-title"

export function openCodeTaskTitle(title: string, messages: readonly AgentMessageHistoryEntry[]) {
  const clean = cleanAgentTaskTitle(title)
  if (clean && !/^(?:opencode|oc)$/i.test(clean)) return clean
  return firstAgentPrompt(messages)?.text ?? ""
}
