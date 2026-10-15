import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { TermAgentsCommand, RemoteCodexTarget } from "../model/sessions"
import { TERM_AGENTS_WORKING_DIRECTORY } from "./terminal"

export function createClaudeAgentCommand(
  resumeThreadId?: string,
  workingDirectory = TERM_AGENTS_WORKING_DIRECTORY,
): TermAgentsCommand {
  return {
    kind: "custom",
    label: "Claude Code",
    shortLabel: "Claude",
    displayCommand: resumeThreadId ? `claude --resume ${resumeThreadId}` : "claude",
    command: ["claude"],
    accent: COLORS.terminal,
    workingDirectory,
    agentLaunch: {
      providerId: "claude",
      transport: "hooks",
      ...(resumeThreadId ? { resumeThreadId } : {}),
    },
  }
}

export function createRemoteClaudeAgentCommand(
  remote: RemoteCodexTarget,
  resumeThreadId?: string,
): TermAgentsCommand {
  return {
    kind: "custom",
    label: `Claude Code · ${remote.profile.name}`,
    shortLabel: "Claude",
    displayCommand: resumeThreadId
      ? `claude --resume ${resumeThreadId} · ${remote.profile.name}`
      : `claude --bg · ${remote.profile.name}`,
    command: ["claude"],
    accent: COLORS.terminal,
    workingDirectory: remote.workingDirectory,
    agentLaunch: {
      providerId: "claude",
      transport: "hooks",
      remote,
      ...(resumeThreadId ? { resumeThreadId } : {}),
    },
  }
}
