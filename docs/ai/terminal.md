# Free Terminal

Use for PTY/tmux lifecycle, sidebar, observation and companion panels.
Code: [feature](../../packages/feature-terminal/src/).

| Change | Contract |
| --- | --- |
| Sections, folders and sidebar | [Sections](../design/terminal.md#sections-and-folders) |
| Master Key and focus | [Focus](../design/terminal.md#master-key-and-focus) |
| History or Live Diff | [History](../design/terminal.md#sent-message-history), [Live Diff](../design/terminal.md#live-diff-companion) |
| Native/tmux sessions | [Backends](../design/terminal.md#native-and-tmux-sessions) |
| Agent identity, activity or titles | [Agent observation](../design/terminal-agents.md) |
| SSH setup/remote integrated agents | [Remote note](terminal-remote.md) |

## Lifecycle

- This is a general terminal. Pass custom command text unchanged to the native
  interpreter: Windows COMSPEC/cmd with AutoRun disabled, POSIX SHELL or sh.
  Never prepend `exec` or assume POSIX flags on Windows.
- Keep real PTYs alive across tab switches, sibling updates, appearance and focus
  changes. Resize/reattach never reruns an exited command. Assign launch generations
  before awaiting stop; stale callbacks can retire only their exact handle.
- Process exit and EOF differ: drain final output with a bounded fallback before
  completing retirement. Stop is asynchronous/idempotent and retains ownership
  through grace, exact-group/tree escalation and observed exit.
- Terminal stays compact with no outer chrome; preserve two panes per section,
  the 12-session limit and session-local Live Diff/history state.
- tmux auto mode requires POSIX tmux 3.2+; native Windows uses ConPTY. Never install
  tmux automatically or replay a potentially executed command on fallback.
- Owned tmux windows persist on the named server; shutdown detaches temporary
  clients, explicit close destroys only the selected owned window. Natural shell
  exit closes it; completed custom commands retain output/restart.
- Borrowed mirrors target immutable socket/pane IDs. Never kill/restart their
  source or substitute an empty shell. Coordinate temporary geometry per window,
  preserve topology/selection/zoom and restore owned changes on direct viewing
  or last detach. Never resize a source containing Tuiminal itself.
- Borrowed capture is sampled: no full scrollback, copy-mode UI or mouse input.
  Serialize input without replay; clean only owned paste buffers. On tmux 3.2,
  recreate the exact owned buffer name before deletion to avoid deleting another.
- Pinned helpers use marked panes and the private control channel. Restore altered
  mouse/prefix settings without overwriting custom bindings; focus handoff uses
  pane-scoped wait-for, never process signals. External non-tmux TTYs are metadata
  only and do not consume the session limit.

## Observation and presentation

- Recognize agents from process identity, not arbitrary arguments, banners or
  titles. Separate identity, task title and activity; silence/CPU/transcript words
  do not prove completion. Unsupported activity remains unknown.
- Read screen activity through the bounded input-free native observer, not viewport
  visibility. Create it only after recognition; batch output, skip unchanged
  revisions and release it with the exact PTY. Keep PTY hot paths lean.
- Integrated Codex observes public app-server events, while integrated OpenCode uses
  its public HTTP/SSE protocol. Each official TUI owns input and approvals. Never read
  private reasoning. History hydrates public turns and merges stable IDs for the
  selected provider session.
- Sidebar filtering must not change splits, folders, lifetime or focus. Running
  agents appear exclusively in Agents. Task titles are sanitized display metadata.
  Animation timers stay outside PTY rendering and stop while inactive.
- Offscreen notifications require new blocked/done transitions. Acknowledge only
  visible active panes outside menus; clicking selects the existing pane.
- Live Diff is opt-in, read-only and makes no authorship claim. Bound roots/files/
  bytes/lifetimes, avoid overlap, poll local at least 250 ms apart (remote 750 ms).
  Keep both PTYs mounted and each session's targets/focus independent.

## Validation

Tests: `tests/terminal-*.test.ts` and Terminal TUI suites. For observer hot paths,
use `bun scripts/benchmark-free-terminal.ts`; lifecycle changes need native tests.

Fixtures/demos isolate config/data and disable `TUIMINAL_TERMINAL_WORKSPACE_STATE`,
`TUIMINAL_TERMINAL_AUTO_MIRROR`, `TUIMINAL_TERMINAL_RESTORE`,
`TUIMINAL_TERMINAL_PINNED_TMUX` and `TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY` with
`0`, unless explicitly testing isolated versions of those facilities.
A native-backend override alone does not prevent tmux discovery/restoration.
