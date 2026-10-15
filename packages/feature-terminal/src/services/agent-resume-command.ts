import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { agentProvider } from "../model/agent-provider"
import type { AgentResumeThread } from "../model/agent-resume-thread"
import { cleanAgentTaskTitle } from "../model/agent-task-title"
import type { TermAgentsCommand } from "../model/sessions"
import { agentProviderAdapter } from "./agent-provider-adapters"

function withResumeTitle(command: TermAgentsCommand, thread: AgentResumeThread) {
  const title = cleanAgentTaskTitle(thread.title)
  if (command.agentLaunch && title && title !== agentProvider(command.agentLaunch.providerId).label)
    command.agentLaunch = { ...command.agentLaunch, resumeTitle: title }
  return command
}

export function resolveAgentResumeCommand(
  thread: AgentResumeThread,
  profiles: readonly TerminalRemoteCodexProfile[],
) {
  const adapter = agentProviderAdapter(thread.providerId ?? "codex")
  if (!adapter?.resume)
    return { command: null, error: "Este agente não oferece retomada de sessões." }
  if (!thread.remoteProfileId)
    return {
      command: withResumeTitle(
        adapter.createCommand({ kind: "local" }, thread.cwd || undefined, thread.id),
        thread,
      ),
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
    command: withResumeTitle(
      adapter.createCommand(
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
      thread,
    ),
    error: null,
  }
}
