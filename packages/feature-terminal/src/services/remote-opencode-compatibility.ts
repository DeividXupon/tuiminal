import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type {
  RemoteCodexCompatibilityReport,
  RemoteCodexIncompatibilityReason,
} from "../model/remote-codex"
import { type BoundedCommandResult, runBoundedCommand } from "./bounded-command"
import { resolveOpenCodeExecutable } from "./opencode-executable"
import {
  compatibleRemoteOpenCode,
  openCodeCliProtocol,
  openCodeVersion,
  type OpenCodeIdentity,
} from "./opencode-protocol"
import { RemoteCodexCompatibilityError } from "./remote-codex-compatibility"
import { remoteOpenCodeVersionCommand } from "./remote-opencode-connection"

type PreflightOptions = {
  timeoutMs?: number
  localVersionCommand?: readonly string[]
  remoteVersionCommand?: readonly string[]
}

function identity(
  result: BoundedCommandResult,
  missing: RemoteCodexIncompatibilityReason,
  invalid: RemoteCodexIncompatibilityReason,
) {
  if (result.exitCode === 127) return { identity: null, version: null, reason: missing }
  const output = `${result.stdout}\n${result.stderr}`
  const version = openCodeVersion(output)
  const protocol = openCodeCliProtocol(output)
  if (result.exitCode !== 0 || !version || !protocol)
    return { identity: null, version: null, reason: invalid }
  return {
    identity: { protocol, version } satisfies OpenCodeIdentity,
    version,
    reason: null,
  }
}

function compatibilityReport(
  localResult: BoundedCommandResult,
  remoteResult: BoundedCommandResult,
) {
  const local = identity(localResult, "localOpenCodeMissing", "localOpenCodeVersionInvalid")
  const remote = identity(remoteResult, "remoteOpenCodeMissing", "remoteOpenCodeVersionInvalid")
  const reason =
    local.reason ??
    remote.reason ??
    (!compatibleRemoteOpenCode(local.identity, remote.identity) ? "versionMismatch" : null)
  return {
    providerId: "opencode",
    compatible: reason === null,
    reason,
    localVersion: local.version,
    remoteVersion: remote.version,
    daemonAvailable: true,
    proxyAvailable: true,
  } satisfies RemoteCodexCompatibilityReport
}

function localCompatibilityReport(localResult: BoundedCommandResult) {
  const local = identity(localResult, "localOpenCodeMissing", "localOpenCodeVersionInvalid")
  return {
    providerId: "opencode",
    compatible: local.reason === null,
    reason: local.reason,
    localVersion: local.version,
    remoteVersion: null,
    daemonAvailable: true,
    proxyAvailable: true,
  } satisfies RemoteCodexCompatibilityReport
}

/** Validates the local OpenCode CLI before starting its owned server. */
export async function preflightLocalOpenCode(
  signal: AbortSignal,
  options: Pick<PreflightOptions, "localVersionCommand" | "timeoutMs"> = {},
) {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 10_000)
  try {
    const report = localCompatibilityReport(
      await runBoundedCommand(
        options.localVersionCommand ?? [resolveOpenCodeExecutable(), "--version"],
        AbortSignal.any([signal, timeout]),
      ),
    )
    if (!report.compatible) throw new RemoteCodexCompatibilityError(report)
    return report
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (timeout.aborted) throw new Error("A verificação do OpenCode excedeu o tempo limite.")
    throw error
  }
}

/** Validates the local OpenCode TUI and remote OpenCode server binary before retrying a launch. */
export async function preflightRemoteOpenCode(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
  options: PreflightOptions = {},
) {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 10_000)
  const boundedSignal = AbortSignal.any([signal, timeout])
  try {
    const [localResult, remoteResult] = await Promise.all([
      runBoundedCommand(
        options.localVersionCommand ?? [resolveOpenCodeExecutable(), "--version"],
        boundedSignal,
      ),
      runBoundedCommand(
        options.remoteVersionCommand ?? remoteOpenCodeVersionCommand(profile),
        boundedSignal,
      ),
    ])
    const report = compatibilityReport(localResult, remoteResult)
    if (!report.compatible) throw new RemoteCodexCompatibilityError(report)
    return report
  } catch (error) {
    if (!signal.aborted && timeout.aborted)
      throw new Error("O preflight remoto do OpenCode excedeu o tempo limite.")
    throw error
  }
}
