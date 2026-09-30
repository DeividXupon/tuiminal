import type { AgentProviderId } from "./agent-provider"
import type { CodexResumeThread } from "./codex-resume-threads"

export type AgentResumeThread = CodexResumeThread & { providerId?: AgentProviderId }

export function agentResumeThreadKey(
  thread: Pick<AgentResumeThread, "providerId" | "id" | "remoteProfileId">,
) {
  return [thread.providerId ?? "codex", thread.remoteProfileId ?? "local", thread.id].join(":")
}
