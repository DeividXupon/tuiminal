# Remote Terminal

Use for SSH alias discovery, readiness, remote launch/resume and transport.
Contract: [Terminal remote setup and launch](../design/terminal.md#master-key-and-focus).
Code: [Terminal services](../../packages/feature-terminal/src/services/).

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
- Automated SSH children override alias-owned remote commands, session/stdin
  modes, local commands, connection masters and inherited forwards, then run
  fixed scripts with `/bin/sh`. Tunnel launches first inspect `ssh -G` and fail
  with an actionable error when the alias defines a dynamic, local or remote
  forward; use a dedicated forwarding-free alias in that case.

## Readiness and launch

- Ordered barriers: GitHub SSH authentication (`git`, `ssh`, GitHub SSH test),
  then Codex installation, app-server support and `codex login status`.
  Constant bounded probes expose only result markers.
- Configure server opens an interactive SSH terminal plus manual guide. Confirm
  rechecks only the failing barrier. Never type commands, install software, create
  keys or authenticate for the user. Readiness does not launch an agent.
- Master Key `[N]` always creates a local shell. `[A]` always opens the project
  selector without changing settings. Scope recents, Git discovery and fixed,
  bounded directory reads by origin; quote paths and ignore stale replies. `[P]`
  opens cached `~/` autocomplete. Browsing never launches or copies a project.
- Codex preflight verifies both CLIs, SSH/account/directory, daemon/proxy
  capabilities, lifecycle JSON and `initialize`. The experimental transport
  requires exact local CLI, remote CLI, daemon and initialized server versions.
  Use separate bounded probe/daemon/proxy deadlines and preserve specific failure
  reasons. A failed preflight never opens the TUI.
- Start or reuse the persistent shared daemon with `codex app-server daemon start`,
  then carry its Unix-socket WebSocket through a disposable `app-server proxy`
  over `ssh -T` to the local TUI. This is HTTP Upgrade/WebSocket, not stdio JSONL.
  Pass remote cwd with `-C`, expose no remote listener, and bound frames/output.
- Tuiminal owns the local TUI, loopback relay and the SSH proxy process for a remote
  pane. Closing or probing stops only those resources; it never invokes daemon stop.
  The persistent daemon and its active turns belong to the remote Codex installation.
- Remote OpenCode reuses a version/cwd-scoped loopback server whose PID, process
  identity, remote-selected port and password use private state and a recoverable
  lock. Retry one stale/unhealthy registration. A server created only for a temporary
  resume query is retired afterward; never stop a reused server from that path. App
  exit detaches clients; pane close interrupts its turn. Require exact v2 versions
  and no local remote-cwd argv.
- Remote Claude Code 2.1.285+ creates or attaches an official background UUID. App exit
  detaches its TUI/observer; pane close runs `claude stop`, even after the attachment
  exits. A failed/cancelled attachment retires only the background session it created,
  never one it reused. Workers use hook-free settings and shared five-second
  `claude agents --json --all` polling. Older versions use pane-owned foreground
  hooks/`ssh -R`. Never read `~/.claude`.
- A missing provider CLI, capability or incompatible version opens a localized modal.
  `[Esc]` preserves intent; `[Enter]` opens manual local/SSH update terminals.
  Revalidation retains failures or closes only those terminals and retries. See the
  [Codex app-server](https://learn.chatgpt.com/docs/app-server) and
  [OpenCode CLI](https://opencode.ai/v2/docs/cli/commands/) references.
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
