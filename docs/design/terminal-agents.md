# Terminal agent activity MVP

This is the current contract for agent observation inside the first-party
[Terminal workspace](terminal.md). It is local, best effort, and read only. It
never approves a request, submits input, installs an integration, reads agent
credentials/session files, or modifies the opened project.

## Herdr reference

The reference was reviewed at
[`herdrdev/herdr@d59d0603d53bb88c5320ea508a4fb9858b61af68`](https://github.com/herdrdev/herdr/tree/d59d0603d53bb88c5320ea508a4fb9858b61af68)
(Apache-2.0). This MVP is an independent TypeScript implementation of a smaller
workflow, not a bundled copy of Herdr or its manifest engine.

Herdr separates several concerns:

1. **Identity:** foreground process/job inspection, executable aliases and runtime
   entry points identify the agent. Wrapper hints can identify otherwise opaque
   foreground commands. Agent-looking text in arbitrary arguments is not identity.
2. **Screen evidence:** prioritized TOML manifests inspect regions of the live
   bottom buffer, including prompt boxes, current controls and activity rows.
   Supported title/progress OSC sequences also contribute. Scrolling the viewport
   does not move the detector into historical output. Transcript viewers can skip
   an update. The manifests distinguish strong visible controls from weak matches.
3. **Authority:** complete lifecycle integrations for agents such as OpenCode,
   Kimi and Pi supply authoritative states when active. Screen detection is not a
   competing authority for those integrations. Other integrations, including
   Codex and Claude, provide session identity without covering the full lifecycle;
   their states remain screen driven. Custom reports have source ownership,
   sequence ordering and release handling. Process exit retires matching authority.
4. **Stability:** pending weak working-to-idle transitions are rechecked (100 ms,
   three confirmations, with a 700 ms cap). Explicit visible idle can bypass that
   hold. Acquisition suppresses false initial completion. State and metadata are
   independent; arbitrary summaries and titles do not themselves define lifecycle.
5. **Presentation:** the semantic states are `working`, `blocked`, `idle` and
   `unknown`. `done` is an idle result the client has not seen. Viewing acknowledges
   it. Attention rolls up through panes, tabs and workspaces.

Relevant reference files are `src/detect/mod.rs`, `src/detect/manifest.rs`,
`src/detect/manifests/`,
`src/pane/agent_detection.rs`, `src/terminal/state.rs`, `src/pane/state.rs`,
`src/app/actions.rs`, and `src/integration/assets/opencode/herdr-agent-state.js`.
The public [agent documentation](https://herdr.dev/docs/agents/) and
[integration documentation](https://herdr.dev/docs/integrations/) explain the
same separation. Herdr's current known-agent unmatched-screen fallback is idle;
Tuiminal deliberately uses unknown instead.

## MVP observation pipeline

A cancellable process snapshot runs every two seconds while there are sessions.
The same snapshot updates automatic terminal names from foreground executables.
Naming and the agent list share process identity rules, including recognized
runtime entry points, so a Codex process reported as `MainThread` is named `codex`.
Screen activity does not determine terminal names. Manual names take priority;
the [workspace contract](terminal.md) defines naming and restart behavior.
For native terminals it follows each owned shell's descendants. For tmux it
resolves the owned window pane's shell PID, or the explicitly mirrored pane's PID,
rather than following a tmux client's process tree. Borrowed panes are observed
individually even when their window contains several agents. Mirrors supply sampled
screen captures; very short activity between captures can be missed. A separate
automatic discovery pass imports all panes from existing default/inherited tmux
servers and restores panes from Tuiminal's named server, with socket/pane
deduplication and per-execution dismissal of external mirrors on close. Plain
external shells remain in the tmux folder; recognized agents from any source enter
Agents. Processes outside discovered panes are not imported. POSIX `ps` job-control flags
exclude stopped, zombie and background candidates. Windows CIM lacks those flags,
so Windows uses the owned descendant tree as a best-effort fallback. Recognition
examines native executable names or runtime script/module entry points, never
arbitrary prompt arguments. Generic agent names and exact names registered in
`terminalAgentCommands` remain supported. A screen banner alone cannot keep an
old agent classified after another command starts.

Every PTY launch owns an independent OpenTUI native terminal observer with no
scrollback. The observer receives the same output and dimensions as the PTY,
including cursor motion, alternate screens and erasure. It has no UI listeners or
input path; generated terminal responses are drained and discarded. This is
necessary because `EmbeddedTerminalRenderable.screen()` reads a rendered viewport,
which can be stale when hidden or showing scrollback. Snapshots are composed only
when output/dimensions changed. Raw OSC title decoding is incremental across byte
chunks, bounded, and independent of the visible terminal.

Identified agents are sampled every 250 ms, even when their section or tool is
inactive. Local live-control profiles cover Codex, Claude Code, Gemini, OpenCode,
Amp, Antigravity, Cline, GitHub Copilot, Cursor Agent, Devin, Droid, Grok,
Hermes Agent, Kilo Code, Kimi Code, Kiro CLI, Letta Code, Maki, Muse, Pi,
Qoder CLI and Qwen Code. Supported OSC 0/2 title status supplements the screen
for Codex, Claude, Amp, Grok, Hermes, Kiro, Letta and Qwen. Some profiles have
only busy or blocker evidence: they stay unknown when no reliable live idle
control exists. OMP and MastraCode are identified by name but remain unknown
without an authoritative integration or safe local screen signal. Idle Codex
titles only finish a turn after an observed busy title; an arbitrary shell title
cannot claim completion. Viewer screens preserve state.
The OpenCode profile treats its bottom `esc interrupt` control as working even when
the same row also contains command hints, and treats the idle `ctrl+p commands`
footer as an explicit prompt. Its current tool rows refine working into reading,
searching, thinking, writing or running without using conversation prose.
Other identified agents enter the Agents list but have unknown activity until a
profile exists. This is a fixed, independent TypeScript subset, not Herdr's
TOML manifest engine or its lifecycle integration coverage. No agent hook installation, agent socket API, remote rule updates,
session restore or agent metadata API is included in this MVP. The optional tmux
transport and explicit mirrors are described in the [workspace contract](terminal.md).

## States and presentation

| Marker | State | Meaning |
| --- | --- | --- |
| Animated loader | Working | Recognized live busy control or title signal |
| `!` | Needs your input | Recognized approval, question or permission UI |
| `✓` | Done, unseen | Observed work returned to a stable idle prompt while hidden |
| `○` | Idle | Initial waiting prompt, or completion already viewed |
| `?` | Unknown | Agent identity is known but current activity is not |

Sessions lists ordinary terminals with their process states; running recognized
agents appear only in Agents, including idle and unknown agents. In a mixed split,
only the ordinary terminal appears in Sessions, without changing the actual split.
A dedicated Agents list shows every running agent in two lines: its marker, name
and right-aligned localized status; its published task title or, when unavailable,
its terminal name. The list groups screen-observed native, tmux and external-terminal
agents under `Local • term`, then integrated app-server sessions under
`Local • localhost`. These names describe the current transports without claiming a
real remote runtime. Keyboard navigation and Master Key numbering follow that visual
order. Compact layouts omit the subgroup headings while retaining the same order.
Integrated Codex sessions add a third line with thinking, code, command,
user-visible text, and tool indicators; only the current public app-server activity
pulses.
Always use the broadly supported `...`, `{}`, `>_`, `txt`, and `●` markers so the
activity line does not depend on a patched font. Distribute the five markers across
the available line with space between them. `txt` covers public `agentMessage`
updates and final answers as well as plan updates. When the agent is stopped, all
activity markers remain inactive and the first-line state represents it. A row
activates the existing pane without acknowledging other results. Compact status
labels keep the list readable; the done marker continues to mean unseen completion.
The agent list has its own bounded scroll area and uses single-line rows on very
short layouts so running agents remain accessible. Compact rows prefer the task
title to the agent label when one is available, retaining the status marker.
Sections stay in their chosen folders as agents start, change state and stop;
there is no automatic AI folder. Working markers and integrated Codex activity
indicators animate in Agents using one shared 100 ms timer. The timer stops when no
running agent is working and no integrated Codex session remains, when the Terminal
tool is inactive, and on unmount. Animation updates only the
sidebar and preserves scrolling, focus and terminal instances. Color supplements
the marker rather than being the only signal.

An offscreen transition into `blocked` or `done` emits one global notification
per agent/state transition. Merely changing task metadata or redrawing the same
state does not notify again. Visible panes, including both halves of a split,
do not pop a redundant alert. A notification click opens the exact existing
session in Terminal and dismisses the card; its close control only dismisses.
The notification does not take keyboard focus, submit input, or auto-approve.

A live working row keeps its existing animated loader in the first line. Agents
already discovered in tmux remain best-effort screen observations, so their rows do
not present structured activity indicators. Activating a tmux agent shows an
informational notification that running the agent through Tuiminal enables more
features. This does not change the borrowed process, send it input, or imply that
Tuiminal can access its reasoning.

## Integrated Codex sessions

`[A] New Codex`, and the empty workspace's matching action, start one owned
`codex app-server` on localhost and launch the official Codex terminal UI with
`codex --remote` in a native PTY. The user composes tasks and handles approvals in
Codex's own interface. A localhost WebSocket relay passes the CLI protocol through
unchanged while Tuiminal reads public thread, turn, and item events from the server
stream. It never submits agent input or approvals, and never reads private reasoning.
The app-server, relay, and PTY are stopped together when the session closes.

Master Key then `[S]` opens an in-memory history of messages sent by the user in
the selected thread. The relay combines text inputs on the public outbound requests
`turn/start`, `turn/steer`, and `thread/queue/add` with earlier `userMessage` items
from public `thread/resume`, `thread/read`, `thread/turns/list`, and
`thread/items/list` responses. After resuming or forking a thread, the relay pages
`thread/turns/list` with full items until `nextCursor` is empty. Opening another
thread replaces the table, while paginated history merges by stable item or client
ID. A new outbound message is linked to the `turn.id` returned by `turn/start`
even if the response omits the repeated `userMessage`, allowing public item,
diff, status, and duration events to update the open detail live. It does not
scrape the terminal transcript or expose private reasoning content.
For each turn it also collects public final and commentary `agentMessage` items,
`reasoning.summary` values, plans, activities, file changes, and the exact
`turn/diff/updated` patch. The table shows the newest message first and orders columns as
elapsed time, status, message, image, audio, skill, and model. Status is the turn
duration plus `✓` for completion, `×` for failure or interruption, or `…` while
queued or running. Image, audio, and skill use `✓` presence indicators. Model
configuration appears as `gpt-6-sol · medium · fast`; messages without per-turn
telemetry fall back to the selected thread's current configuration and use `—`
only when neither source is available. The table supports mouse or wrapping
keyboard selection, and `[Enter]` opens a turn detail in the lower half of the
terminal column, leaving the other half for the PTY. The overview exposes
`MENSAGEM [M]`, `RESPOSTA FINAL [R]`, `ATIVIDADE [A]`, and `ALTERAÇÕES [D]`;
the bracketed keys open full scrollable sections. The response section includes
only public text and explicitly explains that internal private reasoning is not
displayed. The overview fills the expanded region with theme-aware cards. The
change section separates that turn's patch into file blocks with visible paths,
change kinds, local statistics, and native diff views with syntax highlighting,
line-number gutters, and semantic addition/removal backgrounds;
partial patches without unified hunks use a colored line fallback. `[Esc]` unwinds
section, overview, table, and terminal focus. It retains the complete sanitized
user-message history in memory, limits each entry to 4,000 code points, and clears
on restart or close until the thread is hydrated again. Screen-observed native,
tmux, and external agents do not offer this structured history.

For integrated Codex sessions, `turn/completed` determines completion and public
item events determine the visible activity. Silence does not complete a task.
Starting, resuming, or forking a thread hydrates its task title from the returned
public thread name; later `thread/name/updated` events replace it.
Unseen completion persists until viewed or a later turn starts. Native and tmux
agents without an authoritative integration continue to use the bounded screen
observation rules above.

A result is seen when its pane is visible in the active Terminal tool, with no
Terminal dialog or Master Key menu open. Both visible split panes count; a hidden
maximized sibling does not. Opening a different tool or global settings does not
acknowledge completion. New work resets the completion cycle. Leaving the agent
process returns its row to Sessions; app-server or PTY exit/failure retains the
normal process marker and output there.

## Task titles

Task titles are optional display metadata, separate from process names and activity.
Tuiminal reads the title published through OSC 0/2 by a process already recognized
as an agent. It does not generate summaries or extract arbitrary transcript text.
Depending on the CLI, the title describes a conversation, a named session, the
current prompt, or the current public activity summary, rather than always a new
title for each prompt.

| Agent | Title handling |
| --- | --- |
| Codex | Removes spinner and standalone status/app components; retains user-configured title context |
| Claude Code | Removes the status/spinner prefix from the published conversation/session title |
| OpenCode | Removes the `OC` prefix; its default application title clears the previous task |
| Qwen Code | Reads session names and removes status symbols; ignores the unnamed directory fallback |
| Pi | Reads the named session between the application and directory components |
| Gemini CLI | Reads the public dynamic activity subject when supplied; ignores static directory and status-only titles |
| Other recognized/configured agents | Accepts useful OSC titles with the same sanitization and common app-prefix handling, without requiring an activity profile |

Pi and Kimi executable/module identities are recognized alongside the existing
agent commands. Generic support includes tools such as Aider and Goose
**when they publish a useful title**; it does not imply every
version or configuration does so. Missing or disabled titles fall back to the
terminal name. Arbitrary title components cannot be reliably separated into a
task and project without a typed provider protocol.

Title observation shares the existing sampler and does not create another timer.
Titles observed while the terminal was still classified as a shell are ignored
until a new title arrives. Transient status-only updates retain the last useful
summary; an empty/default title, agent identity change or launch replacement
clears it. The value is bounded to 160 graphemes, sanitized and rendered as user
text without translation or shortcut styling. Updating only the title updates
the existing row without restarting the PTY, moving focus or marking a result seen.
Manual terminal names remain unchanged and serve as the fallback.

Mirrors read the exact pane's `pane_title` in the same bounded capture as its
screen, including the initial title of an already-running agent. tmux removes
control characters from that metadata field before framing it; Tuiminal sanitizes
it again before forwarding OSC to the observer. Title-only captures preserve
conversation text and screen position. No agent settings, hooks or session files
are read or changed.

Format references: [Codex title composition](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/status_surfaces.rs),
[Claude Code title control](https://code.claude.com/docs/en/env-vars),
[OpenCode titles](https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/app.tsx),
[Qwen titles](https://github.com/QwenLM/qwen-code/blob/main/packages/cli/src/ui/utils/windowTitle.ts),
[Pi titles](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/modes/interactive/interactive-mode.ts),
and [Gemini dynamic titles](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/utils/windowTitle.ts).

## Lifecycle and limits

Observers belong to the exact PTY launch generation. Restart, close, failed spawn,
exit and workspace teardown release their native resources. Late process snapshots
cannot attach an old observation to a new launch. Status updates preserve terminal
refs, siblings, native focus and process handles. Failed process inspection keeps
the previous identity and retries; screen observation continues. An unavailable
observer can still use title signals, otherwise its activity is unknown.

Every launch starts with only a bounded replay/title observer. The native shadow
terminal is allocated lazily after process inspection recognizes an agent, and its
queued output is applied in batches before screen classification. Repeated scans
reuse the last signal until output or title revision changes; timing-based idle and
unknown transitions still advance on their normal polling cadence. When the agent
ends, the shadow terminal is released while later bytes remain eligible for a new
agent identity. The visible terminal always receives output immediately.

This is heuristic observation, not a process-control authority. Unsupported UI
versions, localized agent controls, small/wrapped screens, opaque wrappers, remote
sessions and very short turns can be missed. Windows cannot distinguish a
background agent using CIM alone. Unrecognized CLIs require an additional command
identity, and that registration does not grant a state profile. No inference from
CPU load, generic PTY output volume or elapsed silence is treated as completion.
The optional [Live Diff companion](terminal.md#live-diff-companion) reads Git
worktree state independently. It neither identifies an agent nor changes these
activity transitions, and its file changes are not attributed to the agent.

Regression sources cover foreground identity, runtime wrappers, expanded live
controls and title signals, background notification navigation, current versus
historical prompts, approval priority, split OSC sequences, unread completion,
viewer/redraw stabilization, hidden sections, inactive tools, native screen
erasure, observer disposal, task-title parsing/lifecycle, tmux title transport,
and stale process snapshots. Run focused coverage while implementing agent
detection changes and include it in the complete repository validation gate.
