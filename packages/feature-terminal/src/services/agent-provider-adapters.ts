import {
  codexResumeThreadsSnapshot,
  subscribeCodexResumeThreads,
} from "../model/codex-resume-threads"
import type { AgentProviderId } from "../model/agent-provider"
import {
  openCodeResumeThreadsSnapshot,
  subscribeOpenCodeResumeThreads,
} from "../model/opencode-resume-threads"
import type { FreeTerminalCommand } from "../model/sessions"
import type { AgentProjectTarget } from "./agent-project-directories"
import { refreshCodexResumeThreads, refreshRemoteCodexResumeThreads } from "./codex-app-server"
import { refreshOpenCodeResumeThreads, refreshRemoteOpenCodeResumeThreads } from "./opencode-server"
import { createOpenCodeAgentCommand, createRemoteOpenCodeAgentCommand } from "./opencode-command"
import {
  createCodexAgentCommand,
  createRemoteCodexAgentCommand,
  FREE_TERMINAL_WORKING_DIRECTORY,
} from "./terminal"

export type AgentResumeProject = {
  id?: string
  cwd: string
  updatedAt: number
  remoteProfileId?: string
}

export type AgentProviderAdapter = {
  id: AgentProviderId
  resume?: {
    subscribe: (listener: () => void) => () => void
    snapshot: () => readonly AgentResumeProject[]
    enabled: (environment: NodeJS.ProcessEnv) => boolean
    refresh: (target: AgentProjectTarget, signal: AbortSignal) => Promise<unknown>
  }
  createCommand: (
    target: AgentProjectTarget,
    workingDirectory?: string,
    resumeThreadId?: string,
  ) => FreeTerminalCommand
}

const codexAdapter: AgentProviderAdapter = {
  id: "codex",
  resume: {
    subscribe: subscribeCodexResumeThreads,
    snapshot: codexResumeThreadsSnapshot,
    enabled: (environment) => environment.TUIMINAL_TERMINAL_CODEX_RESUME !== "0",
    refresh(target, signal) {
      return target.kind === "local"
        ? refreshCodexResumeThreads(FREE_TERMINAL_WORKING_DIRECTORY, signal)
        : refreshRemoteCodexResumeThreads(target.profile, signal)
    },
  },
  createCommand(target, workingDirectory, resumeThreadId) {
    const directory =
      workingDirectory ?? (target.kind === "local" ? FREE_TERMINAL_WORKING_DIRECTORY : "~")
    return target.kind === "remote"
      ? createRemoteCodexAgentCommand(
          { profile: target.profile, workingDirectory: directory },
          resumeThreadId,
        )
      : createCodexAgentCommand(resumeThreadId, directory)
  },
}

const openCodeAdapter: AgentProviderAdapter = {
  id: "opencode",
  resume: {
    subscribe: subscribeOpenCodeResumeThreads,
    snapshot: openCodeResumeThreadsSnapshot,
    enabled: (environment) => environment.TUIMINAL_TERMINAL_OPENCODE_RESUME !== "0",
    refresh(target, signal) {
      return target.kind === "local"
        ? refreshOpenCodeResumeThreads(FREE_TERMINAL_WORKING_DIRECTORY, signal)
        : refreshRemoteOpenCodeResumeThreads(target.profile, signal)
    },
  },
  createCommand(target, workingDirectory, resumeThreadId) {
    const directory =
      workingDirectory ?? (target.kind === "local" ? FREE_TERMINAL_WORKING_DIRECTORY : "~")
    return target.kind === "remote"
      ? createRemoteOpenCodeAgentCommand(
          { profile: target.profile, workingDirectory: directory },
          resumeThreadId,
        )
      : createOpenCodeAgentCommand(resumeThreadId, directory)
  },
}

const adapters = new Map<AgentProviderId, AgentProviderAdapter>([
  [codexAdapter.id, codexAdapter],
  [openCodeAdapter.id, openCodeAdapter],
])

export function agentProviderAdapter(id: AgentProviderId) {
  return adapters.get(id) ?? null
}
