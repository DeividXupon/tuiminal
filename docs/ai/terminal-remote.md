# Remote Terminal profiles

Current contract: [Terminal workspace](../design/terminal.md#master-key-and-focus).

- The Terminal settings context exposes Remote Connection as its own category. It may
  persist Remote Codex SSH profiles, test them, inspect server readiness, and open an
  interactive SSH setup shell. An active, ready profile also enables remote Codex
  launches from Master Key `[A]`, plus discovery and resume from the Master Key Agents
  panel. Store only bounded connection metadata and a private-key path, never key
  contents. Validate every field before persistence or spawn.
- Run the test as one owned, abortable, time-bounded `ssh` child with an argument
  array, batch mode, normal `known_hosts` verification and a constant remote marker.
  Never interpolate a shell command, weaken host-key checking, log SSH output, or
  start `codex app-server`.
- Readiness has two ordered barriers: GitHub authentication through SSH, followed by
  Codex CLI installation, persistent-daemon support, and authentication. Probe both through owned, abortable,
  time-bounded SSH children. Remote scripts are constant and emit only a bounded
  result marker; never interpolate profile data into them or expose their stdout.
  GitHub readiness requires `git`, `ssh`, and a successful `ssh -T git@github.com`.
  Codex readiness requires a discoverable executable, the official `app-server
  daemon` and `app-server proxy` commands, and successful `codex login status`.
- `[V]` checks both barriers. `[C]` is the single generic **Configure server** action:
  close settings and open a normal interactive SSH terminal above a setup guide. The
  guide checks readiness on entry, selects the first failing barrier, shows manual
  instructions, and lets **Confirm configuration** recheck only that barrier. Advance
  only after a ready result. Never type commands, create keys, install software, add
  GitHub keys, or authenticate accounts on the user's behalf. Completing the guide
  confirms prerequisites only; it does not start a remote agent or move a project.
- Master Key `[N]` always opens a local terminal section and never changes behavior
  when a remote profile is active. With an active profile, `[A]` first asks for Local
  or Remote. Both choices open an owned interactive shell modal where the user changes
  directory manually; Local uses the normal local login shell and Remote uses
  `ssh -tt`. Repeating the configured Master Key asks that shell for its absolute
  working directory, then starts Codex there. `exit` or `[Esc]` cancels. Tagged remote
  conversations remain resumable from the Master Key Agents panel; a missing source
  profile never falls back to local. Never infer or copy a project.
- Start or reuse the official shared remote daemon with `codex app-server daemon
  start`, then run `codex app-server proxy` through one owned `ssh -T` child. The
  proxy bridges daemon JSONL to a loopback-only WebSocket used by the local official
  Codex TUI; pass the selected remote directory explicitly with `-C`. Never expose a
  remote TCP listener or copy the daemon socket. Drain stderr, bound incomplete
  stdout, and discard non-JSON stdout. Closing Tuiminal or its pane retires only the
  local TUI, relay, and SSH proxy; it must not run `daemon stop`, so the remote daemon
  and its active turns remain available for a later resume. Public app-server events
  drive the same activity, history, and resume integration as local sessions. Tag
  listed threads with their source profile so a resume uses that profile and remote
  cwd; never fall back to local when the profile is missing. Remote sessions appear
  under `Remote • <profile>`.
- Before opening the local Codex TUI, run one bounded probe over the same SSH proxy
  command. It must prove SSH authentication, the selected remote directory, daemon
  startup, and a valid app-server `initialize` response. Read the responding daemon's
  version from `InitializeResponse.userAgent` and compare it with `codex --version`
  from the local CLI that will open the TUI. Versions are compatible when their major
  matches; while Codex is `0.x`, the minor must match too. Patch-only differences are
  accepted. Close only the probe proxy after `initialized`, then create the separate
  relay/TUI connection. Bound output and the complete probe to ten seconds, honor
  launch cancellation, and surface distinct errors for host identity, rejected key,
  unreachable host, missing Codex, missing directory, daemon startup, rejected or
  malformed `initialize`, incompatible version, and timeout. A failed probe must not
  open the TUI or stop the persistent daemon.
- Master Key `[D]` may open Live Diff for a running remote integrated agent. Use
  one separate, owned, persistent batch-mode SSH helper for that panel; do not reuse
  or inject commands into the app-server stream. Start from the session's tagged
  remote cwd, discover linked worktrees on the same host, poll no faster than every
  750 ms, and never fall back to a local path. The framed helper accepts only fixed
  read-only Git/file operations with encoded path fields, bounded output and request
  lifetime. Retry after transport failure and stop the helper on panel close. Show
  the profile in the heading. Do not expose the local Add project picker remotely.
- When Terminal activates, query both the local app-server and the single active SSH
  profile for recent `thread/list` entries. Both queries omit `cwd` so each list can
  show recent work across its complete host. Keep local and remote sources
  independently and merge them for the Master Key Agents panel; a refresh from one
  source must not erase the other. Label each remote row with its profile, derive its
  project name from the remote `cwd`, and preserve the optional `gitInfo.branch`.
- Selecting the category shows a read-only profile summary. `[Enter]` replaces that
  summary with the focused form navigator. When profiles exist, begin navigation on
  the first saved profile. `[J/K/↑/↓]` traverses profiles and fields; `[Enter]` on
  a profile loads it and selects its first field, while `[Enter]` on a field focuses
  its input for editing. `[Esc]` returns to field navigation. Highlight the whole
  field block while navigating with a subdued tint derived from the Terminal accent;
  reserve the accent label and that same tinted input surface for the input that owns
  the editing cursor. A later `[Esc]` returns to the selected summary; another closes
  settings. Leaving the form or unmounting the screen cancels only its owned test
  process. Persist exactly one active profile ID when profiles exist, normalizing a
  missing or stale ID to the first valid profile. `[A]` activates the cursor-selected
  or loaded profile. Render explicit localized `ACTIVE`/`INACTIVE` labels on every
  profile and an `EDITING` label on the profile loaded into the form.
  Keep the profile list, field list and action area as separate layout regions: only
  the two lists scroll, so status, readiness, and actions remain visible.
  Compact-height layouts keep fields on one line, collapse readiness to one row,
  hide the loaded-profile legend, and restrict the profile list to one row.
