import { createHash } from "node:crypto"
import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { automatedSshPrefix, remotePosixShellCommand } from "./remote-ssh-command"

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
  stateKey: string,
) {
  if (!/^[\da-f]{32}$/u.test(stateKey)) throw new Error("A chave do servidor OpenCode é inválida.")
  const command = [
    ...remoteOpenCodePrelude(workingDirectory),
    "umask 077",
    `state_root=\${XDG_STATE_HOME:-"$HOME/.local/state"}/tuiminal/opencode`,
    `state_dir="$state_root/${stateKey}"`,
    'mkdir -p "$state_dir" || exit 73',
    'chmod 700 "$state_root" "$state_dir" 2>/dev/null || true',
    'lock_dir="$state_dir/lock"',
    "lock_attempt=0",
    'while ! mkdir "$lock_dir" 2>/dev/null; do lock_pid=$(cat "$lock_dir/pid" 2>/dev/null || true); case "$lock_pid" in *[!0-9]*|"") lock_pid=;; esac; if [ -z "$lock_pid" ] || ! kill -0 "$lock_pid" 2>/dev/null; then rm -f "$lock_dir/pid" 2>/dev/null; rmdir "$lock_dir" 2>/dev/null || true; else lock_attempt=$((lock_attempt + 1)); [ "$lock_attempt" -lt 15 ] || exit 76; sleep 1; fi; done',
    'printf \'%s\\n\' "$$" >"$lock_dir/pid" || exit 76',
    'trap \'rm -f "$lock_dir/pid" 2>/dev/null; rmdir "$lock_dir" 2>/dev/null\' EXIT HUP INT TERM',
    'opencode_pid=$(cat "$state_dir/pid" 2>/dev/null || true)',
    'opencode_port=$(cat "$state_dir/port" 2>/dev/null || true)',
    'opencode_started=$(cat "$state_dir/started" 2>/dev/null || true)',
    'OPENCODE_PASSWORD=$(cat "$state_dir/password" 2>/dev/null || true)',
    'case "$OPENCODE_PASSWORD" in ????????-????-????-????-????????????) case "$OPENCODE_PASSWORD" in *[!0-9A-Fa-f-]*) OPENCODE_PASSWORD=;; esac;; *) OPENCODE_PASSWORD=;; esac',
    'case "$opencode_pid:$opencode_port" in *[!0-9:]*|:*) opencode_pid=; opencode_port=;; esac',
    'process_command=; if [ -n "$opencode_pid" ] && kill -0 "$opencode_pid" 2>/dev/null; then process_command=$(ps -p "$opencode_pid" -o command= 2>/dev/null || true); fi',
    'process_started=; if [ -n "$process_command" ]; then process_started=$(ps -p "$opencode_pid" -o lstart= 2>/dev/null || true); fi',
    'case "$process_command" in *opencode*serve*"--port $opencode_port"*) if [ -n "$opencode_started" ] && [ "$process_started" = "$opencode_started" ]; then opencode_running=1; else opencode_running=; fi;; *) opencode_running=;; esac',
    'if [ -n "$opencode_running" ] && [ -n "$opencode_port" ] && [ -n "$OPENCODE_PASSWORD" ]; then printf \'TUIMINAL_OPENCODE %s %s %s reused\\n\' "$opencode_port" "$OPENCODE_PASSWORD" "$opencode_pid"; exit 0; fi',
    'if [ -n "$opencode_running" ]; then kill "$opencode_pid" 2>/dev/null || true; fi',
    'rm -f "$state_dir/pid" "$state_dir/port" "$state_dir/password" "$state_dir/started"',
    "IFS= read -r OPENCODE_PASSWORD || exit 74",
    "IFS= read -r excluded_port || exit 74",
    'case "$excluded_port" in *[!0-9]*|"") exit 74;; esac',
    'if [ "$excluded_port" -lt 1024 ] || [ "$excluded_port" -gt 65535 ]; then exit 74; fi',
    "OPENCODE_SERVER_PASSWORD=$OPENCODE_PASSWORD",
    "export OPENCODE_PASSWORD OPENCODE_SERVER_PASSWORD",
    "unset OPENCODE_SERVER_USERNAME",
    'mv "$state_dir/server.log" "$state_dir/server.previous.log" 2>/dev/null || true',
    ': >"$state_dir/server.log" || exit 73',
    "start_attempt=0",
    'while [ "$start_attempt" -lt 8 ]; do start_attempt=$((start_attempt + 1)); random_value=$(od -An -N2 -tu2 /dev/urandom 2>/dev/null | tr -d \'[:space:]\'); case "$random_value" in *[!0-9]*|"") random_value=$((($$ + start_attempt * 7919) % 65536));; esac; opencode_port=$((20000 + random_value % 40000)); [ "$opencode_port" -ne "$excluded_port" ] || continue; nohup "$opencode_command" serve --hostname 127.0.0.1 --port "$opencode_port" </dev/null >>"$state_dir/server.log" 2>&1 & opencode_pid=$!; sleep 1; if kill -0 "$opencode_pid" 2>/dev/null; then opencode_started=$(ps -p "$opencode_pid" -o lstart= 2>/dev/null || true); if [ -n "$opencode_started" ]; then break; fi; kill "$opencode_pid" 2>/dev/null || true; fi; opencode_pid=; done',
    'if [ -z "$opencode_pid" ]; then rm -f "$state_dir/pid" "$state_dir/port" "$state_dir/password" "$state_dir/started"; exit 75; fi',
    'printf \'%s\\n\' "$OPENCODE_PASSWORD" >"$state_dir/password.tmp"',
    'printf \'%s\\n\' "$opencode_port" >"$state_dir/port.tmp"',
    'printf \'%s\\n\' "$opencode_pid" >"$state_dir/pid.tmp"',
    'printf \'%s\\n\' "$opencode_started" >"$state_dir/started.tmp"',
    'if ! (mv "$state_dir/password.tmp" "$state_dir/password" && mv "$state_dir/port.tmp" "$state_dir/port" && mv "$state_dir/pid.tmp" "$state_dir/pid" && mv "$state_dir/started.tmp" "$state_dir/started"); then kill "$opencode_pid" 2>/dev/null || true; rm -f "$state_dir/pid" "$state_dir/port" "$state_dir/password" "$state_dir/started" "$state_dir"/*.tmp; exit 73; fi',
    'printf \'TUIMINAL_OPENCODE %s %s %s created\\n\' "$opencode_port" "$OPENCODE_PASSWORD" "$opencode_pid"',
  ].join("; ")
  return [...automatedSshPrefix(profile), remotePosixShellCommand(command)]
}

export function remoteOpenCodeServerKey(workingDirectory: string, version = "") {
  validateRemoteDirectory(workingDirectory)
  return createHash("sha256")
    .update(workingDirectory)
    .update("\0")
    .update(version)
    .digest("hex")
    .slice(0, 32)
}

export function remoteOpenCodeTunnelCommand(
  profile: TerminalRemoteCodexProfile,
  localPort: number,
  remotePort: number,
) {
  return [
    ...automatedSshPrefix(profile, { forwarding: "tunnel" }).slice(0, -1),
    "-N",
    "-o",
    "ExitOnForwardFailure=yes",
    "-L",
    `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
    profile.host,
  ]
}

export function remoteOpenCodeStopServerCommand(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
  stateKey: string,
) {
  if (!/^[\da-f]{32}$/u.test(stateKey)) throw new Error("A chave do servidor OpenCode é inválida.")
  validateRemoteDirectory(workingDirectory)
  const command = [
    "cd / || exit 72",
    `state_root=\${XDG_STATE_HOME:-"$HOME/.local/state"}/tuiminal/opencode`,
    `state_dir="$state_root/${stateKey}"`,
    'opencode_pid=$(cat "$state_dir/pid" 2>/dev/null || true)',
    'opencode_port=$(cat "$state_dir/port" 2>/dev/null || true)',
    'opencode_started=$(cat "$state_dir/started" 2>/dev/null || true)',
    'case "$opencode_pid:$opencode_port" in *[!0-9:]*|:*) exit 0;; esac',
    'process_command=$(ps -p "$opencode_pid" -o command= 2>/dev/null || true)',
    'process_started=$(ps -p "$opencode_pid" -o lstart= 2>/dev/null || true)',
    'case "$process_command" in *opencode*serve*"--port $opencode_port"*) if [ -n "$opencode_started" ] && [ "$process_started" = "$opencode_started" ]; then kill "$opencode_pid" 2>/dev/null || true; fi;; esac',
    'rm -f "$state_dir/pid" "$state_dir/port" "$state_dir/password" "$state_dir/started"',
  ].join("; ")
  return [...automatedSshPrefix(profile), remotePosixShellCommand(command)]
}

export function remoteOpenCodeSessionListCommand(
  profile: TerminalRemoteCodexProfile,
  maximum = 20,
) {
  const command = [
    ...remoteOpenCodePrelude("/"),
    `exec "$opencode_command" session list --format json --max-count ${Math.max(1, Math.floor(maximum))}`,
  ].join("; ")
  return [...automatedSshPrefix(profile), remotePosixShellCommand(command)]
}

export function remoteOpenCodeVersionCommand(profile: TerminalRemoteCodexProfile) {
  const command = [...remoteOpenCodePrelude("/"), 'exec "$opencode_command" --version'].join("; ")
  return [...automatedSshPrefix(profile), remotePosixShellCommand(command)]
}
