import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type {
  RemoteCodexCompatibilityReport,
  RemoteCodexIncompatibilityReason,
} from "../model/remote-codex"
import { resolveOpenCodeExecutable } from "./opencode-executable"
import {
  compatibleRemoteOpenCode,
  openCodeCliProtocol,
  openCodeVersion,
  type OpenCodeIdentity,
} from "./opencode-protocol"
import { RemoteCodexCompatibilityError } from "./remote-codex-compatibility"
import { remoteOpenCodeVersionCommand } from "./remote-opencode-connection"

type CommandResult = { exitCode: number; stdout: string; stderr: string }

type PreflightOptions = {
  timeoutMs?: number
  localVersionCommand?: readonly string[]
  remoteVersionCommand?: readonly string[]
}

async function readBoundedText(stream: ReadableStream<Uint8Array>, maximumBytes = 64 * 1024) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""
  let remaining = maximumBytes
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (remaining <= 0) continue
      const value = chunk.value.subarray(0, remaining)
      remaining -= value.byteLength
      output += decoder.decode(value, { stream: true })
    }
    return output + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

async function runVersionCommand(command: readonly string[], signal: AbortSignal) {
  signal.throwIfAborted()
  let child: ReturnType<typeof Bun.spawn>
  try {
    child = Bun.spawn([...command], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  } catch {
    return { exitCode: 127, stdout: "", stderr: "" }
  }
  const stop = () => child.kill()
  signal.addEventListener("abort", stop, { once: true })
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      readBoundedText(child.stdout as ReadableStream<Uint8Array>),
      readBoundedText(child.stderr as ReadableStream<Uint8Array>),
    ])
    signal.throwIfAborted()
    return { exitCode, stdout, stderr }
  } finally {
    signal.removeEventListener("abort", stop)
    if (child.exitCode === null) child.kill()
  }
}

function identity(
  result: CommandResult,
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

function compatibilityReport(localResult: CommandResult, remoteResult: CommandResult) {
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
      runVersionCommand(
        options.localVersionCommand ?? [resolveOpenCodeExecutable(), "--version"],
        boundedSignal,
      ),
      runVersionCommand(
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
