# Remote Terminal

Use for SSH alias discovery, readiness, remote launch/resume and transport.
Contract: [Terminal remote setup and launch](../design/terminal.md#master-key-and-focus).
Code: [SSH discovery](../../packages/feature-terminal/src/services/ssh-config.ts),
[connection](../../packages/feature-terminal/src/services/remote-codex-connection.ts),
[handshake](../../packages/feature-terminal/src/services/remote-codex-handshake.ts).

## SSH configuration

- Discover explicit `Host` aliases from `~/.ssh/config` and bounded Includes;
  ignore wildcard/negated patterns. Persist only the selected alias reference.
  OpenSSH resolves users, hosts, ports, identities and proxy options. Do not read
  key contents, store connection fields or silently migrate legacy credentials.
- Settings opens a read-only summary, then an alias navigator: `[Enter]`/`[A]`
  activates, `[R]` reloads, `[Esc]` returns. Keep status/readiness/actions fixed
  while the alias list scrolls; compact layouts retain actions without editable
  connection fields. Leaving cancels owned discovery/tests.
- Test with one bounded, abortable `ssh` child, argv, batch mode, normal
  known_hosts verification and a constant marker. No `-i`, `-p`, synthesized
  user@host, shell interpolation, logged SSH output or app-server startup.

## Readiness and launch

- Ordered barriers: GitHub SSH authentication (`git`, `ssh`, GitHub SSH test),
  then Codex installation, app-server support and `codex login status`.
  Constant bounded probes expose only result markers.
- Configure server opens an interactive SSH terminal plus manual guide. Confirm
  rechecks only the failing barrier. Never type commands, install software, create
  keys or authenticate for the user. Readiness does not launch an agent.
- Master Key `[N]` always creates a local shell. `[A]` always opens the project
  selector; it can choose any discovered SSH alias without changing settings.
  Scope recents and reads by origin. Use fixed, bounded, cancellable read-only
  SSH directory queries; quote paths as data. Ignore stale results after origin
  changes. `[P]` opens the focused `~/` autocomplete screen; query a parent only
  after its path changes, cache listings, and keep `[Tab]` inside the input. Git
  discovery stays bounded to the selected host. Validate directories and preserve
  startup errors for retry. Browsing never launches an agent or copies a project.
- Start an owned `codex app-server --stdio` through `ssh -T`, then bridge its
  JSONL stream to a loopback WebSocket for the local official TUI. Pass remote
  cwd with `-C`; no remote TCP listener or copied socket.
  Bound stdout, discard non-JSON, drain stderr.
- Before the TUI, a separate ten-second cancellable probe verifies SSH, cwd,
  app-server startup and initialize. Record the remote `userAgent` and local CLI
  versions for diagnostics, but accept version skew after a valid initialize response.
  Distinguish host/key/network/directory/app-server/protocol/timeout failures.
  A failed probe never opens the TUI.
- Close only the owned local TUI, relay, SSH processes and remote app-server,
  including the probe process after initialized.
- Recent-thread reads query local and the active remote source independently,
  omit cwd, and merge without erasing the other source. Tag threads with profile,
  remote cwd and optional branch. Resume uses that exact source; a missing profile
  never falls back to local. Public events drive activity/history.

## Remote Live Diff

Use a separate persistent batch-mode SSH helper, never the app-server stream.
Only fixed read-only operations with encoded paths, bounded output/lifetime and
non-overlapping polling at least 750 ms apart. Start from tagged remote cwd and
linked worktrees; no local fallback or local Add project picker. Retry transport
failure and stop only the helper on panel close; show the profile in the heading.

## Remote project synchronization

- Only the active integrated remote Codex session offers Master Key `[R]`. Its
  pane tag shows not synced, checking, out of sync, syncing, synced or error and
  includes the configured Master Key plus `[R]` whenever user action is useful.
  Refresh status only while that remote pane is visible, with bounded,
  non-overlapping checks.
- On first sync, choose a local parent directory and derive a sibling named
  `<remote-basename>-sync`. Never adopt or replace an existing unknown path;
  require another parent. Persist the profile, canonical remote cwd, local
  destination and both successful fingerprints outside the opened project.
- Copy remote to local in one direction and include the complete tree: hidden,
  ignored, dependency and `.git` content. Transfer with fixed argv SSH/tar
  commands into a sibling staging directory, validate paths and symlinks, verify
  that the remote fingerprint stayed stable, then publish atomically. Retry one
  remote race and preserve the previous destination on failure.
- Before replacing a known destination, compare it with the last successful
  local fingerprint. Require explicit confirmation if the local copy changed,
  and abort if it changes again while synchronization is running. A later sync
  reuses the persisted destination without reopening the parent picker.

Tests: `tests/terminal-remote-*.test.ts`, relevant settings tests and Terminal TUI
suites, plus `tests/terminal-project-sync.test.ts`. Use fake SSH/app-server
fixtures, never real credentials or servers.
