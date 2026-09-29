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
- Wrap each owned remote app-server in a private POSIX lease. Serialize protocol
  writes, consume a local heartbeat every 20 seconds without forwarding it, and
  count ordinary input as activity. After roughly two minutes without activity,
  stop only that app-server and its wrapper so an abandoned SSH transport cannot
  retain the conversation lock. The server-side SSH session may age out later.
- Before the TUI, a separate ten-second cancellable probe verifies SSH, cwd,
  app-server startup and initialize. Record the remote `userAgent` and local CLI
  versions for diagnostics, but accept version skew after a valid initialize response.
  Distinguish host/key/network/directory/app-server/protocol/timeout failures.
  A failed probe never opens the TUI.
- Close only the owned local TUI, relay, SSH processes and remote app-server,
  including the probe process after initialized. Stop heartbeat timers before
  closing stdin, and remove only the exact private lease directory.
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

- Only active integrated remote Codex sessions offer Master Key `[R]`. Keep the
  last state in the pane tag; sweep it while checking and fill it with measured
  progress while syncing. Only project-facing changes settle as out-of-sync.
- First sync derives `<remote-basename>-sync` under a chosen local parent. Never
  adopt an unknown existing path. Persist the profile/canonical cwd, destination,
  fingerprints, validated compressed baseline and automatic preference outside
  the project; retain a first-transfer preference until its mapping succeeds.
- Saved mappings compare before manual transfer. Notify when unchanged; otherwise
  page new, changed, removed and conflicting paths and require one destructive
  confirmation for local changes. The checking, review and transfer states expose
  `[A]` with `OFF`/`ON`; toggling never confirms the current review.
- Enabled automatic sync runs remote-to-local after successful app-server turns
  and is standing permission to replace conflicts. It stays in the background,
  updates the tag and notifies only on failure. Failed/interrupted turns do not
  trigger it. Serialize per project, prioritize manual work, coalesce completions
  while busy, drop pending work when disabled and retry failures only next turn.
- Compare the complete tree, including hidden/ignored paths, dependencies, caches
  and `.git`; never poll on a timer. Repeat comparisons are metadata-first and
  reuse digests only when size, mode, mtime and ctime still match. Bound local
  enumeration and remote hash batches. Quiet paths still synchronize normally.
- Transfer only new/content-changed regular-file bytes over fixed argv SSH/tar
  commands with NUL-delimited stdin paths. Recheck both reviewed trees, verify
  received bytes and the full result, and never silently retry a race.
- Keep enumeration, hashing, snapshot I/O, transfer and journaled publication in
  the installed worker. Use path backups, recover/rollback incomplete work, keep
  IPC bounded to progress and paged rows, and let the focused modal own `[Esc]`.

Tests: `tests/terminal-remote-*.test.ts`, relevant settings tests and Terminal TUI
suites, plus `tests/terminal-project-sync.test.ts`. Use fake SSH/app-server
fixtures, never real credentials or servers.
