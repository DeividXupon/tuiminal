import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { AgentResumeThread } from "../model/agent-resume-thread"
import { agentProviderAdapter } from "./agent-provider-adapters"

export function resolveAgentResumeCommand(
  thread: AgentResumeThread,
  profiles: readonly TerminalRemoteCodexProfile[],
) {
  const adapter = agentProviderAdapter(thread.providerId ?? "codex")
  if (!adapter?.resume)
    return { command: null, error: "Este agente não oferece retomada de sessões." }
  if (!thread.remoteProfileId)
    return {
      command: adapter.createCommand({ kind: "local" }, thread.cwd || undefined, thread.id),
      error: null,
    }
  const profile = profiles.find(
    (candidate) =>
      candidate.id === thread.remoteProfileId &&
      (!thread.remoteProfileHost || candidate.host === thread.remoteProfileHost),
  )
  if (!profile)
    return {
      command: null,
      error: "O perfil remoto desta sessão não está mais configurado.",
    }
  return {
    command: adapter.createCommand(
      {
        kind: "remote",
        profile: thread.remoteProfileHost
          ? {
              id: thread.remoteProfileId,
              name: thread.remoteProfileName || profile.name,
              host: thread.remoteProfileHost,
            }
          : profile,
      },
      thread.cwd,
      thread.id,
    ),
    error: null,
  }
}
