import type { AgentProviderId } from "../model/agent-provider"
import {
  claudeResumeThreadsSnapshot,
  subscribeClaudeResumeThreads,
} from "../model/claude-resume-threads"
import {
  codexResumeThreadsSnapshot,
  subscribeCodexResumeThreads,
} from "../model/codex-resume-threads"
import {
  openCodeResumeThreadsSnapshot,
  subscribeOpenCodeResumeThreads,
} from "../model/opencode-resume-threads"
import type { TermAgentsCommand } from "../model/sessions"
import type { AgentProjectTarget } from "./agent-project-directories"
import { refreshRemoteClaudeResumeThreads } from "./claude-background"
import { createClaudeAgentCommand, createRemoteClaudeAgentCommand } from "./claude-command"
import { refreshClaudeResumeThreads } from "./claude-resume-store"
import { refreshCodexResumeThreads, refreshRemoteCodexResumeThreads } from "./codex-app-server"
import { createOpenCodeAgentCommand, createRemoteOpenCodeAgentCommand } from "./opencode-command"
import { refreshOpenCodeResumeThreads, refreshRemoteOpenCodeResumeThreads } from "./opencode-server"
import {
  createCodexAgentCommand,
  createRemoteCodexAgentCommand,
  TERM_AGENTS_WORKING_DIRECTORY,
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
  ) => TermAgentsCommand
}

const codexAdapter: AgentProviderAdapter = {
  id: "codex",
  resume: {
    subscribe: subscribeCodexResumeThreads,
    snapshot: codexResumeThreadsSnapshot,
    enabled: (environment) => environment.TUIMINAL_TERMINAL_CODEX_RESUME !== "0",
    refresh(target, signal) {
      return target.kind === "local"
        ? refreshCodexResumeThreads(TERM_AGENTS_WORKING_DIRECTORY, signal)
        : refreshRemoteCodexResumeThreads(target.profile, signal)
    },
  },
  createCommand(target, workingDirectory, resumeThreadId) {
    const directory =
      workingDirectory ?? (target.kind === "local" ? TERM_AGENTS_WORKING_DIRECTORY : "~")
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
        ? refreshOpenCodeResumeThreads(TERM_AGENTS_WORKING_DIRECTORY, signal)
        : refreshRemoteOpenCodeResumeThreads(target.profile, signal)
    },
  },
  createCommand(target, workingDirectory, resumeThreadId) {
    const directory =
      workingDirectory ?? (target.kind === "local" ? TERM_AGENTS_WORKING_DIRECTORY : "~")
    return target.kind === "remote"
      ? createRemoteOpenCodeAgentCommand(
          { profile: target.profile, workingDirectory: directory },
          resumeThreadId,
        )
      : createOpenCodeAgentCommand(resumeThreadId, directory)
  },
}

const claudeAdapter: AgentProviderAdapter = {
  id: "claude",
  resume: {
    subscribe: subscribeClaudeResumeThreads,
    snapshot: claudeResumeThreadsSnapshot,
    enabled: (environment) =>
      environment.TUIMINAL_TERMINAL_CLAUDE_RESUME !== "0" &&
      environment.TUIMINAL_TERMINAL_WORKSPACE_STATE !== "0",
    async refresh(target, signal) {
      if (target.kind === "remote")
        return refreshRemoteClaudeResumeThreads(target.profile, signal).catch(() =>
          refreshClaudeResumeThreads(),
        )
      return refreshClaudeResumeThreads()
    },
  },
  createCommand(target, workingDirectory, resumeThreadId) {
    const directory =
      workingDirectory ?? (target.kind === "local" ? TERM_AGENTS_WORKING_DIRECTORY : "~")
    return target.kind === "remote"
      ? createRemoteClaudeAgentCommand(
          { profile: target.profile, workingDirectory: directory },
          resumeThreadId,
        )
      : createClaudeAgentCommand(resumeThreadId, directory)
  },
}

const adapters = new Map<AgentProviderId, AgentProviderAdapter>([
  [codexAdapter.id, codexAdapter],
  [claudeAdapter.id, claudeAdapter],
  [openCodeAdapter.id, openCodeAdapter],
])

export function agentProviderAdapter(id: AgentProviderId) {
  return adapters.get(id) ?? null
}
