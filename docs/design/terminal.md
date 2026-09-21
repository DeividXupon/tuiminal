# Terminal workspace

Free Terminal is a generic PTY multiplexer for shells and arbitrary CLIs. Its
workspace always uses compact geometry, regardless of the global framed/compact
preference. There is no tool header, working-directory label, command strip,
per-pane title bar, running counter, pager, or permanent footer. The application
navigation stays available in a single row. The sidebar contains names and status;
the remaining area belongs to the PTYs. The layout follows the visual hierarchy of
[Herdr's terminal workspace](https://github.com/herdrdev/herdr/blob/d59d0603d53bb88c5320ea508a4fb9858b61af68/assets/screenshot.png):
a dedicated agent list first and session navigation below it. Terminal content fills
the remaining workspace up to every edge, without outer borders, margins, padding
or gaps at any terminal size. A split uses only one shared separator column or row.
The sidebar highlights the active terminal, and split separators use the active
accent when applicable. Resizing preserves the embedded terminal and its process.

## Sections and folders

A section contains one or two terminal panes, horizontally or vertically split.
Two panes are the limit, not two additional panes beside an original. Closing one
expands its sibling. There are at most 12 terminals in a workspace. New terminal
always opens a new section in the reserved Tuiminais folder, including when the current
section has room for a second pane. New section does the same. Only the explicit
Split right / below actions add a second pane to the current section. Custom
commands create a new section and are passed unchanged to the native shell.

The left sidebar has a Sessions heading and a count of its visible sections,
followed by non-empty folders and zero-padded numbered sections. Clicking a folder
header, or highlighting it with the sidebar cursor and pressing Enter, collapses
or expands its rows, and that fold state is restored per project;
empty folders stay out of the sidebar. Sessions lists only terminals without a running recognized
agent, including completed custom commands whose output is retained. A naturally
exited interactive shell is closed and removed from the workspace.
Running agents appear exclusively in Agents, regardless of their activity state.
A session item uses two rows. The first shows its colored process marker, terminal
name and a right-aligned localized state. A live shell waiting at its prompt is
Idle; Running appears only while process inspection finds a foreground non-shell
tool such as `lazygit`, `tuiminal`, or `bun run test`. The second row shows the
most useful context: project-directory basename for shells, original command for
custom launches, source directory for mirrors, or exit code after completion,
followed by `native` or `tmux`. The selected section has a terminal-colored left
rail and its selected pane has a raised background. A paired section places two
independently clickable two-row items beside one shared vertical separator. Status
markers distinguish starting, idle, running, exited and failed processes using the
active palette's semantic colors. Reserved folder fold state and tmux pane assignments
are stored per project in Tuiminal's user data directory, outside the opened project.
Legacy custom folders are ignored. Native sessions end at shutdown. Tuiminais is the default folder for
new terminals and restored panes without a saved assignment;
the reserved tmux folder contains ordinary panes discovered on external servers.
Users can rename terminals; the only folders are Tuiminais, tmux and Others.
The New terminal action sits below navigation; the Master Key stays at the bottom.
In a shell/agent split, Sessions shows only the shell and Agents shows the agent;
the actual split, section and folder assignment remain intact. When the agent
returns to its shell, its terminal reappears in Sessions; if the shell itself
exits, the terminal is removed instead.

Terminal names automatically follow the foreground executable: opening `lazygit`
inside `zsh` changes the name to `lazygit`, and closing it restores `zsh`. Naming
uses the existing two-second process snapshot for native terminals and the source
pane's shell PID for tmux, including mirrors. Shell wrappers and a tool's helper
children do not replace its name. POSIX background, stopped and zombie jobs are
excluded; Windows uses the owned descendant tree as a best-effort fallback.
The selected foreground process is checked with the same agent-identity rules as
the Agents list. Recognized agents use their CLI name (`codex`, `claude`, `gemini`,
`opencode`) or their configured entry-point name, so runtime names such as
`MainThread` or `node` do not replace the recognized agent name. Identification
stays scoped to the selected process; an agent child cannot rename its parent tool.
Otherwise the cleaned executable basename is displayed. Arbitrary arguments and
screen text never supply a name. A missing or failed snapshot keeps the previous name. Retained
finished custom commands keep their last name and output. Renaming through `[E]` makes that name manual for
the rest of the session, including restarts. Name updates preserve pane instances,
focus, section placement and the original command used for restart.

A separate Agents list comes first and targets 40% of the sidebar, with at
least four rows when space allows.
Each clickable agent row shows a colored state marker, agent name, right-aligned
activity/status, and the agent's published task/session title beneath, falling
back to the terminal name when unavailable. Published task titles use the palette's
focus accent so they remain legible across every light/dark palette and distinct
from state colors. All running agents are listed,
including agents in other sections. The list scrolls independently and selecting a
row activates the existing pane. Empty lists say there are no active agents.
Below ten available rows (including while the Master Key menu is open), running
agents remain accessible as compact single-line rows with task title (or agent
name) and status. With
agents present, the creation buttons are hidden below eight rows and the Sessions
heading below six; their actions remain available through the Master Key. Empty
agent lists are omitted in compact layouts. Sidebar widths range from 16 to 32 columns.
Status changes do not reset either list's scroll position.
Task titles come from the agent's own terminal title, including tmux pane titles;
they do not change automatic/manual terminal names. Supported formats and limits
are documented in [agent task titles](terminal-agents.md#task-titles).

Agent recognition leaves each section in its chosen folder. The dedicated Agents
list provides access to running agents without introducing an automatic AI folder
or regrouping paired terminals. Working agents show an animated loader in Agents; other states retain
their static markers. One sidebar timer advances the loader every 100 ms while
the tool is active and at least one running agent is working. It stops when no
longer needed and is released on unmount, without updating terminal panes or focus.

## Master Key and focus

Settings opened from Terminal contain a Terminal category with the persisted
`terminalMasterKey`. The default is `[Ctrl+B]`; supported alternatives are
`[Ctrl+A]`, `[Ctrl+Space]`, `[Ctrl+F]`, `[Ctrl+G]`, `[Ctrl+N]`, `[Ctrl+P]`, `[Ctrl+T]`.
The global layout selector is hidden in this context because Terminal is always
compact. Other tools retain their layout preference.

The Master Key opens a mouse-accessible action list at the bottom. It owns input
until an enabled action is chosen or `[Esc]` cancels. There is no timeout. Unknown
or disabled actions leave it open. Repeating the Master Key sends its literal
control byte to the selected PTY. Neither the prefix, action nor cancellation
reaches the shell. Dialogs own their keyboard and Escape; closing one restores the
selected terminal. Switching tools or opening global settings dismisses local
menus and dialogs. `[G]` after the prefix releases focus for global shortcuts.

`[B]` after the Master Key pins the terminal sidebar to the left side of the
application. The same live Sessions and Agents navigation then remains visible
while the user switches among installed tools; Terminal removes its internal copy
so there is still exactly one sidebar. Selecting a terminal or agent from the
pinned sidebar opens Terminal and focuses the existing pane. Unpinning returns the
sidebar to the Terminal workspace without restarting a PTY or changing its folder.
`[L]` from the action menu focuses the visible sidebar. Its `[↑/↓]` and `[J/K]`
cursor crosses the Sessions/Agents boundary as one ordered list, and `[Enter]`
activates the highlighted existing pane. While the pinned sidebar owns focus, the
tool behind it does not process keyboard input.

When Tuiminal itself runs inside tmux, pinning also maintains one narrow left split
in every window on that inherited tmux server. Each split runs the verified
`terminal-sidebar.mjs` helper, is marked with the pane-local
`@tuiminal_sidebar` option, and is excluded from ordinary pane/agent discovery.
The tmux split replaces the in-app host so only one sidebar is visible. While the
app is reachable, helpers receive its live sidebar snapshot, including reserved
folders, manual names, status, agent task titles, language and palette colors. If
that channel is unavailable, they fall back to read-only process and pane metadata;
they do not attach another client or mirror screen contents. A click in the split
beside Tuiminal asks the app over a private `0600` local socket to open/focus the
target inside Terminal. A click in a different window selects a target pane on the
same tmux server directly; targets on another server are opened in Tuiminal and the
client returns to its Tuiminal pane. While these helper splits exist, Tuiminal enables
tmux mouse routing so the sidebar remains clickable even when the adjacent content
pane owns focus. It restores an initially disabled mouse option when the sidebar is
unpinned and leaves an initially enabled option unchanged. Each helper consumes its
renderer's terminal-identification replies before mounting the interactive sidebar,
so changing panes cannot deliver late DA or XTVERSION responses to a shell. The
global tmux option retains the pinned
choice and reconciliation adds a replica for later windows. Unpinning kills only
marked helper panes. Reconciliation removes a helper that became the only pane in
its window so it cannot keep an otherwise closed tmux window alive. Without tmux,
pinning remains entirely inside the current Tuiminal application. The helper is
bounded to its pane height so a long Sessions list scrolls without pushing the
Agents list outside the visible split. It owns keyboard focus while its tmux pane
is selected. A pane-local `after-select-pane` hook publishes a pane-scoped tmux
`wait-for` event whenever tmux selects that helper. The helper consumes the event
to focus its navigation and display a fast translucent diagonal light sweep across
the full sidebar background in the active palette's focus color. Focus handoff never sends
an operating-system signal to a pane process, so changing selection cannot signal
or terminate the Tuiminal host. Its direct
`[↑/↓]`/`[J/K]` and `[Enter]` controls work as
soon as tmux selects the pane; Tuiminal's Master Key remains available for the
action menu. Folding updates the helper immediately and keeps its tmux pane
selected. The helper forwards actions over
the private control channel. Actions that need a dialog return to the Tuiminal pane;
other enabled actions can complete while the client stays in another tmux window.
When `[Ctrl+B]` is both the configured Master Key and tmux's untouched default root
binding, pinning installs a pane-conditional bridge: helper panes receive the key
and every other pane still enters tmux's prefix table. Unpinning restores the stock
binding. Tuiminal never overwrites a customized `C-b` root binding.

| Key after the Master Key | Action |
| --- | --- |
| `[N]` / `[C]` | New terminal / new section |
| `[/]` | Run a custom command in a new section |
| `[V]` / `[S]` | Split right / below |
| `[1]` / `[2]` | Focus a pane of the current section |
| `[M]` | Maximize / restore |
| `[B]` | Pin / unpin the sidebar |
| `[L]` | Focus the visible sidebar |
| `[E]` | Rename selected terminal |
| `[D]` | Toggle Live Diff for a recognized agent |
| `[R]` / `[X]` | Restart / close selected terminal |
| `[G]` | Release global shortcuts |
| `[Esc]` | Cancel without changing terminal focus |

## Live Diff companion

Master Key then `[D]` opens a read-only Live Diff beside the selected recognized
agent's existing PTY. The companion does not consume a terminal slot or create a
tmux pane. It shares only one separator with the PTY and stacks below it when the
available width is narrow or the section already has two terminals. Toggling it
off, switching sections, changing theme, and refreshing Git never relaunch the
agent or remount its embedded terminal. One agent companion is active at a time.
The focused file list supports `[J/K]` / `[↑/↓]` to select a file, `[Enter]` to
focus its code preview, `[N]` to add a local project directory, and `[Esc]` to
return focus to the terminal. In the code preview, `[J/K]` / `[↑/↓]` scroll by
one rendered row and `[H/L]` / `[←/→]` by half a viewport; `[Esc]` re-enables
automatic follow, selects the newest file and returns to file navigation without
leaving Live Diff. Clicking the preview focuses it, while
clicking a file returns to file navigation. Its close and add controls are also
clickable. The Master Key's `[N]` still creates a terminal; it is not captured
by Live Diff.

The panel has a scrollable unified patch for the selected file, a scrollable
Files list, and a compact Info summary. Info shows `Show diff auto: true/false`
with theme-colored totals, additions, deletions, project and state; while code
is focused, it shows the contextual `[Esc]` action. Long code lines wrap inside the preview
and remain vertically scrollable. The Files list follows keyboard selection. Its
table rows align status, compact path, elapsed time, added and deleted line counts;
files are ordered by their latest detected change, newest first. The preview
automatically follows the newest file, pauses that follow when an older file is
selected, and resumes it when the newest file is selected again. A file that
disappears while selected returns the preview to newest-file follow mode.
Both automatic follow and manual selection retain the complete unified patch
with three Git context lines. Automatic follow scrolls the preview to the newly
edited line within the hunk whose changes differ from its prior snapshot, or
the last hunk when a file is first observed. Line-number shifts alone do not
move the preview. Manually selected files leave scrolling to the user. This
changes only Live Diff, not the Git Diffs tool.
New uses the palette's purple with a light sweep, Edit uses its warning yellow,
elapsed time and additions use the palette's blue, and deletions use its red.
The path shows the project, an omitted-ancestors marker and only the file's
immediate parent folder; folder names are middle-truncated to 12 display cells.
The full repository-relative path remains in the selected-file header. Info sums the current
changed files and textual additions/deletions across monitored roots and displays
the full path of the last root with a detected change. Counts are the final Git
worktree state against `HEAD`, not cumulative edit history: staged and unstaged
changes are not double-counted, and a commit can clear the list. Untracked text
files are included; binary, oversized, and mode-only changes have unknown line
counts instead of false zeroes. A repository without a commit treats present
files as additions. Very large patches show a non-text preview fallback.

On activation and every two seconds, discovery checks the launch/tmux path,
the recognized agent's process tree cwd where the OS exposes it, and Git-linked
worktrees. A path entered through `[N]` is resolved locally and need not be linked
to the launch repository. Up to four canonical roots are monitored. On macOS cwd
inspection uses `lsof`; on Linux it uses `/proc/<pid>/cwd`; Windows falls back
to known launch/tmux/manual paths. Remote SSH/container filesystems require an
explicit accessible local path. The file list is limited to the first 1,000
changed paths per root and visibly warns when truncated.

While its agent is running, one non-overlapping read-only Git round starts at
most every 500 ms. A separate one-second display timer advances elapsed labels
without rereading Git. Git commands use argv, bounded output/time, disable
optional index locks and external diff/textconv, and never stage, restore, commit,
write project files or read credentials. Closing the companion aborts its reads.
Agent exit stops the polling but retains the last visible snapshot; terminal
close, restart, or agent identity replacement releases that snapshot. These are
*observed repository changes*, not proof that the agent made them: pre-existing
edits and other processes in the same worktree can appear, and an agent can touch
an unobserved absolute path. The panel does not feed filesystem activity into
agent working/done classification.

## Native and tmux sessions

New terminals automatically use tmux 3.2 or newer when it is available on POSIX
(including WSL). Otherwise they use the native Bun PTY, including on native
Windows. No installation is required or performed. Both backends support shells,
custom commands, splits, agent observation and background execution across tool
switches. `TUIMINAL_TERMINAL_BACKEND=native` always uses the native backend for new
terminals; `auto` is the default. `tmux` requires a compatible installation and
reports absence instead of falling back.

Owned terminals are separate persistent windows in the shared tmux session
`tuiminal` on the stable server of the same name, which ignores the user's tmux
configuration. Each internal terminal embeds its own tmux client through a temporary
linked session so simultaneous windows retain independent selection; those client
sessions disappear on detach while the `tuiminal` session and its windows remain.
The private server keeps mouse mode enabled so the wheel enters tmux copy mode and
scrolls pane history while its client occupies the embedded terminal's alternate
screen. Native terminals use the embedded terminal's own bounded scrollback.
Tuiminal owns all workspace content splits and hides them with the Terminal tab.
Creating or splitting a terminal never changes the enclosing tmux layout; the
explicit pinned-sidebar helper described above is the only enclosing split owned by
this feature. The private server disables its status bar and prefix keys, forwards
pane titles, and retains dead panes until their final output and actual command exit
status have been collected. Once collected, an exited interactive shell and its
owned window are removed; a custom command keeps its dead pane and final output for
inspection and restart. The original command kind is stored on each owned window so
restoration preserves this distinction. Native launch arguments are passed unchanged. Fallback
occurs only during capability detection: a failed
detached launch is cleaned up and never rerun automatically in another backend.
Closing the application detaches the local clients and leaves the shared session
alive. Reopening Tuiminal discovers its windows and restores each as a section in
the Tuiminais folder. Explicit `[X]` destroys only the selected owned tmux window.

When Terminal mounts, Tuiminal restores its own persistent panes and automatically
discovers ordinary panes and recognized foreground agents on the default and
inherited tmux servers. Ordinary external panes enter the tmux folder; recognized
agents from every source appear exclusively in Agents. Discovery
repeats every two seconds after the previous scan finishes, including while another
tool is visible. Without compatible tmux it retries every 30 seconds and leaves
native terminals available. Identity uses the existing process-tree rules and
configured agent command names, never window names or transcript text.

Each newly discovered pane gets one mirror with its existing screen; no new agent
or shell is launched. The first mirror becomes visible in an empty workspace;
later discoveries preserve the selected terminal, keyboard focus, menus and dialogs.
Recognized running mirrors appear only in Agents; an owned pane returns to Terminal
when its agent ends, while an external pane returns to tmux. Linked windows
are deduplicated by socket and pane ID. The 12-terminal limit
still applies; remaining candidates can be added after space becomes available.
Closing a mirror dismisses that pane for the current execution, so the next scan
does not reopen it. Failed/disconnected mirrors remain visible instead of being retried repeatedly.
Set `TUIMINAL_TERMINAL_AUTO_MIRROR=0` before launching to disable external automatic
discovery; owned persistent panes are still restored. This is independent of the
backend for newly created terminals. Tests, documentation
captures and release smoke fixtures disable it unless using isolated discovery data.

On POSIX, a separate read-only scan groups foreign processes by controlling TTY and
lists them in the reserved Others folder. It excludes the TTY hosting Tuiminal,
Tuiminal-owned descendants and PTYs whose ancestry belongs to tmux, so Terminal and
tmux rows are not duplicated. Each row shows the foreground executable, idle/running
state, directory when `/proc` exposes it, and TTY identifier. These references do not
count toward the 12-session limit. Recognized agents move to Agents with unknown
activity because their external screen is unavailable. Since Tuiminal does not own their PTYs or screen
buffers, activating one reports its original TTY without replacing the active pane,
sending input or closing the external process. Windows returns an empty read-only
set until a console API can provide stable terminal identity. Set
`TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY=0` to disable this scan.

Automatic discovery mirrors individual panes on Tuiminal's named server, the default
tmux server and the inherited tmux socket, if present. The enclosing `TMUX_PANE`
is excluded to prevent recursion; linked windows are deduplicated by socket and pane ID.

A mirror reads the selected pane's current application screen before reporting a
connection. Changed screens schedule the next capture after 33 ms; unchanged
captures progressively back off to 250 ms. Delivered keyboard/paste input requests
an immediate capture, coalesced after any capture already in flight. Captures never
overlap or accumulate a backlog. These are scheduling intervals, not a guaranteed
frame rate: capture and rendering time still apply.

Identical snapshots skip parsing and rendering. A changed screen repaints from the
first changed row onward, retaining preceding text and its inherited colors;
cursor-only changes do not repaint the text. Viewport shifts and size changes
force a full repaint. Capture and keyboard input target the immutable
pane ID, independently of the original client's selected window or active pane.
No new shell, session, external split or attached client is created for a mirror.
A missing pane fails visibly instead of opening an empty replacement terminal.
Mirrors temporarily fit the source pane to the actual embedded viewport, after
subtracting the sidebar, application navigation, action menu and split separators.
The source application receives the new terminal dimensions and can redraw/reflow
its own interface. This changes its size in the original terminal too: one running
PTY cannot provide two independent application layouts.
tmux's [window sizing contract](https://github.com/tmux/tmux/wiki/Advanced-Use#window-sizes)
is the basis for this shared sizing behavior.

Sizing is coordinated per source window. Its existing pane IDs, split arrangement,
selection and zoom are retained. When several mirrors share a window, shared axes
use the smallest requested size; tmux's minimum pane sizes still apply. Window
dimensions, layout and the local/inherited `window-size` option are saved before
the first adjustment. Whenever an attached tmux client displays the source window,
Tuiminal suspends fitting, releases its temporary manual size and immediately asks
tmux to recalculate the window from the attached client. A pinned-sidebar pane
created after fitting is retained instead of being mistaken for a user resize,
including when tmux expands the manual window to keep the mirrored pane unchanged
while adding the helper. The content returns to the attached client's available
size without removing or shrinking the marked sidebar.
While visible, size and layout changes belong to the user.
After the last client leaves that window, Tuiminal adopts its latest state as the
new restoration baseline and fits the mirror again. The latest baseline is also
restored after the last mirror disconnects. Pending resizes are serialized/coalesced
and drained before restoration; failed cleanup stays registered for retry. A newer
manual source layout/size change takes precedence over an owned fitted layout.

A source window that also contains Tuiminal is left unchanged to avoid recursive
resizing of Tuiminal itself. The renderer retains clipping and cursor tracking for
that case, tmux minimum sizes, and frames arriving before an application redraws.
This is a sampled screen mirror: it does not import the original scrollback, tmux
status bar, copy-mode UI or mouse protocol. The original terminal remains the
place to use those features.

Keyboard input goes directly to the selected application; tmux prefix bindings are
not interpreted in the mirror. Input is serialized and never replayed on an uncertain
failure. Paste uses a temporary named buffer and the source application's bracketed
paste mode; only Tuiminal's buffer is cleaned up. Closing a mirror cancels pending
captures and queued input, restores its temporary sizing, and never interrupts or
kills the original process.
Different panes in one session can have separate mirrors. Restart is disabled for
borrowed panes; agent identity follows the mirrored pane's shell PID.

Terminals already open outside tmux cannot yet be mirrored. The read-only references
in **Others** expose their metadata and original
TTY without changing that limitation. Without tmux, new native terminals, splits,
agent observation and background execution remain available inside Tuiminal.
Arbitrary custom sockets and screen/input integration for unrelated terminals need
a separate integration; opening an empty shell is never presented as mirroring an
existing terminal.

## Agent recognition and activity

See [Terminal agent activity MVP](terminal-agents.md) for the maintained detector
contract, Herdr research, supported signals, state transitions and limitations.
A read-only process snapshot identifies agents from owned foreground jobs on
POSIX and owned descendant trees on Windows. Runtime entry points and configured
executable/module names also participate; arbitrary arguments and screen banners
alone do not identify an agent.

Local profiles cover Codex, Claude Code, Gemini, OpenCode and additional named
agents with recognizable live controls; a profile with no reliable idle signal
can remain unknown. Unseen completion appears as done until its pane is
viewed. The sidebar keeps split terminal items side by side in two-row panes, adds
state markers and colors, and shows every agent's state/activity in the separate agent list. Recognized
live activity rows can report reading, searching, thinking, writing or running.
Unsupported identified agents appear in the agent list with unknown activity.
Offscreen transitions into blocked or done notify once; clicking the card selects
the exact pane without submitting input or stealing keyboard focus.

Independent native observers follow the live screen even while the actual pane is
hidden or scrolled. No agent hooks, credentials, project files or integration
settings are changed. Recognition and activity are heuristic; registration of an
additional agent command gives it an identity, not a lifecycle profile.

## Resource ownership

Presentation never launches or restarts an existing PTY. Pane callbacks remain
stable across sidebar, settings and sibling updates. Each explicit launch/restart
uses a generation; only the current generation may write or update its session.
Restart waits for the previous owned process to retire. Closing or unmounting
invalidates pending launches. EOF draining, bounded stop escalation and global
shutdown retain the existing native process contract.

Local clients remain registered for shutdown, and pending detached launches remain
tracked through creation and failed cleanup. Per-terminal launch queues
cancel stale generations and wait for their cleanup before a replacement starts.
Closing Tuiminal retires its own native processes, removes temporary linked client
sessions and leaves the shared `tuiminal` session intact. Its windows are restored
on the next launch; external sessions are only disconnected. Explicit close
destroys one selected owned window and never kills a borrowed session.

Tests cover grouping, native input, Master Key capture/cancel/passthrough, mouse
selection, pinned in-app/tmux sidebars, direct helper navigation and focus signaling,
shared-session window ownership, reserved and persisted folder placement, settings,
split limits, stable agent folder placement, loader lifecycle,
activity and unread completion, hidden observers, finished-output retention and restart races.
Run focused coverage while implementing Terminal changes and include the complete
suite in the repository validation gate.
