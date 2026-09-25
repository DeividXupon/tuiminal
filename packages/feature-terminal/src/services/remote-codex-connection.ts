import { existsSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import {
  terminalRemoteProfileValidationError,
  type TerminalRemoteCodexProfile,
} from "@xupon/tuiminal-core/settings/theme"

const SSH_TEST_MARKER = "TUIMINAL_SSH_OK"

export type RemoteCodexConnectionTestCode =
  | "connected"
  | "invalidProfile"
  | "identityMissing"
  | "hostKey"
  | "authentication"
  | "unreachable"
  | "timeout"
  | "cancelled"
  | "sshUnavailable"
  | "failed"

export type RemoteCodexConnectionTestResult = {
  ok: boolean
  code: RemoteCodexConnectionTestCode
}

type RemoteCodexConnectionTestOptions = {
  executable?: string | readonly string[]
  timeoutMs?: number
}

export function resolveRemoteIdentityFile(value: string) {
  if (value === "~") return homedir()
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2))
  return resolve(value)
}

export function remoteCodexSshTestCommand(
  profile: TerminalRemoteCodexProfile,
  options: RemoteCodexConnectionTestOptions = {},
) {
  const timeoutSeconds = Math.max(1, Math.ceil((options.timeoutMs ?? 8_000) / 1_000))
  const executable = Array.isArray(options.executable)
    ? [...options.executable]
    : [options.executable ?? "ssh"]
  return [
    ...executable,
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${timeoutSeconds}`,
    "-o",
    "ConnectionAttempts=1",
    "-i",
    resolveRemoteIdentityFile(profile.identityFile),
    "-p",
    String(profile.port),
    `${profile.user}@${profile.host}`,
    `printf ${SSH_TEST_MARKER}`,
  ]
}

function failedConnectionResult(stderr: string): RemoteCodexConnectionTestResult {
  const normalized = stderr.toLowerCase()
  if (normalized.includes("host key verification failed")) return { ok: false, code: "hostKey" }
  if (normalized.includes("permission denied") || normalized.includes("no authentication methods"))
    return { ok: false, code: "authentication" }
  if (
    normalized.includes("connection refused") ||
    normalized.includes("no route to host") ||
    normalized.includes("could not resolve hostname") ||
    normalized.includes("operation timed out") ||
    normalized.includes("connection timed out")
  )
    return { ok: false, code: "unreachable" }
  return { ok: false, code: "failed" }
}

async function readBoundedOutput(stream: ReadableStream<Uint8Array>, maximumBytes = 8_192) {
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

export async function testRemoteCodexConnection(
  profile: TerminalRemoteCodexProfile,
  signal?: AbortSignal,
  options: RemoteCodexConnectionTestOptions = {},
): Promise<RemoteCodexConnectionTestResult> {
  if (terminalRemoteProfileValidationError(profile)) return { ok: false, code: "invalidProfile" }
  const identityFile = resolveRemoteIdentityFile(profile.identityFile)
  try {
    if (!existsSync(identityFile) || !statSync(identityFile).isFile())
      return { ok: false, code: "identityMissing" }
  } catch {
    return { ok: false, code: "identityMissing" }
  }
  if (signal?.aborted) return { ok: false, code: "cancelled" }

  const timeoutMs = options.timeoutMs ?? 8_000
  let timedOut = false
  let child: ReturnType<typeof Bun.spawn>
  try {
    child = Bun.spawn(remoteCodexSshTestCommand(profile, options), {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
  } catch {
    return { ok: false, code: "sshUnavailable" }
  }

  const stop = () => child.kill()
  const timeout = setTimeout(() => {
    timedOut = true
    stop()
  }, timeoutMs)
  signal?.addEventListener("abort", stop, { once: true })
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      readBoundedOutput(child.stdout as ReadableStream<Uint8Array>),
      readBoundedOutput(child.stderr as ReadableStream<Uint8Array>),
    ])
    if (signal?.aborted) return { ok: false, code: "cancelled" }
    if (timedOut) return { ok: false, code: "timeout" }
    if (exitCode === 0 && stdout.includes(SSH_TEST_MARKER)) return { ok: true, code: "connected" }
    return failedConnectionResult(stderr)
  } catch {
    if (signal?.aborted) return { ok: false, code: "cancelled" }
    if (timedOut) return { ok: false, code: "timeout" }
    return { ok: false, code: "failed" }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", stop)
  }
}
