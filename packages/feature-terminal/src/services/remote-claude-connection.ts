import { isClaudeSessionId } from "../model/claude-resume-threads"
import type { RemoteServerProfile } from "../model/sessions"
import { automatedSshPrefix, remotePosixShellCommand } from "./remote-ssh-command"

const MINIMUM_CLAUDE_VERSION = [2, 1, 63] as const
const MINIMUM_BACKGROUND_CLAUDE_VERSION = [2, 1, 285] as const

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function validateRemoteDirectory(value: string) {
  if (!value.startsWith("/") || value.length > 4_096 || /[\p{Cc}\p{Cf}]/u.test(value))
    throw new Error("O diretório remoto selecionado é inválido.")
}

function remoteClaudePrelude(workingDirectory: string) {
  validateRemoteDirectory(workingDirectory)
  return [
    "claude_command=$(command -v claude 2>/dev/null || true)",
    'if [ -z "$claude_command" ]; then for candidate in "$HOME/.local/bin/claude" "$HOME/.bun/bin/claude" "$HOME/.npm-global/bin/claude"; do if [ -x "$candidate" ]; then claude_command=$candidate; break; fi; done; fi',
    'if [ -z "$claude_command" ]; then exit 127; fi',
    `cd ${shellQuote(workingDirectory)} || exit 72`,
  ]
}

function sshPrefix(profile: RemoteServerProfile, tty: boolean) {
  return automatedSshPrefix(profile, { tty })
}

export function parseClaudeVersion(value: string) {
  const match = value.match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:\s|$)/u)
  return match ? ([Number(match[1]), Number(match[2]), Number(match[3])] as const) : null
}

export function claudeVersionAtLeast(value: string, minimum: readonly [number, number, number]) {
  const version = parseClaudeVersion(value)
  if (!version) return false
  const [major, minor, patch] = version
  const [minimumMajor, minimumMinor, minimumPatch] = minimum
  return (
    major > minimumMajor ||
    (major === minimumMajor && minor > minimumMinor) ||
    (major === minimumMajor && minor === minimumMinor && patch >= minimumPatch)
  )
}

export function supportedClaudeVersion(value: string) {
  return claudeVersionAtLeast(value, MINIMUM_CLAUDE_VERSION)
}

/** Remote persistence relies on `--resume` attaching to a running background session. */
export function supportedClaudeBackgroundSessions(value: string) {
  return claudeVersionAtLeast(value, MINIMUM_BACKGROUND_CLAUDE_VERSION)
}

/** Builds Claude's arguments; resume ids are validated so they can never be parsed as flags. */
export function claudeArguments(settings: string, resumeThreadId?: string) {
  if (resumeThreadId !== undefined && !isClaudeSessionId(resumeThreadId))
    throw new Error("A sessão do Claude Code selecionada é inválida.")
  return ["--settings", settings, ...(resumeThreadId ? ["--resume", resumeThreadId] : [])]
}

export function remoteClaudeVersionCommand(profile: RemoteServerProfile, workingDirectory: string) {
  const command = [
    ...remoteClaudePrelude(workingDirectory),
    'exec "$claude_command" --version',
  ].join("; ")
  return [...sshPrefix(profile, false), remotePosixShellCommand(command)]
}

export function remoteClaudeTerminalCommand(
  profile: RemoteServerProfile,
  workingDirectory: string,
  settings: string,
  resumeThreadId?: string,
) {
  const command = [
    ...remoteClaudePrelude(workingDirectory),
    `exec "$claude_command" ${claudeArguments(settings, resumeThreadId).map(shellQuote).join(" ")}`,
  ].join("; ")
  return [...sshPrefix(profile, true), remotePosixShellCommand(command)]
}

export function remoteClaudeBackgroundStartCommand(
  profile: RemoteServerProfile,
  workingDirectory: string,
  settings: string,
  sessionId: string,
  resume = false,
) {
  if (!isClaudeSessionId(sessionId))
    throw new Error("A sessão do Claude Code selecionada é inválida.")
  const arguments_ = [
    "--settings",
    settings,
    ...(resume ? ["--resume", sessionId] : ["--session-id", sessionId]),
    "--bg",
  ]
  const command = [
    ...remoteClaudePrelude(workingDirectory),
    `exec "$claude_command" ${arguments_.map(shellQuote).join(" ")}`,
  ].join("; ")
  return [...sshPrefix(profile, false), remotePosixShellCommand(command)]
}

function validateBackgroundId(value: string) {
  if (!/^[\da-z-]{1,64}$/iu.test(value))
    throw new Error("A sessão em segundo plano do Claude Code é inválida.")
}

export function remoteClaudeAttachCommand(
  profile: RemoteServerProfile,
  workingDirectory: string,
  shortId: string,
) {
  validateBackgroundId(shortId)
  const command = [
    ...remoteClaudePrelude(workingDirectory),
    `exec "$claude_command" attach ${shellQuote(shortId)}`,
  ].join("; ")
  return [...sshPrefix(profile, true), remotePosixShellCommand(command)]
}

export function remoteClaudeAgentsCommand(profile: RemoteServerProfile, workingDirectory?: string) {
  const directory = workingDirectory ?? "/"
  const command = [
    ...remoteClaudePrelude(directory),
    `exec "$claude_command" agents --json --all${
      workingDirectory ? ` --cwd ${shellQuote(workingDirectory)}` : ""
    }`,
  ].join("; ")
  return [...sshPrefix(profile, false), remotePosixShellCommand(command)]
}

export function remoteClaudeStopCommand(
  profile: RemoteServerProfile,
  workingDirectory: string,
  shortId: string,
) {
  validateBackgroundId(shortId)
  validateRemoteDirectory(workingDirectory)
  const command = [
    ...remoteClaudePrelude("/"),
    `exec "$claude_command" stop ${shellQuote(shortId)}`,
  ].join("; ")
  return [...sshPrefix(profile, false), remotePosixShellCommand(command)]
}

export function remoteClaudeTunnelCommand(profile: RemoteServerProfile, localPort: number) {
  return [
    ...automatedSshPrefix(profile, { forwarding: "tunnel", verbose: true }).slice(0, -1),
    "-N",
    "-o",
    "ExitOnForwardFailure=yes",
    "-R",
    `127.0.0.1:0:127.0.0.1:${localPort}`,
    profile.host,
  ]
}
