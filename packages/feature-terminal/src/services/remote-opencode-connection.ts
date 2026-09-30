import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function validateRemoteDirectory(value: string) {
  if (!value.startsWith("/") || value.length > 4_096 || /[\p{Cc}\p{Cf}]/u.test(value))
    throw new Error("O diretório remoto selecionado é inválido.")
}

function remoteOpenCodePrelude(workingDirectory: string) {
  validateRemoteDirectory(workingDirectory)
  return [
    "opencode_command=$(command -v opencode 2>/dev/null || true)",
    'if [ -z "$opencode_command" ]; then for candidate in "$HOME/.opencode/bin/opencode" "$HOME/.local/bin/opencode" "$HOME/.bun/bin/opencode" "$HOME/.npm-global/bin/opencode"; do if [ -x "$candidate" ]; then opencode_command=$candidate; break; fi; done; fi',
    'if [ -z "$opencode_command" ]; then exit 127; fi',
    `cd ${shellQuote(workingDirectory)} || exit 72`,
  ]
}

export function remoteOpenCodeServerCommand(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
  localPort: number,
  remotePort = localPort,
) {
  const command = [
    ...remoteOpenCodePrelude(workingDirectory),
    "unset OPENCODE_SERVER_PASSWORD",
    `exec "$opencode_command" serve --hostname 127.0.0.1 --port ${remotePort}`,
  ].join("; ")
  return [
    "ssh",
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ConnectionAttempts=1",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "ExitOnForwardFailure=yes",
    "-L",
    `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
    profile.host,
    command,
  ]
}

export function remoteOpenCodeSessionListCommand(
  profile: TerminalRemoteCodexProfile,
  maximum = 20,
) {
  const command = [
    ...remoteOpenCodePrelude("/"),
    `exec "$opencode_command" session list --format json --max-count ${Math.max(1, Math.floor(maximum))}`,
  ].join("; ")
  return [
    "ssh",
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ConnectionAttempts=1",
    profile.host,
    command,
  ]
}
