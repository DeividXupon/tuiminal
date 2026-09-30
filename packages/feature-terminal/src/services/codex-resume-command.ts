import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { CodexResumeThread } from "../model/codex-resume-threads"
import { agentProviderAdapter } from "./agent-provider-adapters"

export function resolveCodexResumeCommand(
  threadId: string,
  threads: readonly CodexResumeThread[],
  profiles: readonly TerminalRemoteCodexProfile[],
) {
  const adapter = agentProviderAdapter("codex")!
  const thread = threads.find((candidate) => candidate.id === threadId)
  if (!thread?.remoteProfileId)
    return {
      command: adapter.createCommand(
        { kind: "local" },
        thread?.cwd || undefined,
        thread?.id ?? threadId,
      ),
      error: null,
    }
  const profile = profiles.find((candidate) => candidate.id === thread.remoteProfileId)
  if (!profile)
    return {
      command: null,
      error: "O perfil remoto desta sessão não está mais configurado.",
    }
  return {
    command: adapter.createCommand({ kind: "remote", profile }, thread.cwd, thread.id),
    error: null,
  }
}
