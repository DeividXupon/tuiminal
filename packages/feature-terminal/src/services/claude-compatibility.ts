import { cleanAgentMessage } from "../model/agent-message-history"
import type { RemoteCodexCompatibilityReport } from "../model/remote-codex"
import type { RemoteCodexTarget } from "../model/sessions"
import {
  type BoundedCommandResult,
  MISSING_COMMAND_RESULT,
  runBoundedCommand,
} from "./bounded-command"
import { resolveClaudeExecutable } from "./claude-executable"
import {
  parseClaudeVersion,
  remoteClaudeVersionCommand,
  supportedClaudeVersion,
} from "./remote-claude-connection"
import { RemoteCodexCompatibilityError } from "./remote-codex-compatibility"

const CLAUDE_VERSION_TIMEOUT_MS = 15_000

type ClaudePreflightOptions = {
  command?: readonly string[]
  timeoutMs?: number
}

function commandResult(command: readonly string[], signal: AbortSignal, local: boolean) {
  return runBoundedCommand(command, signal, () => {
    if (local) return MISSING_COMMAND_RESULT
    throw new Error("Não foi possível verificar o Claude Code.")
  })
}

function compatibilityReport(result: BoundedCommandResult, remote: boolean) {
  if (remote && result.exitCode === 72)
    throw new Error("A pasta selecionada não existe no servidor remoto.")
  if (result.exitCode !== 0 && result.exitCode !== 127)
    throw new Error(
      Array.from(cleanAgentMessage(result.stderr)).slice(0, 1_000).join("") ||
        "Não foi possível verificar o Claude Code.",
    )
  const parsed = parseClaudeVersion(`${result.stdout}\n${result.stderr}`)
  const version = parsed?.join(".") ?? null
  const reason =
    result.exitCode === 127
      ? remote
        ? ("remoteClaudeMissing" as const)
        : ("localClaudeMissing" as const)
      : !parsed
        ? ("claudeVersionInvalid" as const)
        : !supportedClaudeVersion(parsed.join("."))
          ? ("claudeVersionUnsupported" as const)
          : null
  return {
    providerId: "claude",
    compatible: reason === null,
    reason,
    localVersion: remote ? null : version,
    remoteVersion: remote ? version : null,
    daemonAvailable: true,
    proxyAvailable: true,
  } satisfies RemoteCodexCompatibilityReport
}

/** Validates the Claude Code binary used by the selected local or SSH launch. */
export async function preflightClaude(
  target: { cwd: string; remote?: RemoteCodexTarget },
  signal: AbortSignal,
  options: ClaudePreflightOptions = {},
) {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? CLAUDE_VERSION_TIMEOUT_MS)
  try {
    const remote = Boolean(target.remote)
    const command =
      options.command ??
      (target.remote
        ? remoteClaudeVersionCommand(target.remote.profile, target.cwd)
        : [resolveClaudeExecutable(), "--version"])
    const report = compatibilityReport(
      await commandResult(command, AbortSignal.any([signal, timeout]), !remote),
      remote,
    )
    if (!report.compatible) throw new RemoteCodexCompatibilityError(report)
    return report
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (timeout.aborted) throw new Error("A verificação do Claude Code excedeu o tempo limite.")
    throw error
  }
}
