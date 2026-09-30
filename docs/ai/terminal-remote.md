# Remote Terminal

Use for SSH alias discovery, readiness, remote launch/resume and transport.
Contract: [Terminal remote setup and launch](../design/terminal.md#master-key-and-focus).
Code: [SSH discovery](../../packages/feature-terminal/src/services/ssh-config.ts),
[connection](../../packages/feature-terminal/src/services/remote-codex-connection.ts),
[handshake](../../packages/feature-terminal/src/services/remote-codex-handshake.ts), and
[OpenCode transport](../../packages/feature-terminal/src/services/remote-opencode-connection.ts).

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
- Before the TUI, one cancellable preflight verifies the local Codex binary and
  version, SSH authentication, the selected remote directory, remote Codex version
  and `codex login status`, `app-server daemon` and `app-server proxy` capabilities, daemon startup and the
  proxy's `initialize` response. For 0.x releases require matching major and minor;
  for stable releases require matching major. Missing or invalid versions are
  incompatible. Distinguish host/key/network/directory/capability/daemon/proxy/
  protocol/timeout failures. A failed preflight never opens the TUI.
- Start or reuse the persistent shared daemon with `codex app-server daemon start`,
  then bridge the daemon's WebSocket bytes through a disposable `codex app-server
  proxy` over `ssh -T` to a loopback WebSocket for the local official TUI. The proxy
  targets the daemon's Unix control socket, so its stdio carries the HTTP Upgrade and
  WebSocket frames, not the JSONL transport exposed by `app-server --stdio`. Pass
  remote cwd with `-C`; expose no remote TCP listener or copied socket. Serialize and
  bound frames, and drain stderr. Browsing and short-lived history/preflight requests
  also close only their proxies.
- Tuiminal owns the local TUI, loopback relay and the SSH proxy process for a remote
  pane. Closing or probing stops only those resources; it never invokes daemon stop.
  The persistent daemon and its active turns belong to the remote Codex installation.
- OpenCode runs owned `opencode serve` on remote loopback, forwards it with SSH `-L`,
  and attaches its official local TUI. Bound public HTTP/SSE reads; keep input and
  approvals in the TUI. Stop its server, tunnel, observer and PTY together.
- A missing capability or incompatible version opens a localized modal. `[Esc]`
  returns to the preserved project/resume selection. `[Enter]` opens two terminals in
  one split, local `~/` and remote SSH `~/`, showing detected versions, `codex update`
  and the official POSIX installer alternative. The user runs commands manually;
  nothing is typed or executed automatically. Revalidation keeps the guide open on
  failure, or closes only those two terminals and retries the exact original launch
  on success. The app-server protocol is experimental and version-dependent; see the
  [official app-server documentation](https://learn.chatgpt.com/docs/app-server) and
  [`codex update` reference](https://learn.chatgpt.com/docs/developer-commands#codex-update).
- Query local and active-remote recents independently and merge without erasing either
  source. Tag provider, profile and cwd; never fall back to another provider or host.
  Rehydrate public history and state before consuming live events.

## Remote Live Diff

Use a separate persistent batch-mode SSH helper, never the app-server stream.
Only fixed read-only operations with encoded paths, bounded output/lifetime and
non-overlapping polling at least 750 ms apart. Start from tagged remote cwd and
linked worktrees; no local fallback or local Add project picker. Retry transport
failure and stop only the helper on panel close; show the profile in the heading.

## Remote project synchronization

- Only active integrated remote agents with sync capability offer `[R]`. Keep state
  and measured progress in the pane tag; only project-facing changes settle as
  out-of-sync.
- First sync derives `<remote-basename>-sync` under a chosen local parent. Never
  adopt an unknown existing path. Persist the profile/canonical cwd, destination,
  fingerprints, validated compressed baseline and automatic preference outside
  the project; retain a first-transfer preference until its mapping succeeds.
- Saved mappings compare before manual transfer. Notify when unchanged; otherwise
  page new, changed, removed and conflicting paths and require one destructive
  confirmation for local changes. The checking, review and transfer states expose
  `[A]` with `OFF`/`ON`; toggling never confirms the current review.
- Enabled automatic sync runs remote-to-local after successful structured agent turns
  and is standing permission to replace conflicts. It stays in the background,
  updates the tag and notifies only on failure. Failed/interrupted turns do not
  trigger it. Serialize per project, prioritize manual work, coalesce completions
  while busy, drop pending work when disabled and retry failures only next turn. After
  resume hydration, one already-completed unseen turn requests one coalesced catch-up;
  active, failed, interrupted or approval-pending hydration never does, and no new
  incremental-sync cursor is created.
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
