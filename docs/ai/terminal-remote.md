# Remote Terminal profiles

Current contract: [Terminal workspace](../design/terminal.md#master-key-and-focus).

- The Terminal settings context exposes Remote Connection as its own category. It may
  persist Remote Codex SSH profiles, test them, inspect server readiness, and open an
  interactive SSH setup shell. Remote agent execution is not implemented. Store only
  bounded connection metadata and a private-key path, never key contents. Validate
  every field before persistence or spawn.
- Run the test as one owned, abortable, time-bounded `ssh` child with an argument
  array, batch mode, normal `known_hosts` verification and a constant remote marker.
  Never interpolate a shell command, weaken host-key checking, log SSH output, or
  start `codex app-server`.
- Readiness has two ordered barriers: GitHub authentication through SSH, followed by
  Codex CLI installation and authentication. Probe both through owned, abortable,
  time-bounded SSH children. Remote scripts are constant and emit only a bounded
  result marker; never interpolate profile data into them or expose their stdout.
  GitHub readiness requires `git`, `ssh`, and a successful `ssh -T git@github.com`.
  Codex readiness requires a discoverable executable and successful
  `codex login status`.
- `[V]` checks both barriers. `[C]` is the single generic **Configure server** action:
  close settings and open a normal interactive SSH terminal above a setup guide. The
  guide checks readiness on entry, selects the first failing barrier, shows manual
  instructions, and lets **Confirm configuration** recheck only that barrier. Advance
  only after a ready result. Never type commands, create keys, install software, add
  GitHub keys, or authenticate accounts on the user's behalf. Completing the guide
  confirms prerequisites only; it does not start a remote agent or move a project.
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
