import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { FreeTerminalCommand, RemoteCodexTarget } from "../model/sessions"
import { FREE_TERMINAL_WORKING_DIRECTORY } from "./terminal"

/** Opens or resumes the official OpenCode TUI backed by its public HTTP server. */
export function createOpenCodeAgentCommand(
  resumeThreadId?: string,
  workingDirectory = FREE_TERMINAL_WORKING_DIRECTORY,
): FreeTerminalCommand {
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
): FreeTerminalCommand {
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
