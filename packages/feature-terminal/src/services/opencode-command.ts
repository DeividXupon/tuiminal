import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { TermAgentsCommand, RemoteCodexTarget } from "../model/sessions"
import { TERM_AGENTS_WORKING_DIRECTORY } from "./terminal"

/** Opens or resumes the official OpenCode TUI backed by its public HTTP server. */
export function createOpenCodeAgentCommand(
  resumeThreadId?: string,
  workingDirectory = TERM_AGENTS_WORKING_DIRECTORY,
): TermAgentsCommand {
  return {
    kind: "custom",
    label: "OpenCode",
    shortLabel: "OpenCode",
    displayCommand: resumeThreadId
      ? `opencode --server --session ${resumeThreadId}`
      : "opencode --server",
    command: ["opencode"],
    accent: COLORS.terminal,
    workingDirectory,
    agentLaunch: {
      providerId: "opencode",
      transport: "app-server",
      ...(resumeThreadId ? { resumeThreadId } : {}),
    },
  }
}

export function createRemoteOpenCodeAgentCommand(
  remote: RemoteCodexTarget,
  resumeThreadId?: string,
): TermAgentsCommand {
  return {
    kind: "custom",
    label: `OpenCode · ${remote.profile.name}`,
    shortLabel: "OpenCode",
    displayCommand: resumeThreadId
      ? `opencode --server --session ${resumeThreadId} · ${remote.profile.name}`
      : `opencode --server · ${remote.profile.name}`,
    command: ["opencode"],
    accent: COLORS.terminal,
    workingDirectory: remote.workingDirectory,
    agentLaunch: {
      providerId: "opencode",
      transport: "app-server",
      remote,
      ...(resumeThreadId ? { resumeThreadId } : {}),
    },
  }
}
