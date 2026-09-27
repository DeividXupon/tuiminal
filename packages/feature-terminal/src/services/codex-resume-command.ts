import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { CodexResumeThread } from "../model/codex-resume-threads"
import { createCodexAgentCommand, createRemoteCodexAgentCommand } from "./terminal"

export function resolveCodexResumeCommand(
  threadId: string,
  threads: readonly CodexResumeThread[],
  profiles: readonly TerminalRemoteCodexProfile[],
) {
  const thread = threads.find((candidate) => candidate.id === threadId)
  if (!thread?.remoteProfileId)
    return {
      command: createCodexAgentCommand(thread?.id ?? threadId, thread?.cwd || undefined),
      error: null,
    }
  const profile = profiles.find((candidate) => candidate.id === thread.remoteProfileId)
  if (!profile)
    return {
      command: null,
      error: "O perfil remoto desta sessão não está mais configurado.",
    }
  return {
    command: createRemoteCodexAgentCommand({ profile, workingDirectory: thread.cwd }, thread.id),
    error: null,
  }
}
