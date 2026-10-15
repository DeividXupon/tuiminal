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
- Bracketed hints use the fixed `BRAND_COLOR`. Keys that open an action list use the
  fixed `ACTION_KEY_COLOR` purple: `shortcutContent` applies it to `[?]` automatically
  and to exact tokens passed as `actionKeys`, such as the configured Master Key. An
  explicit `shortcutColor` (muted or disabled states) still wins.
- Every visible keyboard action should have a mouse-accessible control where
  practical. Do not style logs, code, query results, or user data as shortcuts.

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

The HTTP response toolbar's Copy action uses the complete captured content of
the active view, independently of native text selection and the 50,000-character
display limit. Pretty copies formatted JSON or the complete JSONPath result;
Raw copies the captured text. Line numbers and folded summaries are display-only.
Headers copy without line numbers. Copy line retains its explicit search-match
target. The 1.5 MB capture limit still applies; truncated responses expose the
separate full-download action.

## Workspace surfaces

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
Rows marked with `[Space]` or `[Alt+Space]` have a subtle, palette-aware Database
tint across the table and SQL result grids. The active cell keeps its stronger
highlight, and pending-write colors remain visible underneath the row tint.

The application invalidates the renderer's comparison frame once when switching
tools or layout modes, resizing the terminal, or opening/closing its top-level
overlays. The next normal output flush repaints unchanged header cells and blank
gaps too. Routine native layout events from typing, status updates, scrolling and
animations keep incremental output; they must not trigger full-screen repaints.
Retained feature trees, PTYs and cursor state stay mounted and intact.

## Settings center

The global `[,]` modal uses a category/detail layout. At wide widths, a fixed
sidebar groups tool context, appearance, and general categories; the right pane
mounts only the selected category's choices or action. At narrow widths, compact
previous/next controls replace the sidebar and the detail keeps the available
width. Database-only and Git-only categories must remain hidden outside their
own context.

For standard settings, `[J/K]` and `[↑/↓]` select a visible category and render its
detail immediately; `[H/L]` and `[←/→]` change color mode, palette, layout, or
language without an intermediate `[Enter]`. Action categories open sensitive
terms, SQL history, tutorial, or official features when entered.

Only Git's contextual rows use a separate category/detail focus model. Diffs sits
under `GIT`, while the four GitHub-backed settings sit under `GITHUB`. The focused
Git row alone shows a trailing blue `[Enter]`; long labels truncate before that
hint, and `[Enter]` or `[L]` transfers keyboard focus to its rendered detail. A
fixed blue left rail marks the focused Git row or detail pane. Every category and
choice remains clickable, and the detail header shows automatic-save status
without turning it into another focus target.

## Notifications

`NotificationProvider` owns one right-aligned stack of at most three non-focusable
cards. The application anchors it to the bottom while Database is active, including
isolated Database mode, and to the top in other tools. Switching tools moves the
existing stack without recreating cards or restarting their timers.
Cards always use the compact four-row geometry: a single semantic left rail,
one header row, two message rows, and a thin `─` countdown line at the bottom. The layout does not
change between framed and compact workspaces. Information uses `BRAND_COLOR`, while
success, warning, and error use their palette semantic colors.

Every card has a finite lifetime, with errors lasting longest. The provider retains
the card during its horizontal entrance and exit animation. Hovering anywhere in
the visible stack pauses every retained dwell timer and freezes all countdown lines;
leaving resumes them from their remaining time. The mouse `×` starts the same exit
animation without taking keyboard focus. Timers are created only for cards retained
after deduplication and the three-card limit, and every dwell, exit, and frame timer
is released when its card or provider disappears.

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
- The owning feature must still consume `[Esc]` and action keys in its own keyboard
  scope, preserve layered input focus, and guard writes against repeated events.
  Do not put a global `useKeyboard` handler in the surface.
- Mount a modal only while open. A closed modal must not retain OpenTUI listeners.
- The shell is appropriate for centered, dimmed dialogs. HTTP's positioned approval
  layers and other layouts with distinct geometry remain separate until their
  ownership and focus behavior can be preserved by a shared primitive.

Current adopters include Git's discard, Inbox, PR and Issue action dialogs, PR and
Issue section editors, local/compare/remote branch and repository pickers,
creation dialogs; Runner's save and autostart trust dialogs;
Database's connection, cell editor, write review, table search, batch export,
favorites, and history dialogs; and CLI global settings and sensitive terms.
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
continue staging changes and requiring SQL review and confirmation.

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
