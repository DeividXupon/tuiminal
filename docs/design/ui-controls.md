# Shared controls and modal ownership

Tuiminal keeps one visual language without forcing every interaction into one
component. The common components live in `packages/core/src/ui/`; a feature owns
its keyboard scope, focus stack, data, and side effects.

## Actions

- Use `InlineButton` for a one-line labeled action. It supplies translation,
  bracketed shortcut coloring, disabled/active/selected state, and palette-aware
  compact backgrounds. Its optional `compact` override lets always-compact surfaces
  such as Term Agents keep their geometry and colors independent of global
  layout. Do not manually color a shortcut or translate a label only to pass it
  to `InlineButton`.
  An optional `backgroundColor` changes only its resting background; active,
  focused, selected and pressed highlights take precedence.
- Use `DirectionalButton` for contextual previous/next controls. Use the native
  tuiparts `Button` for selectable rows, cards, spatial hit targets, and controls
  whose interaction or layout is not a one-line action. Paint-only dimmers are
  plain boxes, not focusable buttons.
- Bracketed UI hints use fixed blue `BRAND_COLOR` (`#4B75FF`), including arrows,
  selected controls and disabled actions. `[?]` and the Terminal Master Key use
  fixed purple `ACTION_KEY_COLOR` (`#A855F7`); the Master Key is marked through
  `actionKeys`. Labels and backgrounds express availability and focus.
  Hints across all features share the Term Agents traveling highlight over their base
  color. One clock animates visible hints; hidden retained workspaces pause their
  subscriptions, and the clock stops when no animated text remains.
  Legacy color arguments remain accepted for feature compatibility but do not
  override the base color. Active HTTP and Runner tab close controls explicitly use
  red `[X]` through `shortcutBaseColor`, retaining the shared animation. Use `ShortcutText` for
  instructional text containing keys.
- Every visible keyboard action should have a mouse-accessible control where
  practical. Do not style logs, code, query results, or user data as shortcuts.

The Database connection form cycles MySQL, PostgreSQL, SQLite and MCP tabs with
`[A←]` / `[F→]` outside text inputs, wrapping at either end and focusing the selected
tab. `[Esc]` leaves the input before tab navigation; typed letters remain input text.
External connection completion keeps its driver fixed and hides the navigation hint.

HTTP request and response titles expose clickable `[R]` and `[Shift+R]` controls.
The corresponding keys focus the request or response pane outside text inputs,
editors, modal dialogs and controls that own a contextual shortcut.

The Database connection form's `[Ctrl+W]` toggle keeps its localized `READ-ONLY`
label in both states. Its filled marker means read-only is enabled; new profiles
start checked. Pressing the shortcut or clicking the control clears the marker
and enables writes, and toggling again restores read-only mode. Saved profiles
reflect their stored access mode. MCP remains checked and disabled; external
profiles keep their existing access policy.

## Global tool navigation

`[Alt+1]` through `[Alt+5]` select Database, Git, Runner, HTTP and Term Agents.
The CLI accepts OpenTUI's `meta` and `option` modifiers with both Kitty and legacy
terminal input. Some macOS terminals send `¡`, `™`, `£`, `¢` and `∞` instead;
these exact characters are aliases for the same five shortcuts, even when no
modifier survives. This also works when the macOS terminal connects to another OS.

Aliases use the same global focus guard as Alt shortcuts. Focused inputs, editors,
PTYs, pickers and modals retain their input; isolated tools cannot switch features.
Ctrl/Shift/Super combinations and unmodified digits do not select tools. Bracketed
paste remains text and does not trigger navigation. The Term Agents Master Key
menu accepts the same aliases when its search field is unfocused.

## Text selection and clipboard

`SelectionClipboard` wraps the application in both full and isolated modes. Drag
with the primary mouse button to select native text, then press the secondary
button to copy the exact selection through the renderer's OSC52 clipboard. Empty
selections and a drag still in progress do nothing. A successful local write clears
the selection and shows a notification; a rejected or throwing write keeps it for
retry. This does not install a keyboard handler or change `[Ctrl+C]` ownership.
Child controls that consume a mouse event retain ownership, including embedded
terminal programs using mouse reporting. Password inputs expose only mask characters
through their native selection API, never their underlying value.

Database connection inputs support `{NAME}` references to exported variables inherited
by Tuiminal, including name, host, port, database, user, password, SQLite path and MCP
executable. Typing an opening brace offers variable names only. `[↑/↓]` selects a
suggestion, `[Tab]`/`[Enter]` accepts it without leaving or submitting the field, and
`[Esc]` dismisses suggestions before unwinding input/modal focus. Clicking a suggestion
also accepts it. Password text remains masked. Resolution is a single literal
substitution at connection time, never shell execution; missing variables and invalid
ports prevent connecting. Saved fields retain references, and password references use
the existing credential store/session policy. External profiles remain session-only.

The HTTP response toolbar's Copy action uses the complete captured content of
the active view, independently of native text selection and the 50,000-character
display limit. Pretty copies formatted JSON or the complete JSONPath result;
Raw copies the captured text. Line numbers and folded summaries are display-only.
Headers copy without line numbers. Copy line retains its explicit search-match
target. The 1.5 MB capture limit still applies; truncated responses expose the
separate full-download action.

HTTP response metadata uses bounded, styled native table documents. Raw and
non-JSON Pretty bodies have line/content columns; binary bodies show metadata.
Headers preserve duplicate fields. Timing reports measured headers/download/total
and their percentages, never invented DNS/TCP/TLS timings. Summary, masked cookies,
redirects, assertions and derived diagnostics have dedicated columns. Below 60
content columns, multi-column records stack into field/value rows without dropping
fields. Colors distinguish keys, values, successes, failures and warnings in both
light and dark palettes. JSON tree rendering and navigation remain unchanged.

Tables wrap at grapheme-safe word boundaries, keep search offsets mapped to their
logical cells through resize, and reset scroll when changing tabs. Their formatted
preview is capped at 50,000 characters; Copy uses full source rows. Search and Copy
are available on every response tab; body saving remains on Pretty/Raw. Wrap,
line-number, folding and JSONPath controls apply to the JSON body renderer, while
other tables wrap automatically. The Cookies tab masks values in both display and copy.

Editable HTTP request tables use the same visual hierarchy as response tables:
accented column headings, alternating row backgrounds, and distinct key/value
colors. Query, path, headers, form and multipart share measured integer column
widths so saved rows, draft inputs and headings stay aligned. Multipart reserves
a fixed type column sized for the full Text/File labels; enable/delete actions keep fixed widths. Disabled entries
are dimmed, and each section reports enabled/total counts. A single focus rail
replaces nested panel borders. Contextual shortcuts live below the table; empty
sections remain compact outside Params. Query and Path Params each occupy half
of the available height, including empty and editing states, with independent
scrolling. An odd terminal row is assigned to one half. Selection and resize reveal the active row without
remounting editors or changing drafts.

HTTP request variable completion is shared by URL, query/path and header names/values,
authentication fields, raw bodies, form/Multipart text fields, and proxies. Typing
`{{` opens suggestions directly below the native cursor, including wrapped/scrolled
editors; placement clamps horizontally and moves above when there is no room below.
The list shows four candidates at a time and scrolls with selection. Scope badges
use blue `E` for the active environment, green `G` for globals, and brown `C` for
collection variables; request-local `R` and built-in `$` use neutral badges. Only
the winning value of an overridden name appears. A `▌` marks the selected name and
its value on the next line. `[↑/↓]` selects, `[Tab]` inserts `{{name}}`, and `[Esc]`
dismisses without leaving the editor. Mouse completion also preserves focus. Native
password fields remain masked. Documentation, scripts and search inputs do not use
this menu. Completion preserves text around the cursor and consumes existing closing
braces; request preparation resolves both field names and values.
Complete references use light-blue native syntax highlights without replacing input
buffers or unmasking password controls. A mouse or text cursor dwelling on a resolved
E/G/C reference for 1,000 ms opens its scope badge and editable value below that position.
`[↓]` enters the value; `[Esc]`, Enter or Tab saves and restores the request editor.
Clicking elsewhere after editing also saves. Unchanged values do not trigger writes.
Writes target the scope captured on opening, use local credential storage for E/G or
the collection's `.http` variable for C, and use confirmed API writes for Postman.
Failures retain the value and allow retry; accepted but unconfirmed writes are not
blindly replayed. Local collection edits preserve request bytes and rebase only
matching source hashes, retaining open request drafts and their unsaved state.
Observers, highlight references and dwell timers are released with their owning inputs.

HTTP authentication, Assertions and Chaining use scrollable sections with
labels above inputs. Authentication groups credentials by type and masks tokens,
passwords and API key values with `PasswordInput`; selecting the current type
preserves its values.
Assertions and extractions use labeled rows with always-visible Add controls;
only the focused pane advertises `[N]`. Adding focuses the new field; `[Ctrl+D]`
removes its row. `[N]` works from empty row selection too. In authentication,
`[Enter]` enters the active form, `[Tab]`/`[Shift+Tab]` cycles its inputs, and
`[Esc]` returns to pane navigation. Focus and viewport resize reveal
the edited field without remounting it. Preview keeps redaction and groups
prepared metadata, headers, variables and body; origin labels sit above values
so long content can use the full width.

HTTP More → Assertions enters row selection when assertions exist. `[J/K]` or
`[↑/↓]` selects a row, and `[Enter]` focuses its expression. `[Esc]` or `[Enter]`
leaves editing and restores selection on that row; `[Tab]`/`[Shift+Tab]` leaves
editing and selects the next/previous row. Clicking a field opens it for editing.
Deleting selects a surviving neighbor, including when deleting from an input.
Examples and contextual shortcuts stay in a fixed footer below the independently
scrolling rows; the Add control remains above them. Selection and resizing reveal
the active row without replacing its input or changing its expression.

HTTP More → Chaining separates Before sending from After the response. The
previous-request picker searches by name, method or collection, stores stable IDs,
rejects cycles and restores selection on `[Esc]`. The form shows the execution
order and includes open drafts. Extractions choose JSONPath, response header or
HTTP status, with secret, enable/disable and delete controls. Last-response previews
validate scalar values and mask secrets, including public aliases of secret values.
Values belong to the current run and can be reused as `{{variable}}` downstream.
`[J/K]` or `[↑/↓]` moves between dependency and extraction rows; `[H/L]` or `[←/→]`
selects fields/actions; `[Enter]` edits or activates. `[Esc]`/`[Enter]` restores
selection after editing; `[Tab]`/`[Shift+Tab]` moves between name and path, then
returns to selection on the adjacent item. Add and the contextual footer stay
outside the scrollable rows. Resize preserves draft, input identity and selection.

HTTP More → Options has three selectable blocks. `[J/K]` or `[↑/↓]` selects
Options, Identity or Actions. The active Options or Identity heading shows a clickable
`[Enter] Select` before entry and `[Esc] Exit` while selecting items or editing input.
Options uses alternating table rows for transport
settings, followed by a labeled proxy input. `[Enter]` enters row navigation;
`[J/K]` or `[↑/↓]` selects an item, and `[Enter]` changes it or edits the proxy.
Identity puts Name and Method side by side with inline labels; `[Enter]` enters
field selection, `[H/L]` or `[←/→]` selects a field, and `[Enter]` starts editing.
`[Esc]` leaves input, then item navigation. `[Tab]`/`[Shift+Tab]` cycles text inputs.
Actions stay pinned below the scrolling content, in one horizontal strip with
alternating button backgrounds. Selecting that block immediately enables `[H/L]`
or `[←/→]` navigation and `[Enter]` activation, without another entry step. Narrow
strips scroll to reveal the selected action. The selected transport row shows a
clickable `[R] Default` action. `[R]` resets only that row: timeout and redirects
return to inheritance, cookies and history are enabled, and TLS verification is
strict. The reset is unavailable outside row selection and never consumes input
text. Actions have no individual letter shortcuts; mouse controls follow the same selection.
Focus and resize reveal the selected item without remounting inputs.

HTTP Body → File uses a native file chooser above a dotted drop area instead of
a path input. The chooser and drop area accept multiple files. Selecting one file
in File keeps a raw body; selecting several switches to Multipart in one update,
with one editable `file` field per attachment and an individually removable row.
Multipart also offers the chooser and drop area; additions preserve existing
text fields and files. Field names can repeat and must match the receiving API.
The drop area compresses to one row in short Multipart panes to keep the table usable.
`[Enter]` opens the chooser, `[Backspace]` removes the raw-file selection,
and `[Tab]` cycles its controls. Dropped paths support terminal bracketed paste
and ordinary text, including quoted path lists, escaped spaces and local file URL lists.
Only the focused, visible file body handles them. Plain shortcut keys keep their
normal actions; raw path capture starts only with a path prefix or a complete
path chunk, and never interprets an isolated letter as a file. `[A/F]` and `[Z/V]`
keep navigating; global settings and quit remain available from file controls.
Cancelling preserves the
selection; changing documents or leaving the body closes its owned chooser and
ignores late results. macOS uses its native file dialog, Windows uses OpenFileDialog,
and Linux uses Zenity or KDialog when installed; drop/paste remains available
without a desktop chooser. Selected filenames and paths are plain user data.
File and multipart bodies accept readable regular files from any directory,
including symlinks, with the existing 256 MB limit. Relative paths still use the
HTTP home in the TUI and the explicit execution root in headless commands.
Multipart transport regenerates its boundary when sending saved or imported
requests. Postman imports retain every source file in a form-data field.

## Workspace surfaces

The CLI composes `MouseTrailSurface` around the full and isolated application.
Mouse movement displays a solid block and leaves at most twenty-four ASCII
particles (`+`, `:`, `.`), fading over 650 ms with at most one cell of drift.
A native post-process paints particles only in blank, unstyled cells. The block
uses the theme text color with contrasting ink, preserving the covered glyph and
its full display width. It stays visible when stationary without requesting live
frames; the operating system's pointer remains visible too. Text and wide glyphs
stay intact.
The trail passively observes the native input stream with OpenTUI's streaming
parser, including fragmented reports and bracketed-paste framing. It has no hit
targets and never consumes mouse or keyboard events. Its final compositing covers
notifications and embedded terminals even when children stop event propagation.
Clicks, scrolling and selection keep the effect active; selection and embedded
program input retain their native behavior. Typing, paste, resize and terminal
blur clear it; the next mouse event restores it without a focus-changing click.
It requests live frames only while particles remain and releases its renderer and
input subscriptions on unmount. Theme colors are read without remounting children.

Top-level application, feature, installer, loading, and tutorial workspaces use
`LAYOUT.workspaceBackground`. It resolves to `COLORS.panel` in framed mode so outer
padding and gaps match the bordered panels, and to `COLORS.canvas` in compact mode.
Term Agents is an always-compact exception and uses `COLORS.canvas` in both modes.
Internal editor, code, log, input, dimmer, and raised-panel surfaces keep their
explicit palette colors because those contrasts communicate structure or state.

Database workspaces and their tutorial keep outer padding only on the horizontal
axis, so bordered panels fill the available height without empty rows above or below.
The table footer uses a top divider in place of an empty row. Its selection and
editing actions use `space-between` to distribute the available width.

The Database tutorial uses the same table header, metadata, grid rows, inspector,
SQL tabs, connection list and schema renderer as the workspace. Its steps switch
between simulated table views, the SQL editor, the connection manager, selection,
staged writes, export and review. The inspector stays inside the data area and
replaces the grid below the workspace's inspector breakpoint. SQL belongs to the
query workspace; the table view has no separate executed-query banner. Fixtures
are memory-only; live services, writes and dialog keyboard handlers never run in
the demo. Entering the tour retains existing SQL buffers behind the demo, and
highlight discovery ignores hidden live targets.

Rows marked with `[Space]` or `[Alt+Space]` have a subtle, palette-aware Database
tint across the table and SQL result grids. The active cell keeps its stronger
highlight, and pending-write colors remain visible underneath the row tint.

Visible scene changes use core's `WorkspaceRepaintBoundary` or
`useWorkspaceRepaint`: tool and internal tabs, layout modes, terminal resize,
modal/loading surfaces and asynchronous scene replacements. Requests on the same
renderer coalesce. After the transition's first successful native frame, one
recovery frame invalidates the comparison buffer and repaints unchanged header
cells and blank gaps through the normal output flush. There is no separate ANSI
clear, delayed timer or tree remount. Renderer destruction releases pending work.
Visibility propagates through retained boundaries independently of keyboard focus;
hidden descendants do not request recovery for background changes.

Transition keys describe visual identity, not text, cursor, scroll, logs, progress
or animation frames. Those updates keep incremental output. Retained feature trees,
PTYs, editor buffers and cursor state stay mounted and intact. New scene-switching
surfaces must use the same core lifecycle; native layout events alone are not
transition signals.

## Settings center

The global `[,]` modal uses a category/detail layout. At wide widths, a fixed
sidebar groups tool context, appearance, and general categories; the right pane
mounts only the selected category's choices or action. At narrow widths, compact
previous/next controls replace the sidebar and the detail keeps the available
width. Database-only and Git-only categories must remain hidden outside their
own context. Term Agents alone includes **Agent sounds**, with per-event selection,
mute, and preview controls; `[1/2/3]` selects the event and `[P]` previews its sound.

For standard settings, `[J/K]` and `[↑/↓]` select a visible category and render its
detail immediately; `[H/L]` and `[←/→]` change color mode, palette, layout, or
language without an intermediate `[Enter]`. Action categories open sensitive
terms, SQL history, tutorial, or official features when entered.

Every palette supports Dark and Light independently of layout. Galaxy maps the
[Posting palette](https://github.com/darrenburns/posting/blob/main/docs/stylesheets/palettes.css)
to the shared UI colors in Dark mode; its Light variant is a Tuiminal adaptation.

Only Git's contextual rows use a separate category/detail focus model. Diffs sits
under `GIT`, while the four GitHub-backed settings sit under `GITHUB`. The focused
Git row alone shows a trailing blue `[Enter]`; long labels truncate before that
hint, and `[Enter]` or `[L]` transfers keyboard focus to its rendered detail. A
fixed blue left rail marks the focused Git row or detail pane. Every category and
choice remains clickable, and the detail header shows automatic-save status
without turning it into another focus target.

## Notifications

HTTP action notices publish directly to the notification center, including repeated
messages. They never replace the workspace footer's contextual shortcuts.

`NotificationProvider` owns one right-aligned stack of at most three non-focusable
cards. The application anchors it to the bottom while Database is active, including
isolated Database mode, and to the top in other tools. Switching tools moves the
existing stack without recreating cards or restarting their timers.
Cards always use the compact four-row geometry: a single semantic left rail,
one header row, two message rows, and a thin `─` countdown line at the bottom. The layout does not
change between framed and compact workspaces. Information uses `BRAND_COLOR`, while
success, warning, and error use their palette semantic colors.

Every informational card has a finite lifetime, with errors lasting longest. The provider retains
the card during its horizontal entrance and exit animation. Hovering anywhere in
the visible stack pauses every retained dwell timer and freezes all countdown lines;
leaving resumes them from their remaining time. The mouse `×` starts the same exit
animation without taking keyboard focus. Timers are created only for cards retained
after deduplication and the three-card limit, and every dwell, exit, and frame timer
is released when its card or provider disappears.

`ConfirmationNotification` is a separate, caller-owned action card above the
notification stack. It has no expiry or countdown, takes keyboard focus, blocks
outside clicks, and pulses its border while awaiting a decision. `[Enter]`
confirms by default, `[Esc]` declines, and mouse buttons offer both decisions;
`[Tab]` or horizontal arrows select a button. Decisions cannot repeat while an
asynchronous action runs. The caller handles action errors and closes the card;
if an action fails and the card remains mounted, it can be retried or declined.
Closing restores the previous live control, or an explicit fallback when that
control was removed. The animation timer is released on unmount. Feature callers
register the card and button IDs in their keyboard scope and mount it only while
the decision is active. HTTP collection, folder, and request deletion use it, as
does refreshing a linked Postman collection after a folder or copy conflict.
The refresh decision preserves the inline draft and restores its focus; updating
the local copy does not automatically repeat the original action.

## Modal surfaces

- `ModalSurface` owns only the centered rounded dialog, dimmer, z-order, and an
  outside-click target. Its caller supplies dimensions, accent, close behavior,
  content, and optional dialog ref. Only a primary-button press on the hit-tested
  outer layer dismisses it; clicks inside the dialog do not bubble into dismissal.
  The lower dimmer is paint-only and must not become a second focusable button.
  Use `positionRelative` only when a dialog owns an absolutely positioned child,
  such as a dialog-owned loading overlay. Use `dialogFocusable={false}` when
  an existing modal assigns focus exclusively to its child controls; the feature
  still owns its keyboard scope. `layerId` and `layerFocusable` preserve an
  existing full-screen focus owner when needed, as in the sensitive-terms editor.
- Short forms and confirmations opt into `fitContent`: native layout measures
  their content (including wrapped text), with `height` as the upper bound.
  Do not reserve empty rows for absent fields or push actions down with unused
  fixed height. Scrollable pickers bound their height by their visible item count;
  editors retain enough room for editing and long lists retain scrolling.
- The owning feature must still consume `[Esc]` and action keys in its own keyboard
  scope, preserve layered input focus, and guard writes against repeated events.
  Do not put a global `useKeyboard` handler in the surface.
- Mount a modal only while open. A closed modal must not retain OpenTUI listeners.
- The shell is appropriate for centered, dimmed dialogs. HTTP composes it through
  `HttpDialog`, which bounds dimensions to the terminal and standardizes its header.
  HTTP keeps its approval layer, focus restoration, busy guards and keyboard handlers;
  outside clicks are blocked and never approve or discard a draft. Form actions wrap
  in narrow dialogs. Environment creation selects Name without editing; Enter or a click edits it.
  While editing, Tab enters the first variable; Global starts at its first variable.
- HTTP confirmations, file actions, imports, conflict/history comparisons and Postman
  pickers use contextual left-rail sections and a separate action footer. Footer rows
  measure translated labels by display width, retaining full shortcuts and using
  localized short labels when necessary. Destructive actions retain semantic colors.
  Long form bodies measure their natural height inside a bounded scroll viewport;
  focus changes and resizing reveal the active field without replacing its native
  input or draft. Body scrolling never moves the footer. Compact cURL previews leave
  room for the editor; short conflict dialogs scroll their context and diff together.
  Import review presents separate imported/skipped/warning/conflict counts. Postman
  destinations and environments render names as plain user data, with selection
  distinct from shortcut hints. Response comparisons identify both sides above the diff.
- The HTTP collection runner starts on its target control. `[Tab]`/`[Shift+Tab]`
  traverse target, parallel cases, optional dataset, approval, results, Run and
  Close. `[D]` focuses the dataset outside inputs. Enter there focuses Run;
  `[Ctrl+Enter]` runs explicitly. Short dialogs scroll configuration and results
  above a fixed status/action footer. Idle dialogs omit empty results. Target and
  parallelism controls are locked during execution; plain input text stays literal.
  `[Esc]` releases dataset editing first, then cancels a running collection while
  retaining its dialog, configuration and results for retry. When idle, `[Esc]` closes it.

Current adopters include Git's discard, Inbox, PR and Issue action dialogs, PR and
Issue section editors, local/compare/remote branch and repository pickers,
creation dialogs; Runner's save and autostart trust dialogs;
Database's connection, cell editor, write review, table search, batch export,
favorites, and history dialogs; HTTP environment, import/export, collection runner,
Postman, file actions, conflict, history comparison and approval dialogs; and CLI
global settings and sensitive terms.
The shared surface intentionally does not
standardize their content or keybindings. The Git creation dialog retains its
feature-owned busy-state close guard, and its child picker uses a higher layer.
Git PR and Issue query/section editors share
`GitRemoteSectionEditor`, including focus stack, autocomplete placement, fields,
and footer. PR and Issue wrappers still supply their own allowed columns,
option parsing, query kind, and callbacks.

`ActionPalette` is the shared `[?]` action list for feature workspaces: search,
colored tags and unavailable rows with translated reasons. An optional `side` column
takes one third of the width with equal-height feature-owned blocks; rows share one
selection, and labels are user data that are never translated or styled as shortcuts. Features supply ordered
actions (`action-palette.ts` helpers), mount it only while open, register its dialog
and `-search` IDs in their keyboard scope, block their own handlers while it is open,
and restore focus before running the chosen action. An action may declare a direct `key`
that runs it while the search is unfocused; palette navigation keys always win.
An empty search field shows the localized `[/] Search` hint while unfocused and
its search placeholder while focused. Keyboard and mouse focus update the hint
without replacing the query.
Action palettes and the Master Key omit instructional footers; their lists use the
available height while action shortcuts remain on the controls themselves.
`FocusSelectionOverlay` paints "choose a box" targets; `focus-navigation.ts` owns
the spatial movement shared with Term Agents. Adopters: Git Diffs, and the PR,
Issues and Inbox tabs through `useGitRemoteActionPalette`; Database catalog and SQL
workspaces; and Runner. Database and Runner share `useActionPalette` for mounted
modal lifetime and focus restoration, while supplying their own opening key,
fallback focus, availability rules and guarded action callbacks. Dimension listeners
exist only while the palette is mounted. Database SQL retains literal `?` in its
editor; its `[?]` button opens the palette while editing. Database `[M]` selects
visible catalog, table and inspector boxes, or SQL editor, result and inspector
boxes. Arrows or `[H/J/K/L]` move the highlight; `[Enter]` or a click focuses the
box, and `[Esc]` or `[M]` cancels. Text inputs retain literal `m`; the `[M]` button
and the palette expose the same action while editing. Database write actions
continue staging changes and requiring SQL review and confirmation. HTTP also uses
`ActionPalette` for `[?]` (with `[F1]` as an alias) and `[M]` for visible URL,
collection/environments, request and response boxes. The footer buttons expose both
controls while editing; text fields retain literal `?` and `m`. `[Shift+M]` cycles
the HTTP method. Closing the action palette or cancelling box selection restores
focus, and hidden panes are excluded from spatial navigation. The active HTTP tab has a red `[X]` close control (an explicit exception to blue shortcut hints); inactive tabs retain `×`. X outside editors closes the active tab through the existing unsaved-change guard. HTTP split resizing uses `[+]` to increase and `[-]` to decrease, outside text editors. HTTP tabs show `[1]` through `[9]` and scroll horizontally to keep the active tab visible while source and New remain accessible. Outside text fields, those number keys select a tab; narrow pane selection uses `[M]`, `[Tab]` or the pane buttons. Opening a seventh document replaces the last, confirming unsaved changes and retiring its running request. Body/auth selectors and response actions wrap within narrow panes instead of clipping controls. Minimum-width layouts place collection/environments selectors on a second row. Empty request tables expose Add before focus; populated tables expose Edit. Pending responses use an `[Esc]` `InlineButton` for cancellation. Escape releases focused editors/controls and navigation before cancelling the active request. `[W]` outside editors opens cURL export; `[Ctrl+W]` remains a close-tab alias. The method control shows `[Shift+M]` beside its value.

HTTP environment tabs use a visible cell selection: arrows or `[H/J/K/L]` navigate,
`[Home/End]` reaches the first/last row and scrolls it into view, and `[Enter]` edits.
While editing, horizontal arrows remain text cursor controls, vertical arrows select
an adjacent row, `[Tab/Shift+Tab]` advances fields, and `[Esc]` or `[Enter]` returns
to the table. `[N]` selects the blank row and `[Del]` removes the selected variable.
From the table, Tab visits Save, Use environment, Delete environment and Name;
read failures expose Retry in this same cycle. Escape returns from an action to the
table, then to the environment list. The list shows a cursor and follows arrows,
`[J/K]`, Home/End and Tab through environments and actions; Enter opens/activates
its focused item. `[→]` or `[L]` opens/focuses the selected environment's table.
At the first variable, `[↑]` or `[K]` selects Name in blue without editing;
`[Enter]` or a click starts editing, and `[↓]` from Name returns to the table.
Name is a single selection above the grid; Up clamps there and Delete does not
remove a variable. `[←]` or `[H]` from the variable column or selected Name returns
to the environment list, preserving drafts. Horizontal arrows and literal H stay
inside an active text editor. Global has no editable name.
Browsing controls allow application shortcuts such as `[,]`, `[Q]` and tool switching;
only environment inputs, menus and confirmation dialogs own text keys. Escape
gets a chance to unwind the local selection before application exit. `[M]` includes the visible
environment table, and cancelling selection restores the previous live field and draft.
Each named environment row exposes a blue `[A]` button and shortcut. Its anchored
menu contains exactly Use environment and Delete; Enter applies the selected action,
arrows/Tab change selection, and Escape/A or an outside click closes it. The menu
owns keyboard focus and stays within the viewport. Delete can load an unopened
environment for confirmation without adding a tab; cancellation and failed reads or
writes preserve existing drafts. Global is always active and has no deletion menu.
`[C]` and `[E]` switch sidebar sections outside text fields.
`[Alt+←/→]` (including Option/Meta terminal encodings) switches request/environment
tabs, including from environment inputs, preserving unsaved text. All input hints
are contextual, and lists/tables reveal focused items in narrow layouts.

The HTTP Body textarea highlights JSON and XML with the bundled grammars; TEXT
clears syntax coloring. Native highlight ranges account for Unicode graphemes and
tab stops without replacing the buffer, cursor, selection, or undo history.
`[Tab]` inserts two spaces in the body and never cycles panes; `[Shift+Tab]` also
stays in the editor. `[Esc]` releases editor focus, after which normal pane
navigation applies. `[Ctrl+Enter]` retains its send action. Parser work is debounced
and limited to the first 50,000 characters; the complete body stays editable and
is sent unchanged. Hidden editors do not parse, and stale results cannot repaint
after content/type changes or unmount. Pending timers and theme listeners are
released with the editor.

The request **More → Docs** subtab uses `[Z←]`/`[V→]` navigation and retains
its Markdown preview, editor draft, cursor and scroll across tab changes.
`[Enter] Edit` enters the editor and `[Esc] Preview` returns without discarding edits.

The request **Scripts** tab retains two native JavaScript textareas, **Pre-request**
and **Post-response**, in nested tabs with one editor visible at a time and the
same bounded syntax highlighting as Body. Outside text editing, `[Z←]`/`[V→]`
cycle phases. The blue `[Enter] Edit` and `[Esc] Exit` hints remain visible;
Enter edits and Escape returns to phase selection. `[Tab]` inserts spaces. Literal shortcut characters remain
editable. Tabs, resize, execution failures and failed saves preserve both drafts.
The official Postman sandbox runs each phase in an owned, cancellable worker with
a two-second execution deadline. Pre-request failure stops transport; post-response
failure becomes a failed assertion while retaining the response. `pm.test` and
`pm.expect` feed response assertions. Environment, global and collection mutations
are volatile workspace session values, with isolated scopes and no automatic API
writes. Saving the request persists both sources, using a validated JSON directive
in Local and request script fields in Postman. Collection/folder events remain
unsupported; additional scripted requests, Vault, Visualizer, external packages
and execution flow control are disabled. These are not a complete Postman Runtime.

Entering Local or Postman focuses the collection sidebar, including in narrow
layouts. Explicit new requests and initial URLs focus the URL input.

The HTTP workspace/collection pane widens while navigation owns focus and returns
to its normal width when focus moves to the URL, request, or response. Fixed
layouts reserve at least 42 columns for each visible editor; narrow navigation
overlays stay inside the viewport, and minimum layouts already use its full width.
Width changes preserve tree selection, mounted inputs, drafts, and the document's
request/response split ratio. Anchored menus follow the row after layout updates
and release their frame listener when closed.

The HTTP collection tree shows `[A]` on the selected row while the pane owns focus.
It opens an anchored, viewport-bounded menu. Right-clicking a row selects it and
opens the same menu without expanding a branch or opening a request. Collections and folders offer Add
request, Add folder, Rename, Duplicate, and Delete; requests offer Rename, Delete, and
Duplicate. Collections also offer Run collection, which opens the runner scoped
to that file, regardless of the current tree search or collapsed folders. `[T]`
cycles only requests in that collection, and `[Ctrl+Enter]` starts execution.
Opening the menu or runner sends no requests. Empty collections never fall back
to running another collection. Local directories also offer New collection. Arrow keys or `[J/K]` select an action, `[Enter]` applies it, and `[Esc]`
or an outside click dismisses the menu without activating the row underneath.
Rename replaces the name in its original row with a prefilled input. Adding a
folder or request expands its parent and inserts a blank input in the tree;
duplicating inserts a sibling draft with a suggested name. The input retains
indentation and the request method in a single row, with no save/cancel buttons
or keyboard hints. `[Enter]` saves and `[Esc]` cancels without writing. Empty names cannot submit; repeated submissions are
blocked while a mutation is pending. Submitting mounts an animated inline loader
beside the name immediately, preserving the input and its single-row geometry.
Typing and pasting cannot change the name during that save. Success removes the
draft; failure stops the loader and keeps the name editable for retry. Its timer
is released on completion or unmount. Deletion uses the focused confirmation
notification without inserting a form or shifting the tree rows. Folder and
collection names use the theme’s main text color when they contain requests;
only empty branches use muted text. Linked Postman collections display their
original names, not normalized `.http` filenames. Search and inline rename
inputs use these names; paths and row IDs remain stable storage identities.

The workspace heading is a selectable tree root in both Local and Postman modes. `[Home]`, or
`[↑]` from the first collection, selects it; `[↓]` returns to the first collection.
`[A]`, `[Enter]`, or a right-click opens its menu. Local offers New collection,
New folder, and Import collection; Postman offers New collection and Select
workspace. In Postman mode, New collection adds
an inline name input in the active workspace; Select workspace opens the existing
chooser. Cancelling that chooser preserves the active workspace.
The former Commands control and its tree-only `[N]`, `[Shift+N]`, `[P]`, `[E]`,
`[D]`, `[I]`, `[O]`, and `[R]` bindings are removed. These keys do not launch
actions while the tree owns focus. Search, navigation, and shortcuts belonging
to other panes or dialogs retain their existing behavior.

Git configuration is intentionally embedded in the global settings detail pane.
Its lists, local-target picker, and PR/Issue section editor replace that pane while
retaining feature-owned focus and write guards; they are not `ModalSurface` adopters.

The Git tutorial mock dialogs expose step-specific target IDs and paint only a
simulated state. They keep their own noninteractive dimmers: they are not live
modal keyboard/focus owners, and do not justify tutorial-specific branches in
`ModalSurface`. Feature uninstall is a content-height confirmation with its own
semi-transparent overlay and synchronous keyboard guard; HTTP and unsaved-exit
layers are positioned without this fixed centered dimmer. Do not force those
different geometries or keyboard policies through the shared shell.

### HTTP OAuth2 controls

Auth includes OAuth2 with Client Credentials and Authorization Code + PKCE. The form
uses the existing labeled fields, masked client secret, variable completion and
Tab/Shift+Tab navigation. Token controls remain below the scrolling form: Ctrl+T
acquires, Ctrl+R refreshes, and Escape cancels the owned acquisition outside text
inputs. These keys apply only to the active Auth pane. Login links use ordinary data
text, with explicit Open browser and Copy link actions. Failed/canceled authorization
preserves configuration; issued tokens are never shown or serialized.
