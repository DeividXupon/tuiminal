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
    "IFS= read -r OPENCODE_PASSWORD || exit 74",
    "OPENCODE_SERVER_PASSWORD=$OPENCODE_PASSWORD",
    "export OPENCODE_PASSWORD",
    "export OPENCODE_SERVER_PASSWORD",
    "unset OPENCODE_SERVER_USERNAME",
    `"$opencode_command" serve --hostname 127.0.0.1 --port ${remotePort} & opencode_pid=$!`,
    "ssh_parent_pid=$PPID",
    '(while kill -0 "$ssh_parent_pid" 2>/dev/null; do sleep 1; done; kill "$opencode_pid" 2>/dev/null) & ssh_watchdog_pid=$!',
    'trap \'kill "$opencode_pid" "$ssh_watchdog_pid" 2>/dev/null; wait "$opencode_pid" 2>/dev/null; wait "$ssh_watchdog_pid" 2>/dev/null\' EXIT HUP INT TERM',
    'wait "$opencode_pid"',
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

export function remoteOpenCodeVersionCommand(profile: TerminalRemoteCodexProfile) {
  const command = [...remoteOpenCodePrelude("/"), 'exec "$opencode_command" --version'].join("; ")
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
