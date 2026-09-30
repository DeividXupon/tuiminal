import {
  type TerminalRemoteCodexProfile,
  terminalRemoteProfileValidationError,
} from "@xupon/tuiminal-core/settings/theme"

const SSH_TEST_MARKER = "TUIMINAL_SSH_OK"
export const REMOTE_CODEX_PREFLIGHT_MARKER = "TUIMINAL_CODEX_PREFLIGHT_V1"

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
  ssh.splice(2, 0, "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1")
  return [...ssh, command]
}

export function remoteInteractiveSshCommand(profile: TerminalRemoteCodexProfile) {
  return remoteSshPrefix(profile, true)
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function validateRemoteWorkingDirectory(workingDirectory: string) {
  if (
    !workingDirectory.startsWith("/") ||
    workingDirectory.length > 4_096 ||
    /[\p{Cc}\p{Cf}]/u.test(workingDirectory)
  )
    throw new Error("O diretório remoto selecionado é inválido.")
}

function remoteCodexPrelude(workingDirectory: string) {
  validateRemoteWorkingDirectory(workingDirectory)
  return [
    "codex_command=$(command -v codex 2>/dev/null || true)",
    'if [ -z "$codex_command" ]; then for candidate in "$HOME/.local/bin/codex" "$HOME/.codex/packages/standalone/current/bin/codex" "$HOME/.bun/bin/codex" "$HOME/.npm-global/bin/codex"; do if [ -x "$candidate" ]; then codex_command=$candidate; break; fi; done; fi',
    'if [ -z "$codex_command" ]; then exit 127; fi',
    `cd ${shellQuote(workingDirectory)} || exit 72`,
  ]
}

export function remoteCodexPreflightSshCommand(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
) {
  const command = [
    ...remoteCodexPrelude(workingDirectory),
    'version_output=$("$codex_command" --version 2>&1) || exit 74',
    'if "$codex_command" app-server daemon --help >/dev/null 2>&1; then daemon=1; else daemon=0; fi',
    'if "$codex_command" app-server proxy --help >/dev/null 2>&1; then proxy=1; else proxy=0; fi',
    'if "$codex_command" login status >/dev/null 2>&1; then authenticated=1; else authenticated=0; fi',
    `printf '${REMOTE_CODEX_PREFLIGHT_MARKER}\\nVERSION\\n%s\\nDAEMON=%s\\nPROXY=%s\\nAUTH=%s\\n' "$version_output" "$daemon" "$proxy" "$authenticated"`,
    '[ "$authenticated" = 1 ] || exit 75',
  ].join("; ")
  return remoteNonInteractiveSshCommand(profile, command)
}

export function remoteCodexDaemonStartSshCommand(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
) {
  const command = [
    ...remoteCodexPrelude(workingDirectory),
    '"$codex_command" app-server daemon start </dev/null >/dev/null 2>&1 || exit 73',
  ].join("; ")
  return remoteNonInteractiveSshCommand(profile, command)
}

export function remoteCodexProxySshCommand(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
) {
  const command = [
    ...remoteCodexPrelude(workingDirectory),
    'exec "$codex_command" app-server proxy',
  ].join("; ")
  return remoteNonInteractiveSshCommand(profile, command)
}

export function createRemoteCodexAppServerLaunch(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
) {
  return {
    daemonStartCommand: remoteCodexDaemonStartSshCommand(profile, workingDirectory),
    proxyCommand: remoteCodexProxySshCommand(profile, workingDirectory),
  }
}

export function remoteCodexAppServerSshCommand(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
) {
  const command = [
    ...remoteCodexPrelude(workingDirectory),
    '"$codex_command" app-server daemon start </dev/null >/dev/null 2>&1 || exit 73',
    'exec "$codex_command" app-server proxy',
  ].join("; ")
  return remoteNonInteractiveSshCommand(profile, command)
}

/** Connects the local official TUI to an owned remote proxy in its remote cwd. */
export function remoteCodexTuiCommand(
  relayUrl: string,
  workingDirectory: string,
  resumeThreadId?: string,
  executable = "codex",
) {
  validateRemoteWorkingDirectory(workingDirectory)
  return resumeThreadId
    ? [executable, "resume", resumeThreadId, "--remote", relayUrl, "-C", workingDirectory]
    : [executable, "--remote", relayUrl, "-C", workingDirectory]
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
