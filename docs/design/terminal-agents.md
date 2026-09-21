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
`src/detect/manifests/{codex,claude,gemini,opencode}.toml`,
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
inactive. The local profiles cover recognizable Codex, Claude Code, Gemini and
OpenCode screen controls. Codex and Claude also use supported OSC 0/2 title
signals. Idle Codex titles only finish a turn after an observed busy title;
an arbitrary shell title cannot claim completion. Viewer screens preserve state.
The OpenCode profile treats its bottom `esc interrupt` control as working even when
the same row also contains command hints, and treats the idle `ctrl+p commands`
footer as an explicit prompt. Its current tool rows refine working into reading,
searching, thinking, writing or running without using conversation prose.
Other identified agents enter the Agents list but have unknown activity until a
profile exists. No agent hook installation, agent socket API, remote rule updates,
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
and right-aligned localized activity/status, followed by its published task title
or, when unavailable, its terminal name. A row
activates the existing pane without acknowledging other results. Compact status
labels keep the list readable; the done marker continues to mean unseen completion.
The agent list has its own bounded scroll area and uses single-line rows on very
short layouts so running agents remain accessible. Compact rows prefer the task
title to the agent label when one is available, retaining the status marker.
Sections stay in their chosen folders as agents start, change state and stop;
there is no automatic AI folder. Working markers animate in Agents
using one shared 100 ms timer. The timer stops when no running agent is working,
when the Terminal tool is inactive, and on unmount. Animation updates only the
sidebar and preserves scrolling, focus and terminal instances. Color supplements
the marker rather than being the only signal.

A live working row can additionally say reading, searching, thinking, writing or
running. These are descriptions of the agent's displayed activity, not access to
its reasoning or proof of filesystem operations. Words in a user prompt, prose
answer, old tool result or project title do not set an activity label. UI labels
are localized in all six languages; screen matching currently targets recognized
English agent controls.

After observed work, explicit idle must persist for at least 700 ms. Silence does
not complete a task. Missing evidence preserves the previous state for a 3-second
redraw grace, then becomes unknown. Unseen completion persists through missing
signals until viewed or a new recognized working/blocked state arrives. Opening
a viewer interrupts idle confirmation. Initial idle is never an unread result.

A result is seen when its pane is visible in the active Terminal tool, with no
Terminal dialog or Master Key menu open. Both visible split panes count; a hidden
maximized sibling does not. Opening a different tool or global settings does not
acknowledge completion. New work resets the completion cycle. Leaving the agent
process returns its row to Sessions; PTY exit/failure retains the
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
agent commands. Generic support includes tools such as Copilot, Aider, Goose,
Amp and Cursor Agent **when they publish a useful title**; it does not imply every
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

This is heuristic observation, not a process-control authority. Unsupported UI
versions, localized agent controls, small/wrapped screens, opaque wrappers, remote
sessions and very short turns can be missed. Windows cannot distinguish a
background agent using CIM alone. Unrecognized CLIs require an additional command
identity, and that registration does not grant a state profile. No inference from
CPU load, generic PTY output volume or elapsed silence is treated as completion.

Regression sources cover foreground identity, runtime wrappers, current versus
historical prompts, approval priority, split OSC sequences, unread completion,
viewer/redraw stabilization, hidden sections, inactive tools, native screen
erasure, observer disposal, task-title parsing/lifecycle, tmux title transport,
and stale process snapshots. Run focused coverage while implementing agent
detection changes and include it in the complete repository validation gate.
