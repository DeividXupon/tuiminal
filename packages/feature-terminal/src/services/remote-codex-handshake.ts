import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import {
  compatibleCodexVersions,
  localCodexCompatibility,
  parseCodexVersion,
  type RemoteCodexCompatibilityReport,
  RemoteCodexCompatibilityError,
  remoteCodexCompatibility,
  remoteCodexCompatibilityReport,
} from "./remote-codex-compatibility"
import {
  createRemoteCodexAppServerLaunch,
  remoteCodexPreflightSshCommand,
  remoteCodexProxySshCommand,
} from "./remote-codex-connection"
import { resolveCodexExecutable } from "./codex-executable"
import { CodexProxyDisconnectedError, CodexProxyWebSocket } from "./codex-proxy-websocket"

export {
  compatibleCodexVersions,
  parseCodexVersion,
  RemoteCodexCompatibilityError,
  type RemoteCodexCompatibilityReport,
  type RemoteCodexIncompatibilityReason,
} from "./remote-codex-compatibility"

type RecordValue = Record<string, unknown>

export type RemoteCodexHandshakeErrorCode =
  | "sshUnavailable"
  | "hostKey"
  | "authentication"
  | "unreachable"
  | "codexMissing"
  | "directoryMissing"
  | "codexUnauthenticated"
  | "appServerStartFailed"
  | "initializeRejected"
  | "protocolIncompatible"
  | "localCodexUnavailable"
  | "timeout"
  | "disconnected"

const ERROR_MESSAGES: Record<RemoteCodexHandshakeErrorCode, string> = {
  sshUnavailable: "O cliente SSH local não está disponível.",
  hostKey: "A identidade do host remoto não pôde ser confirmada.",
  authentication: "A chave SSH foi recusada pelo servidor remoto.",
  unreachable: "Não foi possível alcançar o servidor remoto.",
  codexMissing: "O Codex não está instalado no servidor remoto.",
  directoryMissing: "A pasta selecionada não existe no servidor remoto.",
  codexUnauthenticated: "A conta do Codex ainda não está conectada.",
  appServerStartFailed: "O daemon do Codex não iniciou no servidor remoto.",
  initializeRejected: "O Codex remoto rejeitou o handshake initialize.",
  protocolIncompatible: "A resposta initialize do Codex remoto é incompatível.",
  localCodexUnavailable: "Não foi possível verificar a versão local do Codex.",
  timeout: "O preflight remoto do Codex excedeu o tempo limite.",
  disconnected: "O proxy remoto do Codex encerrou antes de responder ao handshake.",
}

export const REMOTE_CODEX_HANDSHAKE_TIMEOUT_MS = 10_000

export class RemoteCodexHandshakeError extends Error {
  constructor(readonly code: RemoteCodexHandshakeErrorCode) {
    super(ERROR_MESSAGES[code])
    this.name = "RemoteCodexHandshakeError"
  }
}

type HandshakeProcess = {
  exitCode: number | null
  stdin: { write(value: string | Uint8Array): number | Promise<number>; end(): void }
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
  exited: Promise<number>
  kill(signal?: string | number): void
}

type PreflightOptions = {
  timeoutMs?: number
  localVersionCommand?: readonly string[]
  remoteProbeCommand?: readonly string[]
  daemonStartCommand?: readonly string[]
  proxyCommand?: readonly string[]
}

type HandshakeOptions = {
  timeoutMs?: number
  remoteCommand?: readonly string[]
  localVersionCommand?: readonly string[]
}

type CommandResult = { exitCode: number; stdout: string; stderr: string }

function localVersionCommand(command?: readonly string[]) {
  return command ?? [resolveCodexExecutable(), "--version"]
}

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

async function readBoundedText(stream: ReadableStream<Uint8Array>, maximumBytes = 64 * 1024) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let remaining = maximumBytes
  let output = ""
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

async function runCommand(
  command: readonly string[],
  signal: AbortSignal,
  missingExecutableIsCodex = false,
): Promise<CommandResult> {
  signal.throwIfAborted()
  let process: ReturnType<typeof Bun.spawn>
  try {
    process = Bun.spawn([...command], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  } catch {
    if (missingExecutableIsCodex) return { exitCode: 127, stdout: "", stderr: "" }
    throw new RemoteCodexHandshakeError("sshUnavailable")
  }
  const stop = () => process.kill()
  signal.addEventListener("abort", stop, { once: true })
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      readBoundedText(process.stdout as ReadableStream<Uint8Array>),
      readBoundedText(process.stderr as ReadableStream<Uint8Array>),
    ])
    signal.throwIfAborted()
    return { exitCode, stdout, stderr }
  } finally {
    signal.removeEventListener("abort", stop)
    if (process.exitCode === null) process.kill()
  }
}

function processFailure(exitCode: number, stderr: string) {
  const normalized = stderr.toLowerCase()
  if (normalized.includes("host key verification failed"))
    return new RemoteCodexHandshakeError("hostKey")
  if (normalized.includes("permission denied") || normalized.includes("no authentication methods"))
    return new RemoteCodexHandshakeError("authentication")
  if (
    normalized.includes("connection refused") ||
    normalized.includes("no route to host") ||
    normalized.includes("could not resolve hostname") ||
    normalized.includes("operation timed out") ||
    normalized.includes("connection timed out")
  )
    return new RemoteCodexHandshakeError("unreachable")
  if (exitCode === 127) return new RemoteCodexHandshakeError("codexMissing")
  if (exitCode === 72) return new RemoteCodexHandshakeError("directoryMissing")
  if (exitCode === 73) return new RemoteCodexHandshakeError("appServerStartFailed")
  if (exitCode === 75) return new RemoteCodexHandshakeError("codexUnauthenticated")
  return new RemoteCodexHandshakeError("disconnected")
}

async function nextProxyResponse(transport: CodexProxyWebSocket, id: string, signal: AbortSignal) {
  while (true) {
    const value = await transport.nextMessage(signal)
    try {
      const message = object(JSON.parse(value))
      if (message?.id === id) return message
    } catch {
      throw new RemoteCodexHandshakeError("protocolIncompatible")
    }
  }
}

async function stopProxy(process: HandshakeProcess, stderr: Promise<string>) {
  try {
    process.stdin.end()
  } catch {
    // A disconnected proxy may already have closed stdin.
  }
  if (process.exitCode === null) process.kill()
  await Promise.allSettled([process.exited, stderr])
}

async function initializeProxy(command: readonly string[], profileId: string, signal: AbortSignal) {
  let process: HandshakeProcess
  try {
    process = Bun.spawn([...command], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }) as unknown as HandshakeProcess
  } catch {
    throw new RemoteCodexHandshakeError("sshUnavailable")
  }
  const stderr = readBoundedText(process.stderr)
  const requestId = `tuiminal-remote-handshake:${profileId}`
  let transport: CodexProxyWebSocket | null = null
  try {
    transport = await CodexProxyWebSocket.connect(process, signal)
    await transport.send(
      JSON.stringify({
        id: requestId,
        method: "initialize",
        params: {
          clientInfo: { name: "tuiminal", title: "Tuiminal", version: "1" },
          capabilities: null,
        },
      }),
    )
    const message = await nextProxyResponse(transport, requestId, signal)
    if (message.error !== undefined) throw new RemoteCodexHandshakeError("initializeRejected")
    const userAgent = object(message.result)?.userAgent
    const remoteVersion = typeof userAgent === "string" ? parseCodexVersion(userAgent)?.value : null
    if (typeof userAgent !== "string" || !remoteVersion)
      throw new RemoteCodexHandshakeError("protocolIncompatible")
    await transport.send(JSON.stringify({ method: "initialized", params: {} }))
    return { remoteVersion, remoteUserAgent: userAgent }
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (error instanceof CodexProxyDisconnectedError || process.exitCode !== null) {
      const exitCode = process.exitCode ?? (await process.exited)
      throw processFailure(exitCode, await stderr)
    }
    if (error instanceof RemoteCodexHandshakeError) throw error
    throw new RemoteCodexHandshakeError("protocolIncompatible")
  } finally {
    transport?.stop()
    await stopProxy(process, stderr)
  }
}

async function withDeadline<T>(
  signal: AbortSignal,
  timeoutMs: number,
  operation: (deadline: AbortSignal) => Promise<T>,
) {
  signal.throwIfAborted()
  const timeout = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    timeout.abort(new DOMException("Remote Codex preflight timed out", "TimeoutError"))
  }, timeoutMs)
  try {
    return await operation(AbortSignal.any([signal, timeout.signal]))
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (timedOut) throw new RemoteCodexHandshakeError("timeout")
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function checkedRemoteCompatibility(remoteResult: CommandResult) {
  if (remoteResult.exitCode === 72) throw new RemoteCodexHandshakeError("directoryMissing")
  if (![0, 74, 75, 127].includes(remoteResult.exitCode))
    throw processFailure(remoteResult.exitCode, remoteResult.stderr)
  if (remoteResult.exitCode === 127)
    return {
      version: null,
      daemonAvailable: false,
      proxyAvailable: false,
      reason: "remoteCodexMissing" as const,
    }
  if (remoteResult.exitCode === 74)
    return {
      version: null,
      daemonAvailable: false,
      proxyAvailable: false,
      reason: "remoteVersionInvalid" as const,
    }
  return remoteCodexCompatibility(remoteResult.stdout)
}

function checkedCompatibilityReport(localResult: CommandResult, remoteResult: CommandResult) {
  const local = checkedLocalCompatibility(localResult)
  const report = remoteCodexCompatibilityReport(local, checkedRemoteCompatibility(remoteResult))
  if (!report.compatible) throw new RemoteCodexCompatibilityError(report)
  if (remoteResult.exitCode === 75) throw new RemoteCodexHandshakeError("codexUnauthenticated")
  return report
}

function checkedLocalCompatibility(result: CommandResult) {
  return localCodexCompatibility(result.exitCode, result.stdout, result.stderr)
}

function checkedInitializedReport(
  report: RemoteCodexCompatibilityReport,
  initialized: Awaited<ReturnType<typeof initializeProxy>>,
) {
  if (
    !report.localVersion ||
    compatibleCodexVersions(report.localVersion, initialized.remoteVersion)
  )
    return { ...report, ...initialized }
  throw new RemoteCodexCompatibilityError({
    ...report,
    compatible: false,
    reason: "versionMismatch",
    remoteVersion: initialized.remoteVersion,
    remoteUserAgent: initialized.remoteUserAgent,
  })
}

/** Validates both CLIs, starts the persistent daemon, and probes it through a disposable proxy. */
export async function preflightRemoteCodex(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
  signal: AbortSignal,
  options: PreflightOptions = {},
) {
  return withDeadline(
    signal,
    options.timeoutMs ?? REMOTE_CODEX_HANDSHAKE_TIMEOUT_MS,
    async (deadline) => {
      const launch = createRemoteCodexAppServerLaunch(profile, workingDirectory)
      const [localResult, remoteResult] = await Promise.all([
        runCommand(localVersionCommand(options.localVersionCommand), deadline, true),
        runCommand(
          options.remoteProbeCommand ?? remoteCodexPreflightSshCommand(profile, workingDirectory),
          deadline,
        ),
      ])
      const report = checkedCompatibilityReport(localResult, remoteResult)
      const daemon = await runCommand(
        options.daemonStartCommand ?? launch.daemonStartCommand,
        deadline,
      )
      if (daemon.exitCode !== 0) throw processFailure(daemon.exitCode, daemon.stderr)
      const initialized = await initializeProxy(
        options.proxyCommand ?? launch.proxyCommand,
        profile.id,
        deadline,
      )
      return checkedInitializedReport(report, initialized)
    },
  )
}

export async function handshakeRemoteCodex(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
  signal: AbortSignal,
  options: HandshakeOptions = {},
) {
  return withDeadline(
    signal,
    options.timeoutMs ?? REMOTE_CODEX_HANDSHAKE_TIMEOUT_MS,
    async (deadline) => {
      const [localResult, initialized] = await Promise.all([
        runCommand(localVersionCommand(options.localVersionCommand), deadline, true),
        initializeProxy(
          options.remoteCommand ?? remoteCodexProxySshCommand(profile, workingDirectory),
          profile.id,
          deadline,
        ),
      ])
      const local = checkedLocalCompatibility(localResult)
      if (!local.version) throw new RemoteCodexHandshakeError("localCodexUnavailable")
      return { localVersion: local.version, ...initialized }
    },
  )
}
