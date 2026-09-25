import { existsSync, statSync } from "node:fs"
import {
  terminalRemoteProfileValidationError,
  type TerminalRemoteCodexProfile,
} from "@xupon/tuiminal-core/settings/theme"
import { resolveRemoteIdentityFile } from "./remote-codex-connection"

const RESULT_PREFIX = "TUIMINAL_REMOTE_READY"

export type RemoteServerBarrierId = "githubSsh" | "codex"

export type RemoteServerBarrierCode =
  | "ready"
  | "gitMissing"
  | "sshMissing"
  | "hostKey"
  | "authentication"
  | "unreachable"
  | "codexMissing"
  | "codexUnauthenticated"
  | "invalidProfile"
  | "identityMissing"
  | "timeout"
  | "cancelled"
  | "sshUnavailable"
  | "failed"

export type RemoteServerBarrierResult = {
  id: RemoteServerBarrierId
  ready: boolean
  code: RemoteServerBarrierCode
}

export type RemoteServerReadinessReport = Record<RemoteServerBarrierId, RemoteServerBarrierResult>

export const REMOTE_SERVER_BARRIER_ORDER: readonly RemoteServerBarrierId[] = ["githubSsh", "codex"]

export function nextRemoteServerBarrier(report: RemoteServerReadinessReport) {
  return REMOTE_SERVER_BARRIER_ORDER.find((id) => !report[id].ready) ?? null
}

type RemoteServerReadinessOptions = {
  executable?: string | readonly string[]
  timeoutMs?: number
}

const GITHUB_SSH_CHECK = [
  "LC_ALL=C; export LC_ALL",
  `if ! command -v git >/dev/null 2>&1; then printf '${RESULT_PREFIX}:githubSsh:gitMissing\\n'; exit 0; fi`,
  `if ! command -v ssh >/dev/null 2>&1; then printf '${RESULT_PREFIX}:githubSsh:sshMissing\\n'; exit 0; fi`,
  "output=$(ssh -T -o BatchMode=yes -o ConnectTimeout=6 -o ConnectionAttempts=1 git@github.com 2>&1)",
  [
    'case "$output" in',
    '  *"successfully authenticated"*) code=ready ;;',
    '  *"Host key verification failed"*) code=hostKey ;;',
    '  *"Permission denied"*) code=authentication ;;',
    '  *"Could not resolve hostname"*|*"Connection timed out"*|*"Connection refused"*|*"No route to host"*) code=unreachable ;;',
    "  *) code=failed ;;",
    "esac",
  ].join("\n"),
  `printf '${RESULT_PREFIX}:githubSsh:%s\\n' "$code"`,
].join("; ")

const CODEX_CHECK = [
  "codex_command=$(command -v codex 2>/dev/null || true)",
  'if [ -z "$codex_command" ]; then for candidate in "$HOME/.local/bin/codex" "$HOME/.bun/bin/codex" "$HOME/.npm-global/bin/codex"; do if [ -x "$candidate" ]; then codex_command=$candidate; break; fi; done; fi',
  `if [ -z "$codex_command" ]; then printf '${RESULT_PREFIX}:codex:codexMissing\\n'; exit 0; fi`,
  `if "$codex_command" login status >/dev/null 2>&1; then printf '${RESULT_PREFIX}:codex:ready\\n'; else printf '${RESULT_PREFIX}:codex:codexUnauthenticated\\n'; fi`,
].join("; ")

const BARRIER_COMMANDS: Record<RemoteServerBarrierId, string> = {
  githubSsh: GITHUB_SSH_CHECK,
  codex: CODEX_CHECK,
}

function executableArguments(options: RemoteServerReadinessOptions) {
  return Array.isArray(options.executable) ? [...options.executable] : [options.executable ?? "ssh"]
}

export function remoteServerBarrierCheckCommand(
  profile: TerminalRemoteCodexProfile,
  barrier: RemoteServerBarrierId,
  options: RemoteServerReadinessOptions = {},
) {
  const timeoutSeconds = Math.max(1, Math.ceil((options.timeoutMs ?? 10_000) / 1_000))
  return [
    ...executableArguments(options),
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
    BARRIER_COMMANDS[barrier],
  ]
}

function result(
  id: RemoteServerBarrierId,
  code: RemoteServerBarrierCode,
): RemoteServerBarrierResult {
  return { id, ready: code === "ready", code }
}

function connectionFailure(id: RemoteServerBarrierId, stderr: string) {
  const normalized = stderr.toLowerCase()
  if (normalized.includes("host key verification failed")) return result(id, "hostKey")
  if (normalized.includes("permission denied") || normalized.includes("no authentication methods"))
    return result(id, "authentication")
  if (
    normalized.includes("connection refused") ||
    normalized.includes("no route to host") ||
    normalized.includes("could not resolve hostname") ||
    normalized.includes("operation timed out") ||
    normalized.includes("connection timed out")
  )
    return result(id, "unreachable")
  return result(id, "failed")
}

function parseBarrierResult(id: RemoteServerBarrierId, stdout: string) {
  const marker = `${RESULT_PREFIX}:${id}:`
  const line = stdout.split(/\r?\n/u).find((candidate) => candidate.startsWith(marker))
  if (!line) return null
  const code = line.slice(marker.length) as RemoteServerBarrierCode
  const supported: readonly RemoteServerBarrierCode[] = [
    "ready",
    "gitMissing",
    "sshMissing",
    "hostKey",
    "authentication",
    "unreachable",
    "codexMissing",
    "codexUnauthenticated",
    "failed",
  ]
  return supported.includes(code) ? result(id, code) : null
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

export async function checkRemoteServerBarrier(
  profile: TerminalRemoteCodexProfile,
  id: RemoteServerBarrierId,
  signal?: AbortSignal,
  options: RemoteServerReadinessOptions = {},
): Promise<RemoteServerBarrierResult> {
  if (terminalRemoteProfileValidationError(profile)) return result(id, "invalidProfile")
  const identityFile = resolveRemoteIdentityFile(profile.identityFile)
  try {
    if (!existsSync(identityFile) || !statSync(identityFile).isFile())
      return result(id, "identityMissing")
  } catch {
    return result(id, "identityMissing")
  }
  if (signal?.aborted) return result(id, "cancelled")

  const timeoutMs = options.timeoutMs ?? 10_000
  let timedOut = false
  let child: ReturnType<typeof Bun.spawn>
  try {
    child = Bun.spawn(remoteServerBarrierCheckCommand(profile, id, options), {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
  } catch {
    return result(id, "sshUnavailable")
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
    if (signal?.aborted) return result(id, "cancelled")
    if (timedOut) return result(id, "timeout")
    const parsed = parseBarrierResult(id, stdout)
    if (exitCode === 0 && parsed) return parsed
    return connectionFailure(id, stderr)
  } catch {
    if (signal?.aborted) return result(id, "cancelled")
    if (timedOut) return result(id, "timeout")
    return result(id, "failed")
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", stop)
  }
}

export async function checkRemoteServerReadiness(
  profile: TerminalRemoteCodexProfile,
  signal?: AbortSignal,
  options: RemoteServerReadinessOptions = {},
): Promise<RemoteServerReadinessReport> {
  const [githubSsh, codex] = await Promise.all([
    checkRemoteServerBarrier(profile, "githubSsh", signal, options),
    checkRemoteServerBarrier(profile, "codex", signal, options),
  ])
  return { githubSsh, codex }
}
