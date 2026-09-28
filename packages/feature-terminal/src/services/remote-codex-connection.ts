import {
  type TerminalRemoteCodexProfile,
  terminalRemoteProfileValidationError,
} from "@xupon/tuiminal-core/settings/theme"

const SSH_TEST_MARKER = "TUIMINAL_SSH_OK"

export type RemoteCodexConnectionTestCode =
  | "connected"
  | "invalidProfile"
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

function remoteSshPrefix(profile: TerminalRemoteCodexProfile, tty: boolean) {
  return [
    "ssh",
    tty ? "-tt" : "-T",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    profile.host,
  ]
}

export function remoteNonInteractiveSshCommand(
  profile: TerminalRemoteCodexProfile,
  command: string,
) {
  const ssh = remoteSshPrefix(profile, false)
  ssh.splice(2, 0, "-o", "BatchMode=yes")
  return [...ssh, command]
}

export function remoteInteractiveSshCommand(profile: TerminalRemoteCodexProfile) {
  return remoteSshPrefix(profile, true)
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export function remoteCodexAppServerSshCommand(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
) {
  if (
    !workingDirectory.startsWith("/") ||
    workingDirectory.length > 4_096 ||
    /[\p{Cc}\p{Cf}]/u.test(workingDirectory)
  )
    throw new Error("O diretório remoto selecionado é inválido.")
  const command = [
    "codex_command=$(command -v codex 2>/dev/null || true)",
    'if [ -z "$codex_command" ]; then for candidate in "$HOME/.local/bin/codex" "$HOME/.bun/bin/codex" "$HOME/.npm-global/bin/codex"; do if [ -x "$candidate" ]; then codex_command=$candidate; break; fi; done; fi',
    'if [ -z "$codex_command" ]; then exit 127; fi',
    `cd ${shellQuote(workingDirectory)} || exit 72`,
    'exec "$codex_command" app-server --stdio',
  ].join("; ")
  return remoteNonInteractiveSshCommand(profile, command)
}

/** Connects the local official TUI to an owned remote app-server in its remote cwd. */
export function remoteCodexTuiCommand(
  relayUrl: string,
  workingDirectory: string,
  resumeThreadId?: string,
) {
  if (
    !workingDirectory.startsWith("/") ||
    workingDirectory.length > 4_096 ||
    /[\p{Cc}\p{Cf}]/u.test(workingDirectory)
  )
    throw new Error("O diretório remoto selecionado é inválido.")
  return resumeThreadId
    ? ["codex", "resume", resumeThreadId, "--remote", relayUrl, "-C", workingDirectory]
    : ["codex", "--remote", relayUrl, "-C", workingDirectory]
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
    profile.host,
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
