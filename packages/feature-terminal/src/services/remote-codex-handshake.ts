import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { remoteCodexAppServerSshCommand } from "./remote-codex-connection"

type RecordValue = Record<string, unknown>

export type RemoteCodexHandshakeErrorCode =
  | "sshUnavailable"
  | "hostKey"
  | "authentication"
  | "unreachable"
  | "codexMissing"
  | "directoryMissing"
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
  appServerStartFailed: "O app-server do Codex não iniciou no servidor remoto.",
  initializeRejected: "O Codex remoto rejeitou o handshake initialize.",
  protocolIncompatible: "A resposta initialize do Codex remoto é incompatível.",
  localCodexUnavailable: "Não foi possível verificar a versão local do Codex.",
  timeout: "O handshake remoto do Codex excedeu o tempo limite.",
  disconnected: "O Codex remoto encerrou antes de responder ao handshake.",
}

export const REMOTE_CODEX_HANDSHAKE_TIMEOUT_MS = 10_000

export class RemoteCodexHandshakeError extends Error {
  constructor(readonly code: RemoteCodexHandshakeErrorCode) {
    super(ERROR_MESSAGES[code])
    this.name = "RemoteCodexHandshakeError"
  }
}

type RemoteCodexHandshakeOptions = {
  timeoutMs?: number
  remoteCommand?: readonly string[]
  localVersionCommand?: readonly string[]
}

type ParsedVersion = {
  value: string
}

type HandshakeProcess = {
  exitCode: number | null
  stdin: { write(value: string | Uint8Array): number | Promise<number>; end(): void }
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
  exited: Promise<number>
  kill(signal?: string | number): void
}

class RemoteCodexProcessEnded extends Error {}

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

function parseCodexVersion(value: string): ParsedVersion | null {
  const match = value.match(/(?:^|[^\d])(\d+)\.(\d+)\.(\d+)(?:[-+][\d.A-Za-z-]+)?/u)
  if (!match?.[1] || !match[2] || !match[3]) return null
  return {
    value: `${match[1]}.${match[2]}.${match[3]}`,
  }
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

async function waitForExit(process: HandshakeProcess, signal: AbortSignal) {
  if (process.exitCode !== null) return process.exitCode
  signal.throwIfAborted()
  return new Promise<number>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    const cleanup = () => signal.removeEventListener("abort", onAbort)
    signal.addEventListener("abort", onAbort, { once: true })
    process.exited.then(
      (code) => {
        cleanup()
        resolve(code)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

async function nextJsonlResponse(
  stream: ReadableStream<Uint8Array>,
  id: string,
  signal: AbortSignal,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffered = ""
  const onAbort = () => void reader.cancel(signal.reason).catch(() => undefined)
  signal.addEventListener("abort", onAbort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const newline = buffered.indexOf("\n")
      if (newline >= 0) {
        const line = buffered.slice(0, newline).replace(/\r$/u, "")
        buffered = buffered.slice(newline + 1)
        if (!line) continue
        try {
          const message = object(JSON.parse(line))
          if (message?.id === id) return message
        } catch {
          // SSH banners and unrelated malformed lines are not protocol responses.
        }
        continue
      }
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) throw new RemoteCodexProcessEnded()
      buffered += decoder.decode(chunk.value, { stream: true })
      if (buffered.length > 1024 * 1024) throw new RemoteCodexHandshakeError("protocolIncompatible")
    }
  } finally {
    signal.removeEventListener("abort", onAbort)
    reader.releaseLock()
  }
}

async function localCodexVersion(command: readonly string[], signal: AbortSignal) {
  signal.throwIfAborted()
  let process: ReturnType<typeof Bun.spawn>
  try {
    process = Bun.spawn([...command], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  } catch {
    throw new RemoteCodexHandshakeError("localCodexUnavailable")
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
    const version = parseCodexVersion(`${stdout}\n${stderr}`)
    if (exitCode !== 0 || !version) throw new RemoteCodexHandshakeError("localCodexUnavailable")
    return version.value
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
  return new RemoteCodexHandshakeError("disconnected")
}

async function stopHandshakeProcess(process: HandshakeProcess, stderr: Promise<string>) {
  try {
    process.stdin.end()
  } catch {
    // The remote app-server may already have closed stdin.
  }
  if (process.exitCode === null) process.kill()
  await Promise.allSettled([process.exited, stderr])
}

async function exchangeInitialize(
  process: HandshakeProcess,
  profileId: string,
  localVersion: Promise<string>,
  signal: AbortSignal,
) {
  const requestId = `tuiminal-remote-handshake:${profileId}`
  await Promise.resolve(
    process.stdin.write(
      `${JSON.stringify({
        id: requestId,
        method: "initialize",
        params: {
          clientInfo: { name: "tuiminal", title: "Tuiminal", version: "1" },
          capabilities: null,
        },
      })}\n`,
    ),
  )
  const [message, local] = await Promise.all([
    nextJsonlResponse(process.stdout, requestId, signal),
    localVersion,
  ])
  if (message.error !== undefined) throw new RemoteCodexHandshakeError("initializeRejected")
  const userAgent = object(message.result)?.userAgent
  if (typeof userAgent !== "string") throw new RemoteCodexHandshakeError("protocolIncompatible")
  const remote = parseCodexVersion(userAgent)?.value
  if (!remote) throw new RemoteCodexHandshakeError("protocolIncompatible")
  await Promise.resolve(
    process.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`),
  )
  return { localVersion: local, remoteVersion: remote, remoteUserAgent: userAgent }
}

async function throwHandshakeFailure(
  error: unknown,
  process: HandshakeProcess,
  stderr: Promise<string>,
  signal: AbortSignal,
  deadline: AbortSignal,
  timedOut: boolean,
): Promise<never> {
  if (signal.aborted) signal.throwIfAborted()
  if (timedOut) throw new RemoteCodexHandshakeError("timeout")
  if (!(error instanceof RemoteCodexProcessEnded)) throw error
  try {
    const exitCode = await waitForExit(process, deadline)
    throw processFailure(exitCode, await stderr)
  } catch (exitError) {
    if (signal.aborted) signal.throwIfAborted()
    if (timedOut || deadline.aborted) throw new RemoteCodexHandshakeError("timeout")
    throw exitError
  }
}

/** Proves the remote app-server can answer the local CLI before the official TUI is opened. */
export async function handshakeRemoteCodex(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
  signal: AbortSignal,
  options: RemoteCodexHandshakeOptions = {},
) {
  signal.throwIfAborted()
  const remoteCommand = [
    ...(options.remoteCommand ?? remoteCodexAppServerSshCommand(profile, workingDirectory)),
  ]
  const timeout = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    timeout.abort(new DOMException("Remote Codex handshake timed out", "TimeoutError"))
  }, options.timeoutMs ?? REMOTE_CODEX_HANDSHAKE_TIMEOUT_MS)
  const deadline = AbortSignal.any([signal, timeout.signal])

  let process: HandshakeProcess
  try {
    process = Bun.spawn(remoteCommand, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }) as unknown as HandshakeProcess
  } catch {
    clearTimeout(timer)
    throw new RemoteCodexHandshakeError("sshUnavailable")
  }
  const localVersionPromise = localCodexVersion(
    options.localVersionCommand ?? ["codex", "--version"],
    deadline,
  )
  const stderr = readBoundedText(process.stderr)
  try {
    return await exchangeInitialize(process, profile.id, localVersionPromise, deadline)
  } catch (error) {
    return await throwHandshakeFailure(error, process, stderr, signal, deadline, timedOut)
  } finally {
    clearTimeout(timer)
    await stopHandshakeProcess(process, stderr)
  }
}
